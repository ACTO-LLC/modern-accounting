import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import api from '../lib/api';
import ScreenshotUploader, { Attachment } from '../components/ScreenshotUploader';
import { useToast } from '../hooks/useToast';

const submissionSchema = z.object({
  Title: z.string().min(1, 'Title is required').max(200, 'Title must be 200 characters or less'),
  Type: z.enum(['Bug', 'Enhancement', 'Question'], {
    required_error: 'Please select a type'
  }),
  Priority: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
  Description: z.string().optional(),
  StepsToReproduce: z.string().optional(),
  ExpectedBehavior: z.string().optional(),
  ActualBehavior: z.string().optional(),
});

type SubmissionFormData = z.infer<typeof submissionSchema>;

export default function NewSubmission() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const { control, handleSubmit, watch } = useForm<SubmissionFormData>({
    resolver: zodResolver(submissionSchema),
    defaultValues: {
      Title: '',
      Priority: 'Medium',
      Type: undefined,
      Description: '',
      StepsToReproduce: '',
      ExpectedBehavior: '',
      ActualBehavior: '',
    }
  });

  const submissionType = watch('Type');

  const mutation = useMutation({
    mutationFn: async (data: SubmissionFormData) => {
      // Create the submission first
      const response = await api.post<{ value: { Id: string }[] }>('/submissions', data);
      const submissionId = response.data.value[0].Id;

      // Then create attachments if any
      if (attachments.length > 0) {
        await Promise.all(
          attachments.map(attachment =>
            api.post('/submissionattachments', {
              SubmissionId: submissionId,
              FileName: attachment.fileName,
              ContentType: attachment.contentType,
              FileData: attachment.fileData
            })
          )
        );
      }

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submissions'] });
      showToast('Submission created successfully', 'success');
      navigate('/submissions');
    },
    onError: (error) => {
      console.error('Failed to create submission:', error);
      showToast('Failed to create submission', 'error');
    }
  });

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6 flex items-center">
        <button onClick={() => navigate('/submissions')} className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">New Submission</h1>
      </div>

      <form onSubmit={handleSubmit((data) => mutation.mutateAsync(data))} className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-6">
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
              placeholder="Brief summary of the issue or request"
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
              size="small"
              fullWidth
            />
          )}
        />

        {/* Type and Priority row */}
        <div className="grid grid-cols-2 gap-4">
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
                <option value="" disabled>Select type...</option>
                <option value="Bug">Bug - Something is broken</option>
                <option value="Enhancement">Enhancement - Feature request</option>
                <option value="Question">Question - Need help</option>
              </TextField>
            )}
          />

          <Controller
            name="Priority"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? 'Medium'}
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

        {/* Form Actions */}
        <div className="flex justify-end items-center border-t dark:border-gray-600 pt-4">
          <Button variant="outlined" onClick={() => navigate('/submissions')} sx={{ mr: 1.5 }}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={mutation.isPending}>
            {mutation.isPending ? 'Submitting...' : 'Submit'}
          </Button>
        </div>
      </form>
    </div>
  );
}
