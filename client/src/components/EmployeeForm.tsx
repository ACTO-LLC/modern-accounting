import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
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
  const { register, handleSubmit, formState: { errors }, watch, control, setValue } = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      PayType: 'Hourly',
      PayFrequency: 'Biweekly',
      FederalFilingStatus: 'Single',
      FederalAllowances: 0,
      StateAllowances: 0,
      Status: 'Active',
      ...initialValues
    }
  });

  // Handle address selection from autocomplete
  const handleAddressSelect = (suggestion: AddressSuggestion) => {
    setValue('City', suggestion.city, { shouldDirty: true });
    setValue('State', suggestion.state, { shouldDirty: true });
    setValue('ZipCode', suggestion.postalCode, { shouldDirty: true });
  };

  const payType = watch('PayType');

  const inputClass = "mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white";
  const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300";
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
            <div>
              <label htmlFor="FirstName" className={labelClass}>First Name *</label>
              <input id="FirstName" type="text" {...register('FirstName')} className={inputClass} />
              {errors.FirstName && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.FirstName.message}</p>}
            </div>
            <div>
              <label htmlFor="LastName" className={labelClass}>Last Name *</label>
              <input id="LastName" type="text" {...register('LastName')} className={inputClass} />
              {errors.LastName && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.LastName.message}</p>}
            </div>
            <div>
              <label htmlFor="Email" className={labelClass}>Email</label>
              <input id="Email" type="email" {...register('Email')} className={inputClass} />
              {errors.Email && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.Email.message}</p>}
            </div>
            <div>
              <label htmlFor="Phone" className={labelClass}>Phone</label>
              <input id="Phone" type="text" {...register('Phone')} className={inputClass} placeholder="(555) 123-4567" />
            </div>
            <div>
              <label htmlFor="SSNLast4" className={labelClass}>SSN (Last 4 Digits)</label>
              <input id="SSNLast4" type="text" maxLength={4} {...register('SSNLast4')} className={inputClass} placeholder="1234" />
              {errors.SSNLast4 && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.SSNLast4.message}</p>}
            </div>
            <div>
              <label htmlFor="DateOfBirth" className={labelClass}>Date of Birth</label>
              <input id="DateOfBirth" type="date" {...register('DateOfBirth')} className={inputClass} />
            </div>
          </div>
        </div>

        {/* Employment Information */}
        <div className={sectionClass}>
          <h2 className={sectionTitleClass}>Employment Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="EmployeeNumber" className={labelClass}>Employee Number *</label>
              <input id="EmployeeNumber" type="text" {...register('EmployeeNumber')} className={inputClass} placeholder="EMP001" />
              {errors.EmployeeNumber && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.EmployeeNumber.message}</p>}
            </div>
            <div>
              <label htmlFor="Status" className={labelClass}>Status</label>
              <select id="Status" {...register('Status')} className={inputClass}>
                {EMPLOYEE_STATUSES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="HireDate" className={labelClass}>Hire Date *</label>
              <input id="HireDate" type="date" {...register('HireDate')} className={inputClass} />
              {errors.HireDate && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.HireDate.message}</p>}
            </div>
            <div>
              <label htmlFor="TerminationDate" className={labelClass}>Termination Date</label>
              <input id="TerminationDate" type="date" {...register('TerminationDate')} className={inputClass} />
            </div>
          </div>
        </div>

        {/* Compensation */}
        <div className={sectionClass}>
          <h2 className={sectionTitleClass}>Compensation</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="PayType" className={labelClass}>Pay Type *</label>
              <select id="PayType" {...register('PayType')} className={inputClass}>
                {PAY_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="PayRate" className={labelClass}>
                {payType === 'Hourly' ? 'Hourly Rate *' : 'Annual Salary *'}
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 dark:text-gray-400">$</span>
                <input
                  id="PayRate"
                  type="number"
                  step="0.01"
                  {...register('PayRate')}
                  className={`${inputClass} pl-7`}
                  placeholder={payType === 'Hourly' ? '25.00' : '52000.00'}
                />
              </div>
              {errors.PayRate && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.PayRate.message}</p>}
            </div>
            <div>
              <label htmlFor="PayFrequency" className={labelClass}>Pay Frequency *</label>
              <select id="PayFrequency" {...register('PayFrequency')} className={inputClass}>
                {PAY_FREQUENCIES.map(f => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Tax Information */}
        <div className={sectionClass}>
          <h2 className={sectionTitleClass}>Tax Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Federal Tax */}
            <div className="space-y-4">
              <h3 className="text-md font-medium text-gray-800 dark:text-gray-200">Federal Tax</h3>
              <div>
                <label htmlFor="FederalFilingStatus" className={labelClass}>Filing Status *</label>
                <select id="FederalFilingStatus" {...register('FederalFilingStatus')} className={inputClass}>
                  {FILING_STATUSES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="FederalAllowances" className={labelClass}>Allowances</label>
                <input id="FederalAllowances" type="number" min="0" {...register('FederalAllowances')} className={inputClass} />
              </div>
            </div>

            {/* State Tax */}
            <div className="space-y-4">
              <h3 className="text-md font-medium text-gray-800 dark:text-gray-200">State Tax</h3>
              <div>
                <label htmlFor="StateCode" className={labelClass}>Work State</label>
                <select id="StateCode" {...register('StateCode')} className={inputClass}>
                  {US_STATES.map(s => (
                    <option key={s.code} value={s.code}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="StateFilingStatus" className={labelClass}>State Filing Status</label>
                <select id="StateFilingStatus" {...register('StateFilingStatus')} className={inputClass}>
                  <option value="">Use Federal Status</option>
                  {FILING_STATUSES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="StateAllowances" className={labelClass}>State Allowances</label>
                <input id="StateAllowances" type="number" min="0" {...register('StateAllowances')} className={inputClass} />
              </div>
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
            <div>
              <label htmlFor="BankRoutingNumber" className={labelClass}>Routing Number</label>
              <input id="BankRoutingNumber" type="text" maxLength={9} {...register('BankRoutingNumber')} className={inputClass} placeholder="123456789" />
            </div>
            <div>
              <label htmlFor="BankAccountNumber" className={labelClass}>Account Number</label>
              <input id="BankAccountNumber" type="text" {...register('BankAccountNumber')} className={inputClass} placeholder="************1234" />
            </div>
            <div>
              <label htmlFor="BankAccountType" className={labelClass}>Account Type</label>
              <select id="BankAccountType" {...register('BankAccountType')} className={inputClass}>
                {BANK_ACCOUNT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
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
              render={({ field }) => (
                <AddressAutocomplete
                  id="Address"
                  label="Street Address"
                  labelClassName={labelClass}
                  className={inputClass}
                  value={field.value || ''}
                  onChange={field.onChange}
                  onAddressSelect={handleAddressSelect}
                  error={errors.Address?.message}
                />
              )}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="City" className={labelClass}>City</label>
                <input id="City" type="text" {...register('City')} className={inputClass} />
              </div>
              <div>
                <label htmlFor="State" className={labelClass}>State</label>
                <select id="State" {...register('State')} className={inputClass}>
                  {US_STATES.map(s => (
                    <option key={s.code} value={s.code}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ZipCode" className={labelClass}>ZIP Code</label>
                <input id="ZipCode" type="text" maxLength={10} {...register('ZipCode')} className={inputClass} placeholder="12345" />
              </div>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end items-center pt-4">
          <button
            type="button"
            onClick={() => navigate('/employees')}
            className="mr-3 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : submitButtonText}
          </button>
        </div>
      </form>
    </div>
  );
}
