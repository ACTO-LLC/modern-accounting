import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';

interface Account {
  Id: string;
  Code: string;
  Name: string;
}

const lineSchema = z.object({
  AccountId: z.string().min(1, 'Account is required'),
  Description: z.string().optional(),
  Debit: z.number().min(0),
  Credit: z.number().min(0),
}).refine((line) => {
  const hasDebit = line.Debit > 0;
  const hasCredit = line.Credit > 0;
  return (hasDebit && !hasCredit) || (!hasDebit && hasCredit);
}, {
  message: "Each line must have either a Debit OR Credit amount (not both, not neither)",
});

const journalEntrySchema = z.object({
  EntryNumber: z.string().min(1, 'Entry number is required'),
  EntryDate: z.string().min(1, 'Date is required'),
  Description: z.string().min(1, 'Description is required'),
  Status: z.enum(['Draft', 'Posted']),
  Lines: z.array(lineSchema).min(2, 'At least two lines are required')
}).refine((data) => {
  const totalDebit = data.Lines.reduce((sum, line) => sum + (line.Debit || 0), 0);
  const totalCredit = data.Lines.reduce((sum, line) => sum + (line.Credit || 0), 0);
  return Math.abs(totalDebit - totalCredit) < 0.01;
}, {
  message: "Total Debits must equal Total Credits",
  path: ["Lines"],
});

type JournalEntryFormData = z.infer<typeof journalEntrySchema>;

export default function NewJournalEntry() {
  const navigate = useNavigate();
  const { register, control, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<JournalEntryFormData>({
    resolver: zodResolver(journalEntrySchema),
    defaultValues: {
      Status: 'Posted',
      EntryDate: new Date().toISOString().split('T')[0],
      Lines: [
        { AccountId: '', Description: '', Debit: 0, Credit: 0 },
        { AccountId: '', Description: '', Debit: 0, Credit: 0 }
      ]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "Lines"
  });

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: async (): Promise<Account[]> => {
      const response = await api.get<{ value: Account[] }>('/accounts?$orderby=Code');
      return response.data.value;
    },
  });

  const lines = watch("Lines");
  const totalDebit = lines?.reduce((sum, line) => sum + (Number(line.Debit) || 0), 0) || 0;
  const totalCredit = lines?.reduce((sum, line) => sum + (Number(line.Credit) || 0), 0) || 0;
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const onSubmit = async (data: JournalEntryFormData) => {
    try {
      const headerResponse = await api.post('/journalentries', {
        Reference: data.EntryNumber,
        TransactionDate: data.EntryDate,
        Description: data.Description,
        Status: data.Status,
        CreatedBy: 'test-user'
      });

      const responseData = headerResponse.data as any;
      const journalEntryId = responseData.Id || responseData.value?.[0]?.Id;

      if (!journalEntryId) {
        throw new Error('Failed to get Journal Entry ID');
      }

      for (const line of data.Lines) {
        await api.post('/journalentrylines', {
          JournalEntryId: journalEntryId,
          AccountId: line.AccountId,
          Description: line.Description,
          Debit: line.Debit,
          Credit: line.Credit
        });
      }

      navigate('/journal-entries');
    } catch (error: any) {
      console.error('Failed to create journal entry:', error);
      if (error.response) {
        console.error('Error response:', JSON.stringify(error.response.data, null, 2));
      }
      alert('Failed to create journal entry');
    }
  };

  // Extract refs from register for use with MUI TextField
  const { ref: entryNumberRef, ...entryNumberRest } = register('EntryNumber');
  const { ref: descriptionRef, ...descriptionRest } = register('Description');

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center">
        <button onClick={() => navigate('/journal-entries')} className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">New Journal Entry</h1>
      </div>

      <form noValidate onSubmit={handleSubmit(onSubmit)} className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-6">
        {/* Header Fields */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <TextField
            {...entryNumberRest}
            inputRef={entryNumberRef}
            label="Entry Number"
            required
            placeholder="JE-001"
            error={!!errors.EntryNumber}
            helperText={errors.EntryNumber?.message}
            size="small"
            fullWidth
          />

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

          <div className="sm:col-span-2">
            <TextField
              {...descriptionRest}
              inputRef={descriptionRef}
              label="Description"
              required
              placeholder="Opening Balance"
              error={!!errors.Description}
              helperText={errors.Description?.message}
              size="small"
              fullWidth
            />
          </div>
        </div>

        {/* Lines */}
        <div className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Lines</h3>
            <Button
              type="button"
              variant="outlined"
              size="small"
              startIcon={<Plus className="w-4 h-4" />}
              onClick={() => append({ AccountId: '', Description: '', Debit: 0, Credit: 0 })}
            >
              Add Line
            </Button>
          </div>
          <div className="space-y-4">
            {fields.map((field, index) => {
              const { ref: lineDescRef, ...lineDescRest } = register(`Lines.${index}.Description`);
              const { ref: debitRef, ...debitRest } = register(`Lines.${index}.Debit`, { setValueAs: (v: string) => v === '' || v === undefined ? 0 : Number(v) });
              const { ref: creditRef, ...creditRest } = register(`Lines.${index}.Credit`, { setValueAs: (v: string) => v === '' || v === undefined ? 0 : Number(v) });

              return (
                <div key={field.id} className="bg-gray-50 dark:bg-gray-700 p-4 rounded-md">
                  <div className="flex gap-4 items-start">
                    <div className="flex-1">
                      <Controller
                        name={`Lines.${index}.AccountId`}
                        control={control}
                        render={({ field: accountField }) => (
                          <Autocomplete
                            options={accounts}
                            getOptionLabel={(option: Account) => `${option.Code} - ${option.Name}`}
                            value={accounts.find((a) => a.Id === accountField.value) ?? null}
                            onChange={(_event, newValue: Account | null) => {
                              accountField.onChange(newValue?.Id ?? '');
                            }}
                            isOptionEqualToValue={(option: Account, val: Account) => option.Id === val.Id}
                            loading={accountsLoading}
                            size="small"
                            renderOption={(props, option: Account) => {
                              const { key, ...rest } = props;
                              return (
                                <li key={key} {...rest}>
                                  <div>
                                    <div className="font-medium">{option.Code} - {option.Name}</div>
                                  </div>
                                </li>
                              );
                            }}
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                label="Account"
                                placeholder="Search accounts..."
                                error={!!errors.Lines?.[index]?.AccountId}
                                helperText={errors.Lines?.[index]?.AccountId?.message}
                                slotProps={{
                                  input: {
                                    ...params.InputProps,
                                    endAdornment: (
                                      <>
                                        {accountsLoading ? <CircularProgress color="inherit" size={20} /> : null}
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
                    <div className="flex-1">
                      <TextField
                        {...lineDescRest}
                        inputRef={lineDescRef}
                        label="Line Description"
                        placeholder="Line Description"
                        size="small"
                        fullWidth
                      />
                    </div>
                    <div className="w-32">
                      <TextField
                        {...debitRest}
                        inputRef={debitRef}
                        type="number"
                        label="Debit"
                        placeholder="Debit"
                        size="small"
                        fullWidth
                        slotProps={{ htmlInput: { step: '0.01' } }}
                      />
                    </div>
                    <div className="w-32">
                      <TextField
                        {...creditRest}
                        inputRef={creditRef}
                        type="number"
                        label="Credit"
                        placeholder="Credit"
                        size="small"
                        fullWidth
                        slotProps={{ htmlInput: { step: '0.01' } }}
                      />
                    </div>
                    <IconButton
                      onClick={() => remove(index)}
                      color="error"
                      size="small"
                      sx={{ mt: 1 }}
                    >
                      <Trash2 className="w-5 h-5" />
                    </IconButton>
                  </div>
                  {errors.Lines?.[index] && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                      {errors.Lines[index]?.message || errors.Lines[index]?.AccountId?.message}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Totals */}
        <div className="border-t dark:border-gray-600 pt-4 flex justify-end space-x-8 text-sm font-medium">
          <div>
            <span className="text-gray-500 dark:text-gray-400">Total Debit:</span>
            <span className="ml-2 text-gray-900 dark:text-gray-100">${totalDebit.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Total Credit:</span>
            <span className="ml-2 text-gray-900 dark:text-gray-100">${totalCredit.toFixed(2)}</span>
          </div>
          <div className={isBalanced ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
            {isBalanced ? "Balanced" : "Unbalanced"}
          </div>
        </div>
        {errors.Lines && <p className="text-right text-sm text-red-600 dark:text-red-400">{errors.Lines.message}</p>}

        <div className="flex justify-end items-center border-t dark:border-gray-600 pt-4">
          <Button
            variant="outlined"
            onClick={() => navigate('/journal-entries')}
            sx={{ mr: 1.5 }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting || !isBalanced}
          >
            {isSubmitting ? 'Posting...' : 'Post Entry'}
          </Button>
        </div>
      </form>
    </div>
  );
}
