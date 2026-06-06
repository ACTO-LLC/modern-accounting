import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, ProjectInput } from '../lib/api';
import ProjectForm, { ProjectFormData } from '../components/ProjectForm';
import { useFeatureFlags } from '../contexts/FeatureFlagsContext';

export default function NewProject() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isFeatureEnabled } = useFeatureFlags();
  const jobCostingEnabled = isFeatureEnabled('job_costing');

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
        // Only send the cost-side fields when the flag is on, so a flag-off
        // create doesn't touch the API surface area at all.
        ...(jobCostingEnabled && {
          EstimatedCost: data.EstimatedCost ?? null,
          ContractAmount: data.ContractAmount ?? null,
        }),
      };
      await projectsApi.create(projectInput);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      navigate('/projects');
    },
    onError: (error) => {
      console.error('Failed to create project:', error);
      alert('Failed to create project');
    }
  });

  return (
    <ProjectForm
      title="New Project"
      onSubmit={(data) => mutation.mutateAsync(data)}
      isSubmitting={mutation.isPending}
    />
  );
}
