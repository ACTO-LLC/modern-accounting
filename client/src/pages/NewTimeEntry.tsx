import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowLeft } from 'lucide-react';
import { timeEntriesApi, projectsApi, customersApi, Project, Customer, TimeEntryInput } from '../lib/api';

const timeEntrySchema = z.object({
  ProjectId: z.string().min(1, 'Project is required'),
  EmployeeName: z.string().min(1, 'Employee name is required'),
  EntryDate: z.string().min(1, 'Date is required'),
  Hours: z.coerce.number().min(0.25, 'Minimum 0.25 hours').max(24, 'Maximum 24 hours'),
  HourlyRate: z.coerce.number().min(0).optional(),
  Description: z.string().optional(),
  IsBillable: z.boolean().default(true),
});

type TimeEntryFormData = z.infer<typeof timeEntrySchema>;

export default function NewTimeEntry() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: projectsApi.getAll,
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: customersApi.getAll,
  });

  const activeProjects = projects.filter(p => p.Status === 'Active');
  const projectsMap = new Map(projects.map(p => [p.Id, p]));

  const { register, handleSubmit, watch, formState: { errors } } = useForm<TimeEntryFormData>({
    resolver: zodResolver(timeEntrySchema),
    defaultValues: {
      EntryDate: new Date().toISOString().split('T')[0],
      Hours: 1,
      HourlyRate: 0,
      IsBillable: true,
    }
  });

  const selectedProjectId = watch('ProjectId');
  const selectedProject = selectedProjectId ? projectsMap.get(selectedProjectId) : undefined;

  const mutation = useMutation({
    mutationFn: async (data: TimeEntryFormData) => {
      const project = projectsMap.get(data.ProjectId);
      if (!project) throw new Error('Project not found');

      const entry: TimeEntryInput = {
        ProjectId: data.ProjectId,
        CustomerId: project.CustomerId,
        EmployeeName: data.EmployeeName,
        EntryDate: data.EntryDate,
        Hours: data.Hours,
        HourlyRate: data.HourlyRate || 0,
        Description: data.Description || undefined,
        IsBillable: data.IsBillable,
        Status: 'Pending',
      };
      await timeEntriesApi.create(entry);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
      navigate('/time-entries');
    },
    onError: (error) => {
      console.error('Failed to create time entry:', error);
      alert('Failed to create time entry');
    }
  });

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex items-center">
        <button onClick={() => navigate('/time-entries')} className="mr-4 text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900">Log Time</h1>
      </div>

      <form onSubmit={handleSubmit((data) => mutation.mutateAsync(data))} className="bg-white shadow rounded-lg p-6 space-y-6">
        <div>
          <label htmlFor="ProjectId" className="block text-sm font-medium text-gray-700">Project</label>
          <select
            id="ProjectId"
            {...register('ProjectId')}
            disabled={projectsLoading}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
          >
            <option value="">Select a project...</option>
            {activeProjects.map((project) => (
              <option key={project.Id} value={project.Id}>
                {project.Name}
              </option>
            ))}
          </select>
          {errors.ProjectId && <p className="mt-1 text-sm text-red-600">{errors.ProjectId.message}</p>}
          {selectedProject && (
            <p className="mt-1 text-sm text-gray-500">
              Customer: {customers.find(c => c.Id === selectedProject.CustomerId)?.Name || 'Unknown'}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="EmployeeName" className="block text-sm font-medium text-gray-700">Employee Name</label>
          <input
            id="EmployeeName"
            type="text"
            {...register('EmployeeName')}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            placeholder="Your name"
          />
          {errors.EmployeeName && <p className="mt-1 text-sm text-red-600">{errors.EmployeeName.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="EntryDate" className="block text-sm font-medium text-gray-700">Date</label>
            <input
              id="EntryDate"
              type="date"
              {...register('EntryDate')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            />
            {errors.EntryDate && <p className="mt-1 text-sm text-red-600">{errors.EntryDate.message}</p>}
          </div>

          <div>
            <label htmlFor="Hours" className="block text-sm font-medium text-gray-700">Hours</label>
            <input
              id="Hours"
              type="number"
              step="0.25"
              min="0.25"
              max="24"
              {...register('Hours')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            />
            {errors.Hours && <p className="mt-1 text-sm text-red-600">{errors.Hours.message}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="HourlyRate" className="block text-sm font-medium text-gray-700">Hourly Rate ($)</label>
          <input
            id="HourlyRate"
            type="number"
            step="0.01"
            min="0"
            {...register('HourlyRate')}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
          />
          {errors.HourlyRate && <p className="mt-1 text-sm text-red-600">{errors.HourlyRate.message}</p>}
        </div>

        <div>
          <label htmlFor="Description" className="block text-sm font-medium text-gray-700">Description</label>
          <textarea
            id="Description"
            rows={3}
            {...register('Description')}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            placeholder="What did you work on?"
          />
          {errors.Description && <p className="mt-1 text-sm text-red-600">{errors.Description.message}</p>}
        </div>

        <div className="flex items-center">
          <input
            id="IsBillable"
            type="checkbox"
            {...register('IsBillable')}
            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
          />
          <label htmlFor="IsBillable" className="ml-2 block text-sm text-gray-900">
            Billable
          </label>
        </div>

        <div className="flex justify-end items-center border-t pt-4">
          <button
            type="button"
            onClick={() => navigate('/time-entries')}
            className="mr-3 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving...' : 'Log Time'}
          </button>
        </div>
      </form>
    </div>
  );
}
