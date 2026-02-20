import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Autocomplete, TextField, Box, Typography, CircularProgress } from '@mui/material';
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
  // Fetch vendors
  const { data: vendors, isLoading } = useQuery({
    queryKey: ['vendors'],
    queryFn: async (): Promise<Vendor[]> => {
      const response = await api.get("/vendors?$filter=Status eq 'Active'&$orderby=Name");
      return response.data.value;
    }
  });

  // Find selected vendor
  const selectedVendor = useMemo(() => {
    return vendors?.find((v) => v.Id === value) || null;
  }, [vendors, value]);

  return (
    <div className={className}>
      <Autocomplete
        options={vendors || []}
        getOptionLabel={(option: Vendor) =>
          option.Email ? `${option.Name} (${option.Email})` : option.Name
        }
        value={selectedVendor}
        onChange={(_, newValue) => onChange(newValue?.Id || '')}
        loading={isLoading}
        disabled={disabled}
        isOptionEqualToValue={(option, val) => option.Id === val.Id}
        filterOptions={(options, { inputValue }) => {
          if (!inputValue) return options;
          const lowerSearch = inputValue.toLowerCase();
          return options.filter(
            (vendor: Vendor) =>
              vendor.Name.toLowerCase().includes(lowerSearch) ||
              (vendor.Email && vendor.Email.toLowerCase().includes(lowerSearch))
          );
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder="Select a vendor..."
            error={!!error}
            helperText={error}
            size="small"
            required={required}
            sx={{ mt: 0.5 }}
            slotProps={{
              input: {
                ...params.InputProps,
                endAdornment: (
                  <>
                    {isLoading ? <CircularProgress color="inherit" size={18} /> : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
              },
            }}
          />
        )}
        renderOption={(props, option: Vendor) => {
          const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
          return (
            <li key={key} {...rest}>
              <Box>
                <Typography variant="body2" fontWeight={500}>
                  {option.Name}
                </Typography>
                {option.Email && (
                  <Typography variant="caption" color="text.secondary">
                    {option.Email}
                  </Typography>
                )}
              </Box>
            </li>
          );
        }}
      />
    </div>
  );
}
