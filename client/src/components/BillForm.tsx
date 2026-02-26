import { useForm, useFieldArray, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Zap, Info } from 'lucide-react';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useCompanySettings } from '../contexts/CompanySettingsContext';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ProjectSelector from './ProjectSelector';
import ClassSelector from './ClassSelector';

export const billSchema = z.object({
  VendorId: z.string().uuid('Please select a vendor'),
  BillNumber: z.string().optional(),
  BillDate: z.string().min(1, 'Bill date is required'),
  DueDate: z.string().min(1, 'Due date is required'),
  TotalAmount: z.number().min(0, 'Amount must be positive'),
  AmountPaid: z.number().min(0, 'Amount paid must be positive').optional(),
  Status: z.enum(['Draft', 'Open', 'Partial', 'Paid', 'Overdue']),
  Terms: z.string().optional(),
  Memo: z.string().optional(),
  ProjectId: z.string().uuid().nullish(),
  ClassId: z.string().uuid().nullish(),
  Lines: z.array(z.object({
    Id: z.string().nullish(),
    AccountId: z.string().uuid('Please select an account'),
    Description: z.string().nullish(),
    Amount: z.number().min(0, 'Amount must be positive'),
    ProjectId: z.string().uuid().nullish(),
    ClassId: z.string().uuid().nullish()
  })).min(1, 'At least one line item is required')
});

export type BillFormData = z.infer<typeof billSchema>;

interface Vendor {
  Id: string;
  Name: string;
  PaymentTerms: string;
}

interface Account {
  Id: string;
  Name: string;
  Type: string;
}

interface BillFormProps {
  initialValues?: Partial<BillFormData>;
  onSubmit: (data: BillFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
  submitButtonText?: string;
}

export default function BillForm({ initialValues, onSubmit, title, isSubmitting: externalIsSubmitting, submitButtonText = 'Save Bill' }: BillFormProps) {
  const navigate = useNavigate();
  const { settings } = useCompanySettings();

  const { data: vendors } = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const response = await api.get<{ value: Vendor[] }>('/vendors');
      return response.data.value;
    },
  });

  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await api.get<{ value: Account[] }>('/accounts');
      return response.data.value;
    },
  });

  // Filter to expense accounts for bill line items
  const expenseAccounts = accounts?.filter(
    (acc) => acc.Type === 'Expense' || acc.Type === 'Cost of Goods Sold'
  ) || [];

  const { register, control, handleSubmit, setValue, formState: { errors, isSubmitting: formIsSubmitting } } = useForm<BillFormData>({
    resolver: zodResolver(billSchema),
    defaultValues: {
      VendorId: '',
      BillNumber: '',
      Status: 'Open',
      BillDate: new Date().toISOString().split('T')[0],
      DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      Terms: '',
      Memo: '',
      ProjectId: null,
      ClassId: null,
      Lines: [{ AccountId: '', Description: '', Amount: 0, ProjectId: null, ClassId: null }],
      TotalAmount: 0,
      AmountPaid: 0,
      ...initialValues
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "Lines"
  });

  const lines = useWatch({
    control,
    name: "Lines"
  });

  const selectedVendorId = useWatch({
    control,
    name: "VendorId"
  });

  const watchedStatus = useWatch({
    control,
    name: "Status"
  });

  // Determine if bill will be auto-posted on save
  const willAutoPost = settings.invoicePostingMode === 'simple' && watchedStatus !== 'Draft';

  // Update Terms when vendor is selected
  useEffect(() => {
    if (selectedVendorId && vendors) {
      const vendor = vendors.find(v => v.Id === selectedVendorId);
      if (vendor?.PaymentTerms) {
        setValue('Terms', vendor.PaymentTerms);
      }
    }
  }, [selectedVendorId, vendors, setValue]);

  useEffect(() => {
    const total = lines.reduce((sum, line) => {
      return sum + (line.Amount || 0);
    }, 0);
    setValue('TotalAmount', total);
  }, [lines, setValue]);

  const isSubmitting = externalIsSubmitting || formIsSubmitting;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center">
        <button onClick={() => navigate('/bills')} className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Controller
            name="VendorId"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                select
                label="Vendor"
                required
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              >
                <MenuItem value="">Select a vendor...</MenuItem>
                {vendors?.map((vendor) => (
                  <MenuItem key={vendor.Id} value={vendor.Id}>
                    {vendor.Name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />

          <Controller
            name="BillNumber"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                label="Bill Number"
                placeholder="BILL-001"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              />
            )}
          />

          <Controller
            name="BillDate"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Bill Date"
                type="date"
                required
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
              />
            )}
          />

          <Controller
            name="DueDate"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Due Date"
                type="date"
                required
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
              />
            )}
          />

          <Controller
            name="Terms"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                select
                label="Payment Terms"
                size="small"
                fullWidth
              >
                <MenuItem value="">Select terms...</MenuItem>
                <MenuItem value="Due on Receipt">Due on Receipt</MenuItem>
                <MenuItem value="Net 15">Net 15</MenuItem>
                <MenuItem value="Net 30">Net 30</MenuItem>
                <MenuItem value="Net 45">Net 45</MenuItem>
                <MenuItem value="Net 60">Net 60</MenuItem>
              </TextField>
            )}
          />

          <Controller
            name="Status"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                select
                label="Status"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              >
                <MenuItem value="Draft">Draft</MenuItem>
                <MenuItem value="Open">Open</MenuItem>
                <MenuItem value="Partial">Partial</MenuItem>
                <MenuItem value="Paid">Paid</MenuItem>
                <MenuItem value="Overdue">Overdue</MenuItem>
              </TextField>
            )}
          />

          <Controller
            name="ProjectId"
            control={control}
            render={({ field }) => (
              <ProjectSelector
                value={field.value || ''}
                onChange={(projectId) => field.onChange(projectId || null)}
                disabled={isSubmitting}
              />
            )}
          />

          <Controller
            name="ClassId"
            control={control}
            render={({ field }) => (
              <ClassSelector
                value={field.value || ''}
                onChange={(classId) => field.onChange(classId || null)}
                disabled={isSubmitting}
              />
            )}
          />

          <div className="sm:col-span-2">
            <Controller
              name="Memo"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  label="Memo"
                  multiline
                  rows={2}
                  placeholder="Add notes about this bill..."
                  size="small"
                  fullWidth
                />
              )}
            />
          </div>
        </div>

        {/* Line Items */}
        <div className="mt-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Line Items</h3>
            <Button
              type="button"
              variant="outlined"
              size="small"
              startIcon={<Plus className="w-4 h-4" />}
              onClick={() => append({ AccountId: '', Description: '', Amount: 0, ProjectId: null, ClassId: null })}
            >
              Add Item
            </Button>
          </div>

          <div className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="flex gap-4 items-start bg-gray-50 dark:bg-gray-700 p-4 rounded-md">
                <div className="w-48">
                  <Controller
                    name={`Lines.${index}.AccountId`}
                    control={control}
                    render={({ field: f, fieldState }) => (
                      <TextField
                        {...f}
                        value={f.value ?? ''}
                        select
                        label="Account"
                        error={!!fieldState.error}
                        helperText={fieldState.error?.message}
                        size="small"
                        fullWidth
                      >
                        <MenuItem value="">Select account...</MenuItem>
                        {expenseAccounts.map((account) => (
                          <MenuItem key={account.Id} value={account.Id}>
                            {account.Name}
                          </MenuItem>
                        ))}
                      </TextField>
                    )}
                  />
                </div>
                <div className="flex-grow">
                  <Controller
                    name={`Lines.${index}.Description`}
                    control={control}
                    render={({ field: f }) => (
                      <TextField
                        {...f}
                        value={f.value ?? ''}
                        label="Description"
                        placeholder="Item description"
                        size="small"
                        fullWidth
                      />
                    )}
                  />
                </div>
                <div className="w-32">
                  {(() => {
                    const { ref, ...rest } = register(`Lines.${index}.Amount`, { valueAsNumber: true });
                    return (
                      <TextField
                        {...rest}
                        inputRef={ref}
                        type="number"
                        label="Amount"
                        slotProps={{ htmlInput: { step: '0.01' } }}
                        error={!!errors.Lines?.[index]?.Amount}
                        helperText={errors.Lines?.[index]?.Amount?.message}
                        size="small"
                        fullWidth
                      />
                    );
                  })()}
                </div>
                <IconButton
                  onClick={() => remove(index)}
                  disabled={fields.length === 1}
                  color="error"
                  sx={{ mt: 0.5 }}
                >
                  <Trash2 className="w-5 h-5" />
                </IconButton>
                <div className="flex gap-4 items-start mt-2">
                  <div className="flex-1">
                    <Controller
                      name={`Lines.${index}.ProjectId`}
                      control={control}
                      render={({ field: pField }) => (
                        <ProjectSelector
                          value={pField.value || ''}
                          onChange={(projectId) => pField.onChange(projectId || null)}
                          disabled={isSubmitting}
                        />
                      )}
                    />
                  </div>
                  <div className="flex-1">
                    <Controller
                      name={`Lines.${index}.ClassId`}
                      control={control}
                      render={({ field: cField }) => (
                        <ClassSelector
                          value={cField.value || ''}
                          onChange={(classId) => cField.onChange(classId || null)}
                          disabled={isSubmitting}
                        />
                      )}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {errors.Lines && typeof errors.Lines === 'object' && 'message' in errors.Lines && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.Lines.message}</p>
          )}
        </div>

        {/* Auto-posting indicator */}
        {settings.invoicePostingMode === 'simple' && (
          <div className={`flex items-center gap-2 p-3 rounded-lg ${
            willAutoPost
              ? 'bg-amber-50 border border-amber-200 dark:bg-amber-950 dark:border-amber-700'
              : 'bg-gray-50 border border-gray-200 dark:bg-gray-700 dark:border-gray-600'
          }`}>
            {willAutoPost ? (
              <>
                <Zap className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-amber-700 dark:text-amber-400">
                  This bill will <strong>post to your books</strong> when saved (AP + Expense entries).
                </span>
              </>
            ) : (
              <>
                <Info className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Draft bills don't affect your books until the status is changed.
                </span>
              </>
            )}
          </div>
        )}

        <div className="flex justify-end items-center border-t dark:border-gray-600 pt-4">
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100 mr-6">
            Total: ${lines.reduce((sum, line) => sum + (line.Amount || 0), 0).toFixed(2)}
          </div>
          <Button
            variant="outlined"
            onClick={() => navigate('/bills')}
            sx={{ mr: 1.5 }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : submitButtonText}
          </Button>
        </div>
      </form>
    </div>
  );
}
