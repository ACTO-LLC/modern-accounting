import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowLeft } from 'lucide-react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import { timeEntriesApi, projectsApi, customersApi, employeesApi, Project, Customer, Employee, TimeEntryInput } from '../lib/api';

const timeEntrySchema = z.object({
  ProjectId: z.string().min(1, 'Project is required'),
  EmployeeName: z.string().min(1, 'Employee is required'),
  EntryDate: z.string().min(1, 'Date is required'),
  Hours: z.coerce.number().min(0.25, 'Minimum 0.25 hours').max(24, 'Maximum 24 hours'),
  HourlyRate: z.coerce.number().min(0).nullish(),
  Description: z.string().nullish(),
  IsBillable: z.boolean().nullish(),
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

  const { data: employees = [], isLoading: employeesLoading } = useQuery<Employee[]>({
    queryKey: ['employees'],
    queryFn: employeesApi.getAll,
  });

  const activeProjects = projects.filter(p => p.Status === 'Active');
  const activeEmployees = employees.filter(e => e.Status === 'Active');
  const projectsMap = new Map(projects.map(p => [p.Id, p]));

  const { register, handleSubmit, watch, control, formState: { errors } } = useForm<TimeEntryFormData>({
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

      // Convert empty strings to null for DAB nullable columns
      const entry: TimeEntryInput = {
        ProjectId: data.ProjectId,
        CustomerId: project.CustomerId,
        EmployeeName: data.EmployeeName,
        EntryDate: data.EntryDate,
        Hours: data.Hours,
        HourlyRate: data.HourlyRate ?? 0,
        Description: data.Description || null,
        IsBillable: data.IsBillable ?? true,
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
        <button onClick={() => navigate('/time-entries')} className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Log Time</h1>
      </div>

      <form onSubmit={handleSubmit((data) => mutation.mutateAsync(data))} className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-6">
        <div>
          <label htmlFor="ProjectId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Project</label>
          <select
            id="ProjectId"
            {...register('ProjectId')}
            disabled={projectsLoading}
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
          >
            <option value="">Select a project...</option>
            {activeProjects.map((project) => (
              <option key={project.Id} value={project.Id}>
                {project.Name}
              </option>
            ))}
          </select>
          {errors.ProjectId && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.ProjectId.message}</p>}
          {selectedProject && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Customer: {customers.find(c => c.Id === selectedProject.CustomerId)?.Name || 'Unknown'}
            </p>
          )}
        </div>

        <div>
          <Controller
            name="EmployeeName"
            control={control}
            render={({ field }) => (
              <Autocomplete
                options={activeEmployees}
                getOptionLabel={(option: Employee) => option.FullName}
                value={activeEmployees.find(e => e.FullName === field.value) ?? null}
                onChange={(_event, newValue: Employee | null) => {
                  field.onChange(newValue?.FullName ?? '');
                }}
                isOptionEqualToValue={(option: Employee, val: Employee) => option.Id === val.Id}
                loading={employeesLoading}
                size="small"
                renderOption={(props, option: Employee) => {
                  const { key, ...rest } = props;
                  return (
                    <li key={key} {...rest}>
                      <div>
                        <div className="font-medium">{option.FullName}</div>
                        <div className="text-xs opacity-60">{option.EmployeeNumber}</div>
                      </div>
                    </li>
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Employee"
                    placeholder="Select an employee..."
                    required
                    error={!!errors.EmployeeName}
                    helperText={errors.EmployeeName?.message}
                    slotProps={{
                      input: {
                        ...params.InputProps,
                        endAdornment: (
                          <>
                            {employeesLoading ? <CircularProgress color="inherit" size={20} /> : null}
                            {params.InputProps.endAdornment}
                          </>
                        ),
                      },
                    }}
                  />
                )}
              />
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="EntryDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Date</label>
            <input
              id="EntryDate"
              type="date"
              {...register('EntryDate')}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            />
            {errors.EntryDate && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.EntryDate.message}</p>}
          </div>

          <div>
            <label htmlFor="Hours" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Hours</label>
            <input
              id="Hours"
              type="number"
              step="0.25"
              min="0.25"
              max="24"
              {...register('Hours')}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            />
            {errors.Hours && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.Hours.message}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="HourlyRate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Hourly Rate ($)</label>
          <input
            id="HourlyRate"
            type="number"
            step="0.01"
            min="0"
            {...register('HourlyRate')}
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
          />
          {errors.HourlyRate && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.HourlyRate.message}</p>}
        </div>

        <div>
          <label htmlFor="Description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
          <textarea
            id="Description"
            rows={3}
            {...register('Description')}
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            placeholder="What did you work on?"
          />
          {errors.Description && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.Description.message}</p>}
        </div>

        <div className="flex items-center">
          <input
            id="IsBillable"
            type="checkbox"
            {...register('IsBillable')}
            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600 rounded"
          />
          <label htmlFor="IsBillable" className="ml-2 block text-sm text-gray-900 dark:text-gray-100">
            Billable
          </label>
        </div>

        <div className="flex justify-end items-center border-t border-gray-200 dark:border-gray-600 pt-4">
          <button
            type="button"
            onClick={() => navigate('/time-entries')}
            className="mr-3 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
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
