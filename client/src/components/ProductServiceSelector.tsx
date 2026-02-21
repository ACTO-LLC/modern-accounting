import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import { Wrench, Box, Package } from 'lucide-react';
import Fuse from 'fuse.js';
import api from '../lib/api';

export interface ProductService {
  Id: string;
  Name: string;
  SKU: string | null;
  Type: 'Inventory' | 'NonInventory' | 'Service';
  Description: string | null;
  SalesPrice: number | null;
  PurchaseCost: number | null;
  Category: string | null;
  Taxable: boolean;
  Status: 'Active' | 'Inactive';
}

export interface ProductServiceSelectorProps {
  value: string;
  onChange: (productServiceId: string, productService?: ProductService) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  className?: string;
  placeholder?: string;
}

const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return '';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'Service':
      return <Wrench className="w-4 h-4 text-blue-500 shrink-0" />;
    case 'Inventory':
      return <Box className="w-4 h-4 text-green-500 shrink-0" />;
    default:
      return <Package className="w-4 h-4 text-orange-500 shrink-0" />;
  }
};

export default function ProductServiceSelector({
  value,
  onChange,
  required = false,
  disabled = false,
  error,
  className = '',
  placeholder = 'Select product/service...',
}: ProductServiceSelectorProps) {
  const { data: productsServices, isLoading } = useQuery({
    queryKey: ['productsservices-active'],
    queryFn: async (): Promise<ProductService[]> => {
      const response = await api.get('/productsservices?$filter=Status eq \'Active\'&$orderby=Name');
      return response.data.value;
    },
  });

  const selectedProductService = useMemo(() => {
    return productsServices?.find((ps) => ps.Id === value) ?? null;
  }, [productsServices, value]);

  // Configure Fuse.js for fuzzy search
  const fuse = useMemo(() => {
    if (!productsServices) return null;
    return new Fuse(productsServices, {
      keys: [
        { name: 'Name', weight: 0.5 },
        { name: 'SKU', weight: 0.3 },
        { name: 'Category', weight: 0.2 },
      ],
      threshold: 0.4,
      ignoreLocation: true,
    });
  }, [productsServices]);

  // Default MUI filter as fallback
  const defaultFilter = createFilterOptions<ProductService>();

  const filterOptions = (options: ProductService[], state: Parameters<typeof defaultFilter>[1]) => {
    if (!state.inputValue || !fuse) {
      return defaultFilter(options, state);
    }
    return fuse.search(state.inputValue).map((result) => result.item);
  };

  return (
    <div className={className}>
      <Autocomplete
        options={productsServices ?? []}
        getOptionLabel={(option: ProductService) => option.Name}
        value={selectedProductService}
        onChange={(_event, newValue: ProductService | null) => {
          onChange(newValue?.Id ?? '', newValue ?? undefined);
        }}
        filterOptions={filterOptions}
        isOptionEqualToValue={(option: ProductService, val: ProductService) => option.Id === val.Id}
        loading={isLoading}
        disabled={disabled}
        size="small"
        renderOption={(props, option: ProductService) => {
          const { key, ...rest } = props;
          return (
            <li key={key} {...rest}>
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  {getTypeIcon(option.Type)}
                  <div>
                    <div className="font-medium">{option.Name}</div>
                    {option.SKU && (
                      <div className="text-xs opacity-60">SKU: {option.SKU}</div>
                    )}
                  </div>
                </div>
                {option.SalesPrice !== null && (
                  <span className="text-sm opacity-60 ml-2">{formatCurrency(option.SalesPrice)}</span>
                )}
              </div>
            </li>
          );
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={placeholder}
            required={required}
            error={!!error}
            helperText={error}
            slotProps={{
              input: {
                ...params.InputProps,
                startAdornment: (
                  <>
                    {selectedProductService && getTypeIcon(selectedProductService.Type)}
                    {params.InputProps.startAdornment}
                  </>
                ),
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
