import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Autocomplete, TextField, Box, Typography, CircularProgress, Button, Divider } from '@mui/material';
import { Plus } from 'lucide-react';
import { customersApi, Customer } from '../lib/api';
import QuickAddCustomerModal from './QuickAddCustomerModal';

export interface CustomerSelectorProps {
  value: string;
  onChange: (customerId: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  className?: string;
}

export default function CustomerSelector({
  value,
  onChange,
  required = false,
  disabled = false,
  error,
  className = '',
}: CustomerSelectorProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Fetch customers
  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: customersApi.getAll,
  });

  // Find selected customer
  const selectedCustomer = useMemo(() => {
    return customers?.find((c: Customer) => c.Id === value) || null;
  }, [customers, value]);

  const handleCustomerCreated = (customerId: string) => {
    onChange(customerId);
  };

  return (
    <div className={className}>
      <Autocomplete
        options={customers || []}
        getOptionLabel={(option: Customer) =>
          option.Email ? `${option.Name} (${option.Email})` : option.Name
        }
        value={selectedCustomer}
        onChange={(_, newValue) => onChange(newValue?.Id || '')}
        loading={isLoading}
        disabled={disabled}
        isOptionEqualToValue={(option, val) => option.Id === val.Id}
        filterOptions={(options, { inputValue }) => {
          if (!inputValue) return options;
          const lowerSearch = inputValue.toLowerCase();
          return options.filter(
            (customer: Customer) =>
              customer.Name.toLowerCase().includes(lowerSearch) ||
              (customer.Email && customer.Email.toLowerCase().includes(lowerSearch))
          );
        }}
        ListboxProps={{
          style: { maxHeight: 200 },
        }}
        slots={{
          listbox: (props) => (
            <Box component="div">
              <ul {...props} />
              <Divider />
              <Box sx={{ p: 1 }}>
                <Button
                  fullWidth
                  size="small"
                  startIcon={<Plus size={16} />}
                  onClick={() => setIsAddModalOpen(true)}
                  sx={{ textTransform: 'none' }}
                >
                  Add New Customer
                </Button>
              </Box>
            </Box>
          ),
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder="Select a customer..."
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
        renderOption={(props, option: Customer) => {
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

      {/* Quick Add Customer Modal */}
      <QuickAddCustomerModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onCustomerCreated={handleCustomerCreated}
      />
    </div>
  );
}
