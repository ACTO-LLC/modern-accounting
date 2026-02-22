import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { projectsApi, timeEntriesApi, ProjectInput, Project, TimeEntry } from '../lib/api';
import ProjectForm, { ProjectFormData } from '../components/ProjectForm';

export default function EditProject() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: project, isLoading: projectLoading, error: projectError } = useQuery<Project>({
    queryKey: ['project', id],
    queryFn: async () => {
      const response = await api.get<{ value: Project[] }>(`/projects?$filter=Id eq ${id}`);
      return response.data.value[0];
    },
    enabled: !!id,
  });

  const { data: timeEntries = [] } = useQuery<TimeEntry[]>({
    queryKey: ['timeEntries', 'project', id],
    queryFn: () => timeEntriesApi.getByProject(id!),
    enabled: !!id,
  });

  const mutation = useMutation({
    mutationFn: async (data: ProjectFormData) => {
      const projectInput: ProjectInput = {
        Name: data.Name,
        CustomerId: data.CustomerId,
        Description: data.Description || undefined,
        Status: data.Status,
        StartDate: data.StartDate || undefined,
        EndDate: data.EndDate || undefined,
        BudgetedHours: data.BudgetedHours || undefined,
        BudgetedAmount: data.BudgetedAmount || undefined,
      };
      await projectsApi.update(id!, projectInput);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      navigate('/projects');
    },
    onError: (error) => {
      console.error('Failed to update project:', error);
      alert('Failed to update project');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: () => projectsApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      navigate('/projects');
    },
    onError: (error) => {
      console.error('Failed to delete project:', error);
      alert('Failed to delete project');
    }
  });

  if (projectLoading) return <div className="p-4">Loading project...</div>;
  if (projectError || !project) return <div className="p-4 text-red-600">Error loading project</div>;

  // Calculate budget progress
  const totalHours = timeEntries.reduce((sum, entry) => sum + entry.Hours, 0);
  const totalAmount = timeEntries.reduce((sum, entry) => sum + (entry.Hours * entry.HourlyRate), 0);
  const hoursProgress = project.BudgetedHours ? (totalHours / project.BudgetedHours) * 100 : 0;
  const amountProgress = project.BudgetedAmount ? (totalAmount / project.BudgetedAmount) * 100 : 0;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const initialValues: Partial<ProjectFormData> = {
    Name: project.Name,
    CustomerId: project.CustomerId,
    Description: project.Description || '',
    Status: project.Status,
    StartDate: project.StartDate ? project.StartDate.split('T')[0] : '',
    EndDate: project.EndDate ? project.EndDate.split('T')[0] : '',
    BudgetedHours: project.BudgetedHours || undefined,
    BudgetedAmount: project.BudgetedAmount || undefined,
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Budget Progress Section */}
      {(project.BudgetedHours || project.BudgetedAmount) && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Budget Progress</h2>
          <div className="space-y-4">
            {project.BudgetedHours && (
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-500">Hours</span>
                  <span className="font-medium">{totalHours.toFixed(1)} / {project.BudgetedHours} hrs ({hoursProgress.toFixed(0)}%)</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${hoursProgress > 100 ? 'bg-red-600' : hoursProgress > 80 ? 'bg-yellow-500' : 'bg-green-600'}`}
                    style={{ width: `${Math.min(hoursProgress, 100)}%` }}
                  />
                </div>
              </div>
            )}
            {project.BudgetedAmount && (
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-500">Amount</span>
                  <span className="font-medium">{formatCurrency(totalAmount)} / {formatCurrency(project.BudgetedAmount)} ({amountProgress.toFixed(0)}%)</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${amountProgress > 100 ? 'bg-red-600' : amountProgress > 80 ? 'bg-yellow-500' : 'bg-green-600'}`}
                    style={{ width: `${Math.min(amountProgress, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ProjectForm
        title="Edit Project"
        initialValues={initialValues}
        onSubmit={(data) => mutation.mutateAsync(data)}
        isSubmitting={mutation.isPending}
        submitButtonText="Update Project"
      />

      {/* Delete Button */}
      <div className="mt-6 pt-6 border-t">
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
              deleteMutation.mutate();
            }
          }}
          disabled={deleteMutation.isPending}
          className="w-full inline-flex justify-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {deleteMutation.isPending ? 'Deleting...' : 'Delete Project'}
        </button>
      </div>
    </div>
  );
}
