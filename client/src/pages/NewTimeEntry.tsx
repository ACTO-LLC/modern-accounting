import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowLeft } from 'lucide-react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
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

  // Extract refs from register for use with MUI TextField
  const { ref: hoursRef, ...hoursRest } = register('Hours');
  const { ref: hourlyRateRef, ...hourlyRateRest } = register('HourlyRate');
  const { ref: descriptionRef, ...descriptionRest } = register('Description');

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
          <Controller
            name="ProjectId"
            control={control}
            render={({ field }) => (
              <Autocomplete
                options={activeProjects}
                getOptionLabel={(option: Project) => option.Name}
                value={activeProjects.find(p => p.Id === field.value) ?? null}
                onChange={(_event, newValue: Project | null) => {
                  field.onChange(newValue?.Id ?? '');
                }}
                isOptionEqualToValue={(option: Project, val: Project) => option.Id === val.Id}
                loading={projectsLoading}
                size="small"
                renderOption={(props, option: Project) => {
                  const { key, ...rest } = props;
                  const customer = customers.find(c => c.Id === option.CustomerId);
                  return (
                    <li key={key} {...rest}>
                      <div>
                        <div className="font-medium">{option.Name}</div>
                        {customer && <div className="text-xs opacity-60">{customer.Name}</div>}
                      </div>
                    </li>
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Project"
                    placeholder="Select a project..."
                    required
                    error={!!errors.ProjectId}
                    helperText={errors.ProjectId?.message}
                    slotProps={{
                      input: {
                        ...params.InputProps,
                        endAdornment: (
                          <>
                            {projectsLoading ? <CircularProgress color="inherit" size={20} /> : null}
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
          <Controller
            name="EntryDate"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                type="date"
                label="Date"
                required
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
              />
            )}
          />

          <TextField
            {...hoursRest}
            inputRef={hoursRef}
            type="number"
            label="Hours"
            required
            error={!!errors.Hours}
            helperText={errors.Hours?.message}
            size="small"
            fullWidth
            slotProps={{ htmlInput: { step: '0.25', min: '0.25', max: '24' } }}
          />
        </div>

        <TextField
          {...hourlyRateRest}
          inputRef={hourlyRateRef}
          type="number"
          label="Hourly Rate ($)"
          error={!!errors.HourlyRate}
          helperText={errors.HourlyRate?.message}
          size="small"
          fullWidth
          slotProps={{ htmlInput: { step: '0.01', min: '0' } }}
        />

        <TextField
          {...descriptionRest}
          inputRef={descriptionRef}
          label="Description"
          placeholder="What did you work on?"
          multiline
          rows={3}
          error={!!errors.Description}
          helperText={errors.Description?.message}
          size="small"
          fullWidth
        />

        <Controller
          name="IsBillable"
          control={control}
          render={({ field }) => (
            <FormControlLabel
              control={
                <Checkbox
                  checked={field.value ?? true}
                  onChange={field.onChange}
                />
              }
              label="Billable"
            />
          )}
        />

        <div className="flex justify-end items-center border-t dark:border-gray-600 pt-4">
          <Button
            variant="outlined"
            onClick={() => navigate('/time-entries')}
            sx={{ mr: 1.5 }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Saving...' : 'Log Time'}
          </Button>
        </div>
      </form>
    </div>
  );
}
