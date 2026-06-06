import { useState, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, InputAdornment,
} from '@mui/material';
import { DataGrid, GridColDef, GridActionsCellItem } from '@mui/x-data-grid';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { jobCostCodesApi, JobCostCode, JobCostCodeInput } from '../lib/api';
import { useCurrency } from '../contexts/CurrencyContext';

// Numeric fields store number | null. The '' → null conversion happens in each
// field's Controller onChange so blank inputs stay null instead of 0.
const costCodeSchema = z.object({
  Code: z.string().min(1, 'Code is required').max(50),
  Description: z.string().min(1, 'Description is required').max(200),
  BudgetedAmount: z.number().min(0).nullable().optional(),
  BudgetedHours: z.number().min(0).nullable().optional(),
  SortOrder: z.coerce.number().int().min(0).optional(),
});

function toNullableNumber(value: string): number | null {
  return value === '' ? null : Number(value);
}
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

  const columns = useMemo<GridColDef<JobCostCode>[]>(() => [
    { field: 'Code', headerName: 'Code', width: 140, cellClassName: 'font-mono' },
    { field: 'Description', headerName: 'Description', flex: 1, minWidth: 200 },
    {
      field: 'BudgetedAmount',
      headerName: 'Budgeted Amount',
      width: 160,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => (value != null ? formatCurrency(value as number) : '—'),
    },
    {
      field: 'BudgetedHours',
      headerName: 'Budgeted Hours',
      width: 140,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => (value != null ? (value as number).toFixed(1) : '—'),
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: '',
      width: 90,
      getActions: ({ row }) => [
        <GridActionsCellItem
          key="edit"
          icon={<Pencil className="w-4 h-4" />}
          label="Edit"
          onClick={() => setEditing(row)}
        />,
        <GridActionsCellItem
          key="delete"
          icon={<Trash2 className="w-4 h-4" />}
          label="Delete"
          onClick={() => {
            if (window.confirm(`Delete cost code "${row.Code}"?`)) {
              deleteMutation.mutate(row.Id);
            }
          }}
        />,
      ],
    },
  ], [formatCurrency, deleteMutation]);

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

      {costCodes.length === 0 && !isLoading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
          No cost codes yet. Add one to start tracking the project budget by line item.
        </div>
      ) : (
        <div style={{ width: '100%' }}>
          <DataGrid<JobCostCode>
            rows={costCodes}
            columns={columns}
            getRowId={(row) => row.Id}
            loading={isLoading}
            disableRowSelectionOnClick
            autoHeight
            initialState={{
              pagination: { paginationModel: { pageSize: 25 } },
            }}
            pageSizeOptions={[10, 25, 50]}
          />
        </div>
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
                    onChange={(e) => field.onChange(toNullableNumber(e.target.value))}
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
                    onChange={(e) => field.onChange(toNullableNumber(e.target.value))}
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
