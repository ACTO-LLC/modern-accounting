import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { Plus } from 'lucide-react';
import api, { Customer } from '../lib/api';
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

  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers', 'active'],
    queryFn: async (): Promise<Customer[]> => {
      const response = await api.get("/customers?$filter=Status eq 'Active'&$orderby=Name");
      return response.data.value;
    },
  });

  const selectedCustomer = useMemo(() => {
    return customers?.find((c: Customer) => c.Id === value) ?? null;
  }, [customers, value]);

  const handleCustomerCreated = (customerId: string) => {
    onChange(customerId);
  };

  return (
    <div className={className}>
      <Autocomplete
        options={customers ?? []}
        getOptionLabel={(option: Customer) =>
          option.Name + (option.Email ? ` (${option.Email})` : '')
        }
        value={selectedCustomer}
        onChange={(_event, newValue: Customer | null) => {
          onChange(newValue?.Id ?? '');
        }}
        isOptionEqualToValue={(option: Customer, val: Customer) => option.Id === val.Id}
        loading={isLoading}
        disabled={disabled}
        size="small"
        slots={{
          paper: (props) => (
            <Paper {...props}>
              {props.children}
              <Button
                fullWidth
                startIcon={<Plus className="w-4 h-4" />}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsAddModalOpen(true);
                }}
                sx={{ justifyContent: 'center', py: 1, borderTop: 1, borderColor: 'divider' }}
              >
                Add New Customer
              </Button>
            </Paper>
          ),
        }}
        renderOption={(props, option: Customer) => {
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
            placeholder="Select a customer..."
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

      <QuickAddCustomerModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onCustomerCreated={handleCustomerCreated}
      />
    </div>
  );
}
