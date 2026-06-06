import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, InputAdornment, IconButton,
} from '@mui/material';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { jobCostCodesApi, JobCostCode, JobCostCodeInput } from '../lib/api';
import { useCurrency } from '../contexts/CurrencyContext';

const costCodeSchema = z.object({
  Code: z.string().min(1, 'Code is required').max(50),
  Description: z.string().min(1, 'Description is required').max(200),
  BudgetedAmount: z.coerce.number().min(0).optional().nullable(),
  BudgetedHours: z.coerce.number().min(0).optional().nullable(),
  SortOrder: z.coerce.number().int().min(0).optional(),
});
type CostCodeFormData = z.infer<typeof costCodeSchema>;

interface Props {
  projectId: string;
}

export default function CostCodesSection({ projectId }: Props) {
  const queryClient = useQueryClient();
  const { formatCurrency } = useCurrency();
  const [editing, setEditing] = useState<JobCostCode | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: costCodes = [], isLoading } = useQuery<JobCostCode[]>({
    queryKey: ['jobCostCodes', projectId],
    queryFn: () => jobCostCodesApi.getByProject(projectId),
    enabled: !!projectId,
  });

  const createMutation = useMutation({
    mutationFn: (input: JobCostCodeInput) => jobCostCodesApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobCostCodes', projectId] });
      setCreating(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<JobCostCodeInput> }) =>
      jobCostCodesApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobCostCodes', projectId] });
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => jobCostCodesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobCostCodes', projectId] });
    },
  });

  const totalAmount = costCodes.reduce((sum, c) => sum + (c.BudgetedAmount ?? 0), 0);
  const totalHours = costCodes.reduce((sum, c) => sum + (c.BudgetedHours ?? 0), 0);

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mt-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Cost Codes</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Break the project budget down by line item.
          </p>
        </div>
        <Button
          variant="contained"
          size="small"
          startIcon={<Plus className="w-4 h-4" />}
          onClick={() => setCreating(true)}
        >
          Add Cost Code
        </Button>
      </div>

      {costCodes.length > 0 && (
        <div className="grid grid-cols-2 gap-4 mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded">
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Total Budgeted Amount</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {formatCurrency(totalAmount)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Total Budgeted Hours</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {totalHours.toFixed(1)}
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">Loading cost codes...</div>
      ) : costCodes.length === 0 ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
          No cost codes yet. Add one to start tracking the project budget by line item.
        </div>
      ) : (
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Code</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Description</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Budgeted Amount</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Budgeted Hours</th>
              <th className="px-3 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {costCodes.map((code) => (
              <tr key={code.Id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100 font-mono">{code.Code}</td>
                <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100">{code.Description}</td>
                <td className="px-3 py-2 text-sm text-right text-gray-900 dark:text-gray-100">
                  {code.BudgetedAmount != null ? formatCurrency(code.BudgetedAmount) : '—'}
                </td>
                <td className="px-3 py-2 text-sm text-right text-gray-900 dark:text-gray-100">
                  {code.BudgetedHours != null ? code.BudgetedHours.toFixed(1) : '—'}
                </td>
                <td className="px-3 py-2 text-right">
                  <IconButton size="small" onClick={() => setEditing(code)}>
                    <Pencil className="w-4 h-4" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => {
                      if (window.confirm(`Delete cost code "${code.Code}"?`)) {
                        deleteMutation.mutate(code.Id);
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(creating || editing) && (
        <CostCodeDialog
          existing={editing}
          onCancel={() => { setCreating(false); setEditing(null); }}
          onSubmit={(data) => {
            if (editing) {
              return updateMutation.mutateAsync({ id: editing.Id, input: data });
            }
            return createMutation.mutateAsync({ ProjectId: projectId, ...data });
          }}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  );
}

interface DialogProps {
  existing: JobCostCode | null;
  onCancel: () => void;
  onSubmit: (data: CostCodeFormData) => Promise<unknown>;
  isSubmitting: boolean;
}

function CostCodeDialog({ existing, onCancel, onSubmit, isSubmitting }: DialogProps) {
  const { control, handleSubmit } = useForm<CostCodeFormData>({
    resolver: zodResolver(costCodeSchema),
    defaultValues: {
      Code: existing?.Code ?? '',
      Description: existing?.Description ?? '',
      BudgetedAmount: existing?.BudgetedAmount ?? null,
      BudgetedHours: existing?.BudgetedHours ?? null,
      SortOrder: existing?.SortOrder ?? 0,
    },
  });

  return (
    <Dialog open onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{existing ? 'Edit Cost Code' : 'Add Cost Code'}</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent>
          <div className="space-y-4 pt-2">
            <Controller
              name="Code"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Code"
                  required
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message ?? 'e.g. 01-100'}
                  size="small"
                  fullWidth
                />
              )}
            />
            <Controller
              name="Description"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Description"
                  required
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  size="small"
                  fullWidth
                />
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <Controller
                name="BudgetedAmount"
                control={control}
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    value={field.value ?? ''}
                    label="Budgeted Amount"
                    type="number"
                    slotProps={{
                      htmlInput: { step: '0.01', min: '0' },
                      input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
                    }}
                    error={!!fieldState.error}
                    helperText={fieldState.error?.message}
                    size="small"
                    fullWidth
                  />
                )}
              />
              <Controller
                name="BudgetedHours"
                control={control}
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    value={field.value ?? ''}
                    label="Budgeted Hours"
                    type="number"
                    slotProps={{ htmlInput: { step: '0.5', min: '0' } }}
                    error={!!fieldState.error}
                    helperText={fieldState.error?.message}
                    size="small"
                    fullWidth
                  />
                )}
              />
            </div>
            <Controller
              name="SortOrder"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  value={field.value ?? 0}
                  label="Sort Order"
                  type="number"
                  slotProps={{ htmlInput: { step: '1', min: '0' } }}
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message ?? 'Lower values appear first'}
                  size="small"
                  fullWidth
                />
              )}
            />
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : existing ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
