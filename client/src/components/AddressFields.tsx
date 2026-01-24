import { UseFormRegister, FieldErrors } from 'react-hook-form';

// US States for dropdown
export const US_STATES = [
  { code: '', name: 'Select State' },
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
];

// Common address field names that forms will use
export interface AddressFieldValues {
  AddressLine1?: string | null;
  AddressLine2?: string | null;
  City?: string | null;
  State?: string | null;
  PostalCode?: string | null;
  Country?: string | null;
}

interface AddressFieldsProps<T extends AddressFieldValues> {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
  /** Show AddressLine2 field (default: true) */
  showLine2?: boolean;
  /** Show Country field (default: false) */
  showCountry?: boolean;
  /** Whether fields are required (default: false) */
  required?: boolean;
  /** Custom class for inputs */
  inputClassName?: string;
  /** Custom class for labels */
  labelClassName?: string;
}

export default function AddressFields<T extends AddressFieldValues>({
  register,
  errors,
  showLine2 = true,
  showCountry = false,
  required = false,
  inputClassName = "mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2",
  labelClassName = "block text-sm font-medium text-gray-700",
}: AddressFieldsProps<T>) {
  const getError = (field: keyof AddressFieldValues): string | undefined => {
    // Cast errors to any to avoid TypeScript index signature issues
    const fieldErrors = errors as Record<string, { message?: string } | undefined>;
    return fieldErrors[field]?.message;
  };

  return (
    <div className="space-y-4">
      {/* Address Line 1 */}
      <div>
        <label htmlFor="AddressLine1" className={labelClassName}>
          Street Address {required && '*'}
        </label>
        <input
          id="AddressLine1"
          type="text"
          {...register('AddressLine1' as any)}
          placeholder="123 Main St"
          className={inputClassName}
        />
        {getError('AddressLine1') && (
          <p className="mt-1 text-sm text-red-600">{getError('AddressLine1')}</p>
        )}
      </div>

      {/* Address Line 2 (optional) */}
      {showLine2 && (
        <div>
          <label htmlFor="AddressLine2" className={labelClassName}>
            Address Line 2
          </label>
          <input
            id="AddressLine2"
            type="text"
            {...register('AddressLine2' as any)}
            placeholder="Apt, Suite, Unit, etc."
            className={inputClassName}
          />
          {getError('AddressLine2') && (
            <p className="mt-1 text-sm text-red-600">{getError('AddressLine2')}</p>
          )}
        </div>
      )}

      {/* City, State, Postal Code row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="City" className={labelClassName}>
            City {required && '*'}
          </label>
          <input
            id="City"
            type="text"
            {...register('City' as any)}
            className={inputClassName}
          />
          {getError('City') && (
            <p className="mt-1 text-sm text-red-600">{getError('City')}</p>
          )}
        </div>

        <div>
          <label htmlFor="State" className={labelClassName}>
            State {required && '*'}
          </label>
          <select
            id="State"
            {...register('State' as any)}
            className={inputClassName}
          >
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
          {getError('State') && (
            <p className="mt-1 text-sm text-red-600">{getError('State')}</p>
          )}
        </div>

        <div>
          <label htmlFor="PostalCode" className={labelClassName}>
            ZIP Code {required && '*'}
          </label>
          <input
            id="PostalCode"
            type="text"
            {...register('PostalCode' as any)}
            placeholder="12345"
            maxLength={10}
            className={inputClassName}
          />
          {getError('PostalCode') && (
            <p className="mt-1 text-sm text-red-600">{getError('PostalCode')}</p>
          )}
        </div>
      </div>

      {/* Country (optional) */}
      {showCountry && (
        <div>
          <label htmlFor="Country" className={labelClassName}>
            Country
          </label>
          <input
            id="Country"
            type="text"
            {...register('Country' as any)}
            defaultValue="US"
            className={inputClassName}
          />
          {getError('Country') && (
            <p className="mt-1 text-sm text-red-600">{getError('Country')}</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Formats address fields into a single-line string for display.
 * @param address Object containing address fields
 * @returns Formatted address string or empty string if no address data
 */
export function formatAddress(address: Partial<AddressFieldValues>): string {
  const parts: string[] = [];

  if (address.AddressLine1) {
    parts.push(address.AddressLine1);
  }
  if (address.AddressLine2) {
    parts.push(address.AddressLine2);
  }

  const cityStateZip: string[] = [];
  if (address.City) {
    cityStateZip.push(address.City);
  }
  if (address.State) {
    cityStateZip.push(address.State);
  }
  if (address.PostalCode) {
    // Add postal code after state with a space, not comma
    if (address.State) {
      cityStateZip[cityStateZip.length - 1] += ' ' + address.PostalCode;
    } else {
      cityStateZip.push(address.PostalCode);
    }
  }

  if (cityStateZip.length > 0) {
    parts.push(cityStateZip.join(', '));
  }

  if (address.Country && address.Country !== 'US') {
    parts.push(address.Country);
  }

  return parts.join(', ');
}
