import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
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

  const { register, handleSubmit, watch, formState: { errors } } = useForm<SubmissionFormData>({
    resolver: zodResolver(submissionSchema),
    defaultValues: {
      Priority: 'Medium',
      Type: undefined
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
        <button onClick={() => navigate('/submissions')} className="mr-4 text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900">New Submission</h1>
      </div>

      <form onSubmit={handleSubmit((data) => mutation.mutateAsync(data))} className="bg-white shadow rounded-lg p-6 space-y-6">
        {/* Title */}
        <div>
          <label htmlFor="Title" className="block text-sm font-medium text-gray-700">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            id="Title"
            type="text"
            {...register('Title')}
            placeholder="Brief summary of the issue or request"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
          />
          {errors.Title && <p className="mt-1 text-sm text-red-600">{errors.Title.message}</p>}
        </div>

        {/* Type and Priority row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="Type" className="block text-sm font-medium text-gray-700">
              Type <span className="text-red-500">*</span>
            </label>
            <select
              id="Type"
              {...register('Type')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="">Select type...</option>
              <option value="Bug">Bug - Something is broken</option>
              <option value="Enhancement">Enhancement - Feature request</option>
              <option value="Question">Question - Need help</option>
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
            placeholder="Provide a detailed description..."
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
                placeholder="1. Go to...&#10;2. Click on...&#10;3. See error..."
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
                  placeholder="What should happen..."
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
                  placeholder="What actually happens..."
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
            disabled={mutation.isPending}
            className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {mutation.isPending ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </form>
    </div>
  );
}
