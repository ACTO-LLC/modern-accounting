import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
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

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<SubmissionFormData>({
    resolver: zodResolver(submissionSchema),
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
          <button onClick={() => navigate('/submissions')} className="mr-4 text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-semibold text-gray-900">Edit Submission</h1>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          className="inline-flex items-center px-3 py-2 border border-red-300 rounded-md text-sm font-medium text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4 mr-1" />
          Delete
        </button>
      </div>

      <form onSubmit={handleSubmit((data) => updateMutation.mutateAsync(data))} className="bg-white shadow rounded-lg p-6 space-y-6">
        {/* Title */}
        <div>
          <label htmlFor="Title" className="block text-sm font-medium text-gray-700">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            id="Title"
            type="text"
            {...register('Title')}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
          />
          {errors.Title && <p className="mt-1 text-sm text-red-600">{errors.Title.message}</p>}
        </div>

        {/* Type, Priority, Status row */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="Type" className="block text-sm font-medium text-gray-700">
              Type <span className="text-red-500">*</span>
            </label>
            <select
              id="Type"
              {...register('Type')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="Bug">Bug</option>
              <option value="Enhancement">Enhancement</option>
              <option value="Question">Question</option>
            </select>
            {errors.Type && <p className="mt-1 text-sm text-red-600">{errors.Type.message}</p>}
          </div>

          <div>
            <label htmlFor="Priority" className="block text-sm font-medium text-gray-700">
              Priority
            </label>
            <select
              id="Priority"
              {...register('Priority')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
            {errors.Priority && <p className="mt-1 text-sm text-red-600">{errors.Priority.message}</p>}
          </div>

          <div>
            <label htmlFor="Status" className="block text-sm font-medium text-gray-700">
              Status
            </label>
            <select
              id="Status"
              {...register('Status')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="Open">Open</option>
              <option value="InProgress">In Progress</option>
              <option value="Resolved">Resolved</option>
              <option value="Closed">Closed</option>
            </select>
            {errors.Status && <p className="mt-1 text-sm text-red-600">{errors.Status.message}</p>}
          </div>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="Description" className="block text-sm font-medium text-gray-700">
            Description
          </label>
          <textarea
            id="Description"
            rows={4}
            {...register('Description')}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
          />
          {errors.Description && <p className="mt-1 text-sm text-red-600">{errors.Description.message}</p>}
        </div>

        {/* Bug-specific fields */}
        {submissionType === 'Bug' && (
          <>
            <div>
              <label htmlFor="StepsToReproduce" className="block text-sm font-medium text-gray-700">
                Steps to Reproduce
              </label>
              <textarea
                id="StepsToReproduce"
                rows={4}
                {...register('StepsToReproduce')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
              />
              {errors.StepsToReproduce && <p className="mt-1 text-sm text-red-600">{errors.StepsToReproduce.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="ExpectedBehavior" className="block text-sm font-medium text-gray-700">
                  Expected Behavior
                </label>
                <textarea
                  id="ExpectedBehavior"
                  rows={3}
                  {...register('ExpectedBehavior')}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                />
                {errors.ExpectedBehavior && <p className="mt-1 text-sm text-red-600">{errors.ExpectedBehavior.message}</p>}
              </div>

              <div>
                <label htmlFor="ActualBehavior" className="block text-sm font-medium text-gray-700">
                  Actual Behavior
                </label>
                <textarea
                  id="ActualBehavior"
                  rows={3}
                  {...register('ActualBehavior')}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                />
                {errors.ActualBehavior && <p className="mt-1 text-sm text-red-600">{errors.ActualBehavior.message}</p>}
              </div>
            </div>
          </>
        )}

        {/* Screenshot Uploader */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Screenshots / Attachments
          </label>
          <ScreenshotUploader
            value={attachments}
            onChange={setAttachments}
          />
        </div>

        {/* Metadata */}
        <div className="border-t pt-4 text-sm text-gray-500">
          <p>Created: {formatDateTime(submission.CreatedAt)}</p>
          {submission.CreatedBy && <p>Created by: {submission.CreatedBy}</p>}
          <p>Last updated: {formatDateTime(submission.UpdatedAt)}</p>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end items-center border-t pt-4">
          <button
            type="button"
            onClick={() => navigate('/submissions')}
            className="mr-3 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
