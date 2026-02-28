import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import api from '../lib/api';
import { formatGuidForOData } from '../lib/validation';
import { formatDateTime } from '../lib/dateUtils';
import ScreenshotUploader, { Attachment } from '../components/ScreenshotUploader';
import { useToast } from '../hooks/useToast';

const submissionSchema = z.object({
  Title: z.string().min(1, 'Title is required').max(200, 'Title must be 200 characters or less'),
  Type: z.enum(['Bug', 'Enhancement', 'Question'], {
    required_error: 'Please select a type'
  }),
  Priority: z.enum(['Low', 'Medium', 'High', 'Critical']),
  Status: z.enum(['Open', 'InProgress', 'Resolved', 'Closed']),
  Description: z.string().optional().nullable(),
  StepsToReproduce: z.string().optional().nullable(),
  ExpectedBehavior: z.string().optional().nullable(),
  ActualBehavior: z.string().optional().nullable(),
});

type SubmissionFormData = z.infer<typeof submissionSchema>;

interface SubmissionAttachment {
  Id: string;
  SubmissionId: string;
  FileName: string;
  ContentType: string;
  FileData: string;
}

interface Submission extends SubmissionFormData {
  Id: string;
  CreatedAt: string;
  UpdatedAt: string;
  CreatedBy?: string;
}

export default function EditSubmission() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [originalAttachmentIds, setOriginalAttachmentIds] = useState<Set<string>>(new Set());

  // Fetch submission
  const { data: submission, isLoading, error } = useQuery({
    queryKey: ['submission', id],
    queryFn: async () => {
      const response = await api.get<{ value: Submission[] }>(
        `/submissions?$filter=Id eq ${formatGuidForOData(id, 'Submission Id')}`
      );
      return response.data.value[0];
    },
    enabled: !!id
  });

  // Fetch attachments
  const { data: existingAttachments } = useQuery({
    queryKey: ['submissionattachments', id],
    queryFn: async () => {
      const response = await api.get<{ value: SubmissionAttachment[] }>(
        `/submissionattachments?$filter=SubmissionId eq ${formatGuidForOData(id, 'Submission Id')}`
      );
      return response.data.value;
    },
    enabled: !!id
  });

  const { handleSubmit, watch, reset, control } = useForm<SubmissionFormData>({
    resolver: zodResolver(submissionSchema),
    defaultValues: {
      Title: '',
      Type: 'Bug',
      Priority: 'Medium',
      Status: 'Open',
      Description: '',
      StepsToReproduce: '',
      ExpectedBehavior: '',
      ActualBehavior: '',
    },
  });

  const submissionType = watch('Type');

  // Initialize form and attachments when data loads
  useEffect(() => {
    if (submission) {
      reset({
        Title: submission.Title,
        Type: submission.Type as 'Bug' | 'Enhancement' | 'Question',
        Priority: submission.Priority as 'Low' | 'Medium' | 'High' | 'Critical',
        Status: submission.Status as 'Open' | 'InProgress' | 'Resolved' | 'Closed',
        Description: submission.Description || '',
        StepsToReproduce: submission.StepsToReproduce || '',
        ExpectedBehavior: submission.ExpectedBehavior || '',
        ActualBehavior: submission.ActualBehavior || '',
      });
    }
  }, [submission, reset]);

  useEffect(() => {
    if (existingAttachments) {
      const attachmentList: Attachment[] = existingAttachments.map(att => ({
        id: att.Id,
        fileName: att.FileName,
        contentType: att.ContentType,
        fileData: att.FileData
      }));
      setAttachments(attachmentList);
      setOriginalAttachmentIds(new Set(existingAttachments.map(att => att.Id)));
    }
  }, [existingAttachments]);

  const updateMutation = useMutation({
    mutationFn: async (data: SubmissionFormData) => {
      // Update the submission
      await api.patch(`/submissions/Id/${id}`, {
        ...data,
        UpdatedAt: new Date().toISOString()
      });

      // Handle attachment changes
      const currentAttachmentIds = new Set(attachments.filter(a => a.id).map(a => a.id!));

      // Delete removed attachments
      for (const originalId of originalAttachmentIds) {
        if (!currentAttachmentIds.has(originalId)) {
          await api.delete(`/submissionattachments/Id/${originalId}`);
        }
      }

      // Create new attachments
      const newAttachments = attachments.filter(a => !a.id);
      await Promise.all(
        newAttachments.map(attachment =>
          api.post('/submissionattachments', {
            SubmissionId: id,
            FileName: attachment.fileName,
            ContentType: attachment.contentType,
            FileData: attachment.fileData
          })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submissions'] });
      queryClient.invalidateQueries({ queryKey: ['submission', id] });
      queryClient.invalidateQueries({ queryKey: ['submissionattachments', id] });
      showToast('Submission updated successfully', 'success');
      navigate('/submissions');
    },
    onError: (error) => {
      console.error('Failed to update submission:', error);
      showToast('Failed to update submission', 'error');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/submissions/Id/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submissions'] });
      showToast('Submission deleted successfully', 'success');
      navigate('/submissions');
    },
    onError: (error) => {
      console.error('Failed to delete submission:', error);
      showToast('Failed to delete submission', 'error');
    }
  });

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this submission? This action cannot be undone.')) {
      deleteMutation.mutate();
    }
  };

  if (isLoading) return <div className="p-4">Loading submission...</div>;
  if (error || !submission) return <div className="p-4 text-red-600">Error loading submission</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center">
          <button onClick={() => navigate('/submissions')} className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Edit Submission</h1>
        </div>
        <Button
          variant="outlined"
          color="error"
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          startIcon={<Trash2 className="w-4 h-4" />}
          size="small"
        >
          Delete
        </Button>
      </div>

      <form onSubmit={handleSubmit((data) => updateMutation.mutateAsync(data))} className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-6">
        {/* Title */}
        <Controller
          name="Title"
          control={control}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              id="Title"
              label="Title"
              required
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
              size="small"
              fullWidth
            />
          )}
        />

        {/* Type, Priority, Status row */}
        <div className="grid grid-cols-3 gap-4">
          <Controller
            name="Type"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                id="Type"
                select
                SelectProps={{ native: true }}
                label="Type"
                required
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              >
                <option value="Bug">Bug</option>
                <option value="Enhancement">Enhancement</option>
                <option value="Question">Question</option>
              </TextField>
            )}
          />

          <Controller
            name="Priority"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                id="Priority"
                select
                SelectProps={{ native: true }}
                label="Priority"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </TextField>
            )}
          />

          <Controller
            name="Status"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                id="Status"
                select
                SelectProps={{ native: true }}
                label="Status"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              >
                <option value="Open">Open</option>
                <option value="InProgress">In Progress</option>
                <option value="Resolved">Resolved</option>
                <option value="Closed">Closed</option>
              </TextField>
            )}
          />
        </div>

        {/* Description */}
        <Controller
          name="Description"
          control={control}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              value={field.value ?? ''}
              id="Description"
              label="Description"
              multiline
              rows={4}
              placeholder="Provide a detailed description..."
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
              size="small"
              fullWidth
            />
          )}
        />

        {/* Bug-specific fields */}
        {submissionType === 'Bug' && (
          <>
            <Controller
              name="StepsToReproduce"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  id="StepsToReproduce"
                  label="Steps to Reproduce"
                  multiline
                  rows={4}
                  placeholder={"1. Go to...\n2. Click on...\n3. See error..."}
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  size="small"
                  fullWidth
                />
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <Controller
                name="ExpectedBehavior"
                control={control}
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    value={field.value ?? ''}
                    id="ExpectedBehavior"
                    label="Expected Behavior"
                    multiline
                    rows={3}
                    placeholder="What should happen..."
                    error={!!fieldState.error}
                    helperText={fieldState.error?.message}
                    size="small"
                    fullWidth
                  />
                )}
              />

              <Controller
                name="ActualBehavior"
                control={control}
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    value={field.value ?? ''}
                    id="ActualBehavior"
                    label="Actual Behavior"
                    multiline
                    rows={3}
                    placeholder="What actually happens..."
                    error={!!fieldState.error}
                    helperText={fieldState.error?.message}
                    size="small"
                    fullWidth
                  />
                )}
              />
            </div>
          </>
        )}

        {/* Screenshot Uploader */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Screenshots / Attachments
          </label>
          <ScreenshotUploader
            value={attachments}
            onChange={setAttachments}
          />
        </div>

        {/* Metadata */}
        <div className="border-t dark:border-gray-600 pt-4 text-sm text-gray-500 dark:text-gray-400">
          <p>Created: {formatDateTime(submission.CreatedAt)}</p>
          {submission.CreatedBy && <p>Created by: {submission.CreatedBy}</p>}
          <p>Last updated: {formatDateTime(submission.UpdatedAt)}</p>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end items-center border-t dark:border-gray-600 pt-4">
          <Button variant="outlined" onClick={() => navigate('/submissions')} sx={{ mr: 1.5 }}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}
