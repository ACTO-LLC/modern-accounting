import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import AddressAutocomplete, { AddressSuggestion } from './AddressAutocomplete';
import { US_STATES } from './AddressFields';
import PlaidBankVerification from './PlaidBankVerification';

const FILING_STATUSES = [
  { value: 'Single', label: 'Single' },
  { value: 'MarriedFilingJointly', label: 'Married Filing Jointly' },
  { value: 'MarriedFilingSeparately', label: 'Married Filing Separately' },
  { value: 'HeadOfHousehold', label: 'Head of Household' },
];

const PAY_TYPES = [
  { value: 'Hourly', label: 'Hourly' },
  { value: 'Salary', label: 'Salary' },
];

const PAY_FREQUENCIES = [
  { value: 'Weekly', label: 'Weekly' },
  { value: 'Biweekly', label: 'Biweekly' },
  { value: 'Semimonthly', label: 'Semimonthly' },
  { value: 'Monthly', label: 'Monthly' },
];

const EMPLOYEE_STATUSES = [
  { value: 'Active', label: 'Active' },
  { value: 'Inactive', label: 'Inactive' },
  { value: 'Terminated', label: 'Terminated' },
];

const BANK_ACCOUNT_TYPES = [
  { value: '', label: 'Select Type' },
  { value: 'Checking', label: 'Checking' },
  { value: 'Savings', label: 'Savings' },
];

// Use .nullish() to accept both null (from API) and undefined (see CLAUDE.md)
export const employeeSchema = z.object({
  EmployeeNumber: z.string().min(1, 'Employee number is required'),
  FirstName: z.string().min(1, 'First name is required'),
  LastName: z.string().min(1, 'Last name is required'),
  Email: z.string().email('Invalid email address').nullish().or(z.literal('')),
  Phone: z.string().nullish(),
  SSNLast4: z.string().max(4, 'Enter only last 4 digits').nullish().or(z.literal('')),
  DateOfBirth: z.string().nullish().or(z.literal('')),
  HireDate: z.string().min(1, 'Hire date is required'),
  TerminationDate: z.string().nullish().or(z.literal('')),
  PayType: z.enum(['Hourly', 'Salary']),
  PayRate: z.coerce.number().min(0, 'Pay rate must be positive'),
  PayFrequency: z.enum(['Weekly', 'Biweekly', 'Semimonthly', 'Monthly']),
  FederalFilingStatus: z.string().min(1, 'Federal filing status is required'),
  FederalAllowances: z.coerce.number().min(0).nullish(),
  StateCode: z.string().nullish().or(z.literal('')),
  StateFilingStatus: z.string().nullish().or(z.literal('')),
  StateAllowances: z.coerce.number().min(0).nullish(),
  BankRoutingNumber: z.string().max(9).nullish().or(z.literal('')),
  BankAccountNumber: z.string().nullish().or(z.literal('')),
  BankAccountType: z.string().nullish().or(z.literal('')),
  Address: z.string().nullish().or(z.literal('')),
  City: z.string().nullish().or(z.literal('')),
  State: z.string().nullish().or(z.literal('')),
  ZipCode: z.string().nullish().or(z.literal('')),
  Status: z.enum(['Active', 'Inactive', 'Terminated']).nullish(),
});

export type EmployeeFormData = z.infer<typeof employeeSchema>;

interface EmployeeFormProps {
  initialValues?: Partial<EmployeeFormData>;
  onSubmit: (data: EmployeeFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
  submitButtonText?: string;
  employeeId?: string; // For bank verification (only on edit)
  bankVerificationStatus?: string;
  bankInstitutionName?: string;
  bankVerifiedAt?: string;
}

export default function EmployeeForm({
  initialValues,
  onSubmit,
  title,
  isSubmitting,
  submitButtonText = 'Save Employee',
  employeeId,
  bankVerificationStatus,
  bankInstitutionName,
  bankVerifiedAt,
}: EmployeeFormProps) {
  const navigate = useNavigate();
  const { handleSubmit, watch, control, setValue } = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      EmployeeNumber: '',
      FirstName: '',
      LastName: '',
      Email: '',
      Phone: '',
      SSNLast4: '',
      DateOfBirth: '',
      HireDate: '',
      TerminationDate: '',
      PayType: 'Hourly',
      PayRate: 0,
      PayFrequency: 'Biweekly',
      FederalFilingStatus: 'Single',
      FederalAllowances: 0,
      StateCode: '',
      StateFilingStatus: '',
      StateAllowances: 0,
      BankRoutingNumber: '',
      BankAccountNumber: '',
      BankAccountType: '',
      Address: '',
      City: '',
      State: '',
      ZipCode: '',
      Status: 'Active',
      ...initialValues,
    },
  });

  // Handle address selection from autocomplete
  const handleAddressSelect = (suggestion: AddressSuggestion) => {
    setValue('City', suggestion.city, { shouldDirty: true });
    setValue('State', suggestion.state, { shouldDirty: true });
    setValue('ZipCode', suggestion.postalCode, { shouldDirty: true });
  };

  const payType = watch('PayType');

  const sectionClass = "bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-4";
  const sectionTitleClass = "text-lg font-medium text-gray-900 dark:text-white border-b pb-2 mb-4 dark:border-gray-600";

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center">
        <button onClick={() => navigate('/employees')} className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{title}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Personal Information */}
        <div className={sectionClass}>
          <h2 className={sectionTitleClass}>Personal Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Controller
              name="FirstName"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="First Name"
                  required
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  size="small"
                  fullWidth
                />
              )}
            />
            <Controller
              name="LastName"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Last Name"
                  required
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  size="small"
                  fullWidth
                />
              )}
            />
            <Controller
              name="Email"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  label="Email"
                  type="email"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  size="small"
                  fullWidth
                />
              )}
            />
            <Controller
              name="Phone"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  label="Phone"
                  placeholder="(555) 123-4567"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  size="small"
                  fullWidth
                />
              )}
            />
            <Controller
              name="SSNLast4"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  label="SSN (Last 4 Digits)"
                  placeholder="1234"
                  slotProps={{ htmlInput: { maxLength: 4 } }}
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  size="small"
                  fullWidth
                />
              )}
            />
            <Controller
              name="DateOfBirth"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  label="Date of Birth"
                  type="date"
                  slotProps={{ inputLabel: { shrink: true } }}
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  size="small"
                  fullWidth
                />
              )}
            />
          </div>
        </div>

        {/* Employment Information */}
        <div className={sectionClass}>
          <h2 className={sectionTitleClass}>Employment Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Controller
              name="EmployeeNumber"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Employee Number"
                  required
                  placeholder="EMP001"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  size="small"
                  fullWidth
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
                  {EMPLOYEE_STATUSES.map(s => (
                    <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name="HireDate"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Hire Date"
                  required
                  type="date"
                  slotProps={{ inputLabel: { shrink: true } }}
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  size="small"
                  fullWidth
                />
              )}
            />
            <Controller
              name="TerminationDate"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  label="Termination Date"
                  type="date"
                  slotProps={{ inputLabel: { shrink: true } }}
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  size="small"
                  fullWidth
                />
              )}
            />
          </div>
        </div>

        {/* Compensation */}
        <div className={sectionClass}>
          <h2 className={sectionTitleClass}>Compensation</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Controller
              name="PayType"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  select
                  label="Pay Type"
                  required
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  size="small"
                  fullWidth
                >
                  {PAY_TYPES.map(t => (
                    <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name="PayRate"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label={payType === 'Hourly' ? 'Hourly Rate' : 'Annual Salary'}
                  required
                  type="number"
                  placeholder={payType === 'Hourly' ? '25.00' : '52000.00'}
                  slotProps={{
                    input: {
                      startAdornment: <InputAdornment position="start">$</InputAdornment>,
                    },
                    htmlInput: { step: '0.01', min: '0' },
                  }}
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  size="small"
                  fullWidth
                />
              )}
            />
            <Controller
              name="PayFrequency"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  select
                  label="Pay Frequency"
                  required
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  size="small"
                  fullWidth
                >
                  {PAY_FREQUENCIES.map(f => (
                    <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>
                  ))}
                </TextField>
              )}
            />
          </div>
        </div>

        {/* Tax Information */}
        <div className={sectionClass}>
          <h2 className={sectionTitleClass}>Tax Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Federal Tax */}
            <div className="space-y-4">
              <h3 className="text-md font-medium text-gray-800 dark:text-gray-200">Federal Tax</h3>
              <Controller
                name="FederalFilingStatus"
                control={control}
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    value={field.value ?? ''}
                    select
                    label="Filing Status"
                    required
                    error={!!fieldState.error}
                    helperText={fieldState.error?.message}
                    size="small"
                    fullWidth
                  >
                    {FILING_STATUSES.map(s => (
                      <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                    ))}
                  </TextField>
                )}
              />
              <Controller
                name="FederalAllowances"
                control={control}
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    value={field.value ?? ''}
                    label="Allowances"
                    type="number"
                    slotProps={{ htmlInput: { min: '0' } }}
                    error={!!fieldState.error}
                    helperText={fieldState.error?.message}
                    size="small"
                    fullWidth
                  />
                )}
              />
            </div>

            {/* State Tax */}
            <div className="space-y-4">
              <h3 className="text-md font-medium text-gray-800 dark:text-gray-200">State Tax</h3>
              <Controller
                name="StateCode"
                control={control}
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    value={field.value ?? ''}
                    select
                    label="Work State"
                    error={!!fieldState.error}
                    helperText={fieldState.error?.message}
                    size="small"
                    fullWidth
                  >
                    {US_STATES.map(s => (
                      <MenuItem key={s.code} value={s.code}>{s.name}</MenuItem>
                    ))}
                  </TextField>
                )}
              />
              <Controller
                name="StateFilingStatus"
                control={control}
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    value={field.value ?? ''}
                    select
                    label="State Filing Status"
                    error={!!fieldState.error}
                    helperText={fieldState.error?.message}
                    size="small"
                    fullWidth
                  >
                    <MenuItem value="">Use Federal Status</MenuItem>
                    {FILING_STATUSES.map(s => (
                      <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                    ))}
                  </TextField>
                )}
              />
              <Controller
                name="StateAllowances"
                control={control}
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    value={field.value ?? ''}
                    label="State Allowances"
                    type="number"
                    slotProps={{ htmlInput: { min: '0' } }}
                    error={!!fieldState.error}
                    helperText={fieldState.error?.message}
                    size="small"
                    fullWidth
                  />
                )}
              />
            </div>
          </div>
        </div>

        {/* Direct Deposit */}
        <div className={sectionClass}>
          <h2 className={sectionTitleClass}>Direct Deposit (Optional)</h2>

          {/* Plaid Bank Verification - only show on edit when employeeId is available */}
          {employeeId && (
            <div className="mb-6">
              <PlaidBankVerification
                employeeId={employeeId}
                initialStatus={{
                  status: (bankVerificationStatus as 'Unverified' | 'Pending' | 'Verified' | 'Failed' | 'Expired') || 'Unverified',
                  verifiedAt: bankVerifiedAt,
                  institutionName: bankInstitutionName,
                  hasBankInfo: !!(initialValues?.BankRoutingNumber && initialValues?.BankAccountNumber),
                }}
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Controller
              name="BankRoutingNumber"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  label="Routing Number"
                  placeholder="123456789"
                  slotProps={{ htmlInput: { maxLength: 9 } }}
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  size="small"
                  fullWidth
                />
              )}
            />
            <Controller
              name="BankAccountNumber"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  label="Account Number"
                  placeholder="************1234"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  size="small"
                  fullWidth
                />
              )}
            />
            <Controller
              name="BankAccountType"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  select
                  label="Account Type"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  size="small"
                  fullWidth
                >
                  {BANK_ACCOUNT_TYPES.map(t => (
                    <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                  ))}
                </TextField>
              )}
            />
          </div>

          {!employeeId && (
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              Save the employee first to enable Plaid bank verification for secure direct deposits.
            </p>
          )}
        </div>

        {/* Address */}
        <div className={sectionClass}>
          <h2 className={sectionTitleClass}>Address</h2>
          <div className="grid grid-cols-1 gap-4">
            <Controller
              name="Address"
              control={control}
              render={({ field, fieldState }) => (
                <AddressAutocomplete
                  id="Address"
                  label="Street Address"
                  value={field.value || ''}
                  onChange={field.onChange}
                  onAddressSelect={handleAddressSelect}
                  error={fieldState.error?.message}
                />
              )}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Controller
                name="City"
                control={control}
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    value={field.value ?? ''}
                    label="City"
                    error={!!fieldState.error}
                    helperText={fieldState.error?.message}
                    size="small"
                    fullWidth
                  />
                )}
              />
              <Controller
                name="State"
                control={control}
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    value={field.value ?? ''}
                    select
                    label="State"
                    error={!!fieldState.error}
                    helperText={fieldState.error?.message}
                    size="small"
                    fullWidth
                  >
                    {US_STATES.map(s => (
                      <MenuItem key={s.code} value={s.code}>{s.name}</MenuItem>
                    ))}
                  </TextField>
                )}
              />
              <Controller
                name="ZipCode"
                control={control}
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    value={field.value ?? ''}
                    label="ZIP Code"
                    placeholder="12345"
                    slotProps={{ htmlInput: { maxLength: 10 } }}
                    error={!!fieldState.error}
                    helperText={fieldState.error?.message}
                    size="small"
                    fullWidth
                  />
                )}
              />
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end items-center pt-4">
          <Button
            variant="outlined"
            onClick={() => navigate('/employees')}
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
