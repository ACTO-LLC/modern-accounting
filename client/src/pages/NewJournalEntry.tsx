import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
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

type JournalEntryForm = z.infer<typeof journalEntrySchema>;

export default function NewJournalEntry() {
  const navigate = useNavigate();
  const { register, control, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<JournalEntryForm>({
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

  const onSubmit = async (data: JournalEntryForm) => {
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
          <div>
            <label htmlFor="EntryNumber" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Entry Number</label>
            <input
              id="EntryNumber"
              type="text"
              {...register('EntryNumber')}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
              placeholder="JE-001"
            />
            {errors.EntryNumber && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.EntryNumber.message}</p>}
          </div>

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

          <div className="sm:col-span-2">
            <label htmlFor="Description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
            <input
              id="Description"
              type="text"
              {...register('Description')}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
              placeholder="Opening Balance"
            />
            {errors.Description && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.Description.message}</p>}
          </div>
        </div>

        {/* Lines */}
        <div className="mt-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Lines</h3>
          <div className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id}>
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
                    <input
                      {...register(`Lines.${index}.Description`)}
                      placeholder="Line Description"
                      className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                    />
                  </div>
                  <div className="w-32">
                    <input
                      type="number"
                      step="0.01"
                      {...register(`Lines.${index}.Debit`, { setValueAs: (v: string) => v === '' || v === undefined ? 0 : Number(v) })}
                      placeholder="Debit"
                      className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                    />
                  </div>
                  <div className="w-32">
                    <input
                      type="number"
                      step="0.01"
                      {...register(`Lines.${index}.Credit`, { setValueAs: (v: string) => v === '' || v === undefined ? 0 : Number(v) })}
                      placeholder="Credit"
                      className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="p-2 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
                {errors.Lines?.[index] && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {errors.Lines[index]?.message || errors.Lines[index]?.AccountId?.message}
                  </p>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => append({ AccountId: '', Description: '', Debit: 0, Credit: 0 })}
            className="mt-4 flex items-center text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Line
          </button>
        </div>

        {/* Totals */}
        <div className="border-t border-gray-200 dark:border-gray-600 pt-4 flex justify-end space-x-8 text-sm font-medium">
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

        <div className="flex justify-end pt-4">
          <button
            type="button"
            onClick={() => navigate('/journal-entries')}
            className="mr-3 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !isBalanced}
            className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {isSubmitting ? 'Posting...' : 'Post Entry'}
          </button>
        </div>
      </form>
    </div>
  );
}
