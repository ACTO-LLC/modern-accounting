import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import api from '../lib/api';

interface Vendor {
  Id: string;
  Name: string;
  Email: string | null;
}

export interface VendorSelectorProps {
  value: string;
  onChange: (vendorId: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  className?: string;
}

export default function VendorSelector({
  value,
  onChange,
  required = false,
  disabled = false,
  error,
  className = '',
}: VendorSelectorProps) {
  const { data: vendors, isLoading } = useQuery({
    queryKey: ['vendors'],
    queryFn: async (): Promise<Vendor[]> => {
      const response = await api.get("/vendors?$filter=Status eq 'Active'&$orderby=Name");
      return response.data.value;
    }
  });

  const selectedVendor = useMemo(() => {
    return vendors?.find((v) => v.Id === value) ?? null;
  }, [vendors, value]);

  return (
    <div className={className}>
      <Autocomplete
        options={vendors ?? []}
        getOptionLabel={(option: Vendor) =>
          option.Name + (option.Email ? ` (${option.Email})` : '')
        }
        value={selectedVendor}
        onChange={(_event, newValue: Vendor | null) => {
          onChange(newValue?.Id ?? '');
        }}
        isOptionEqualToValue={(option: Vendor, val: Vendor) => option.Id === val.Id}
        loading={isLoading}
        disabled={disabled}
        size="small"
        renderOption={(props, option: Vendor) => {
          const { key, ...rest } = props;
          return (
            <li key={key} {...rest}>
              <div>
                <div className="font-medium">{option.Name}</div>
                {option.Email && (
                  <div className="text-xs opacity-60">{option.Email}</div>
                )}
              </div>
            </li>
          );
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder="Select a vendor..."
            required={required}
            error={!!error}
            helperText={error}
            slotProps={{
              input: {
                ...params.InputProps,
                endAdornment: (
                  <>
                    {isLoading ? <CircularProgress color="inherit" size={20} /> : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
              },
            }}
          />
        )}
      />
    </div>
  );
}
