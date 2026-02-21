import { useForm, useFieldArray, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import api from '../lib/api';
import ProductServiceSelector, { ProductService } from './ProductServiceSelector';

// Line item schema with proper validation
const lineItemSchema = z.object({
  Id: z.string().nullish(),
  ProductServiceId: z.string().nullish(),
  Description: z.string().min(1, 'Description is required'),
  Quantity: z.number().min(0.0001, 'Quantity must be positive'),
  UnitPrice: z.number().min(0, 'Unit price must be zero or positive'),
  Amount: z.number().nullish()
});

// Main purchase order schema with date validation
export const purchaseOrderSchema = z.object({
  PONumber: z.string().min(1, 'PO number is required'),
  VendorId: z.string().uuid('Please select a valid vendor'),
  PODate: z.string().min(1, 'PO date is required'),
  ExpectedDate: z.string().optional(),
  Subtotal: z.number().min(0, 'Subtotal must be zero or positive'),
  Total: z.number().min(0, 'Total must be zero or positive'),
  Status: z.enum(['Draft', 'Sent', 'Received', 'Partial', 'Cancelled']),
  Notes: z.string().optional(),
  Lines: z.array(lineItemSchema).min(1, 'At least one line item is required')
}).refine((data) => {
  // Validate that ExpectedDate is on or after PODate if both are provided
  if (data.ExpectedDate && data.PODate) {
    return new Date(data.ExpectedDate) >= new Date(data.PODate);
  }
  return true;
}, {
  message: 'Expected date must be on or after the PO date',
  path: ['ExpectedDate']
});

export type PurchaseOrderFormData = z.infer<typeof purchaseOrderSchema>;

export interface PurchaseOrderLine {
  Id?: string;
  ProductServiceId?: string;
  Description: string;
  Quantity: number;
  UnitPrice: number;
  Amount?: number;
}

interface Vendor {
  Id: string;
  Name: string;
  PaymentTerms: string;
}

interface PurchaseOrderFormProps {
  initialValues?: Partial<PurchaseOrderFormData>;
  onSubmit: (data: PurchaseOrderFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
  submitButtonText?: string;
}

export default function PurchaseOrderForm({ initialValues, onSubmit, title, isSubmitting: externalIsSubmitting, submitButtonText = 'Save Purchase Order' }: PurchaseOrderFormProps) {
  const navigate = useNavigate();

  const { data: vendors } = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const response = await api.get<{ value: Vendor[] }>('/vendors');
      return response.data.value;
    },
  });

  const { register, control, handleSubmit, setValue, formState: { errors, isSubmitting: formIsSubmitting } } = useForm<PurchaseOrderFormData>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: {
      Status: 'Draft',
      PODate: new Date().toISOString().split('T')[0],
      ExpectedDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 2 weeks from now
      Lines: [{ ProductServiceId: '', Description: '', Quantity: 1, UnitPrice: 0 }],
      Subtotal: 0,
      Total: 0,
      Notes: '',
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

  useEffect(() => {
    const subtotal = lines.reduce((sum, line) => {
      return sum + (line.Quantity || 0) * (line.UnitPrice || 0);
    }, 0);
    setValue('Subtotal', subtotal);
    setValue('Total', subtotal); // For now, total equals subtotal (no taxes on POs)
  }, [lines, setValue]);

  const isSubmitting = externalIsSubmitting || formIsSubmitting;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center">
        <button onClick={() => navigate('/purchase-orders')} className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Controller
            name="PONumber"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="PO Number"
                required
                placeholder="PO-001"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              />
            )}
          />

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
            name="PODate"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="PO Date"
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
            name="ExpectedDate"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                label="Expected Delivery Date"
                type="date"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
              />
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
                <MenuItem value="Sent">Sent</MenuItem>
                <MenuItem value="Received">Received</MenuItem>
                <MenuItem value="Partial">Partial</MenuItem>
                <MenuItem value="Cancelled">Cancelled</MenuItem>
              </TextField>
            )}
          />
        </div>

        {/* Notes */}
        <Controller
          name="Notes"
          control={control}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              value={field.value ?? ''}
              label="Notes"
              multiline
              rows={3}
              placeholder="Additional notes for this purchase order..."
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
              size="small"
              fullWidth
            />
          )}
        />

        {/* Line Items */}
        <div className="mt-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              Line Items <span className="text-red-500">*</span>
            </h3>
            <Button
              type="button"
              variant="outlined"
              size="small"
              startIcon={<Plus className="w-4 h-4" />}
              onClick={() => append({ ProductServiceId: '', Description: '', Quantity: 1, UnitPrice: 0 })}
            >
              Add Item
            </Button>
          </div>

          <div className="space-y-4">
            {fields.map((field, index) => {
              const handleProductServiceSelect = (productServiceId: string, productService?: ProductService) => {
                setValue(`Lines.${index}.ProductServiceId`, productServiceId);
                if (productService) {
                  // Auto-populate description and price from product/service
                  setValue(`Lines.${index}.Description`, productService.Name);
                  // Use PurchaseCost for purchase orders (not SalesPrice)
                  if (productService.PurchaseCost !== null) {
                    setValue(`Lines.${index}.UnitPrice`, productService.PurchaseCost);
                  } else if (productService.SalesPrice !== null) {
                    // Fall back to sales price if no purchase cost is set
                    setValue(`Lines.${index}.UnitPrice`, productService.SalesPrice);
                  }
                }
              };

              const qtyReg = register(`Lines.${index}.Quantity`, { valueAsNumber: true });
              const priceReg = register(`Lines.${index}.UnitPrice`, { valueAsNumber: true });

              return (
                <div key={field.id} className="bg-gray-50 p-4 rounded-md dark:bg-gray-700">
                  <div className="flex gap-4 items-start mb-3">
                    <div className="flex-grow">
                      <Controller
                        name={`Lines.${index}.ProductServiceId`}
                        control={control}
                        render={({ field: psField }) => (
                          <ProductServiceSelector
                            value={psField.value || ''}
                            onChange={handleProductServiceSelect}
                            disabled={isSubmitting}
                            placeholder="Select or type description below"
                          />
                        )}
                      />
                    </div>
                  </div>
                  <div className="flex gap-4 items-start">
                    <div className="flex-grow">
                      <Controller
                        name={`Lines.${index}.Description`}
                        control={control}
                        render={({ field: descField, fieldState }) => (
                          <TextField
                            {...descField}
                            value={descField.value ?? ''}
                            label="Description"
                            required
                            placeholder="Item description"
                            error={!!fieldState.error}
                            helperText={fieldState.error?.message}
                            size="small"
                            fullWidth
                          />
                        )}
                      />
                    </div>
                    <div className="w-24">
                      <TextField
                        {...qtyReg}
                        inputRef={qtyReg.ref}
                        type="number"
                        label="Qty"
                        required
                        slotProps={{ htmlInput: { step: '0.0001', min: '0.0001' } }}
                        error={!!errors.Lines?.[index]?.Quantity}
                        helperText={errors.Lines?.[index]?.Quantity?.message}
                        size="small"
                        fullWidth
                      />
                    </div>
                    <div className="w-32">
                      <TextField
                        {...priceReg}
                        inputRef={priceReg.ref}
                        type="number"
                        label="Unit Price"
                        required
                        slotProps={{ htmlInput: { step: '0.01', min: '0' } }}
                        error={!!errors.Lines?.[index]?.UnitPrice}
                        helperText={errors.Lines?.[index]?.UnitPrice?.message}
                        size="small"
                        fullWidth
                      />
                    </div>
                    <div className="w-32">
                      <div className="mt-1 py-2 px-3 text-sm text-gray-700 font-medium dark:text-gray-300">
                        ${((lines[index]?.Quantity || 0) * (lines[index]?.UnitPrice || 0)).toFixed(2)}
                      </div>
                    </div>
                    <IconButton
                      onClick={() => remove(index)}
                      disabled={fields.length === 1}
                      color="error"
                      title={fields.length === 1 ? 'At least one line item is required' : 'Remove item'}
                      sx={{ mt: 0.5 }}
                    >
                      <Trash2 className="w-5 h-5" />
                    </IconButton>
                  </div>
                </div>
              );
            })}
          </div>
          {errors.Lines && typeof errors.Lines.message === 'string' && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.Lines.message}</p>
          )}
        </div>

        <div className="flex justify-end items-center border-t pt-4 dark:border-gray-600">
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100 mr-6">
            Total: ${lines.reduce((sum, line) => sum + (line.Quantity || 0) * (line.UnitPrice || 0), 0).toFixed(2)}
          </div>
          <Button
            variant="outlined"
            onClick={() => navigate('/purchase-orders')}
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
