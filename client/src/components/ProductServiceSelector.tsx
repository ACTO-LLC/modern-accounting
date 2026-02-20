import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Autocomplete, TextField, Box, Typography, CircularProgress } from '@mui/material';
import { Wrench, Box as BoxIcon, Package } from 'lucide-react';
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
      return <Wrench className="w-4 h-4 text-blue-500" />;
    case 'Inventory':
      return <BoxIcon className="w-4 h-4 text-green-500" />;
    default:
      return <Package className="w-4 h-4 text-orange-500" />;
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
  // Fetch products/services - only active ones
  const { data: productsServices, isLoading } = useQuery({
    queryKey: ['productsservices-active'],
    queryFn: async (): Promise<ProductService[]> => {
      const response = await api.get('/productsservices?$filter=Status eq \'Active\'&$orderby=Name');
      return response.data.value;
    },
  });

  // Find selected product/service
  const selectedProductService = useMemo(() => {
    return productsServices?.find((ps) => ps.Id === value) || null;
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
      includeScore: true,
    });
  }, [productsServices]);

  return (
    <div className={className}>
      <Autocomplete
        options={productsServices || []}
        getOptionLabel={(option: ProductService) => {
          let label = option.Name;
          if (option.SKU) label += ` (${option.SKU})`;
          return label;
        }}
        value={selectedProductService}
        onChange={(_, newValue) => {
          if (newValue) {
            onChange(newValue.Id, newValue);
          } else {
            onChange('', undefined);
          }
        }}
        loading={isLoading}
        disabled={disabled}
        isOptionEqualToValue={(option, val) => option.Id === val.Id}
        filterOptions={(options, { inputValue }) => {
          if (!inputValue) return options;
          if (!fuse) return options;
          const results = fuse.search(inputValue);
          return results.map((result) => result.item);
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={placeholder}
            error={!!error}
            helperText={error}
            size="small"
            required={required}
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
        renderOption={(props, option: ProductService) => {
          const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
          return (
            <li key={key} {...rest}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {getTypeIcon(option.Type)}
                  <Box>
                    <Typography variant="body2" fontWeight={500}>
                      {option.Name}
                    </Typography>
                    {option.SKU && (
                      <Typography variant="caption" color="text.secondary">
                        SKU: {option.SKU}
                      </Typography>
                    )}
                  </Box>
                </Box>
                {option.SalesPrice !== null && (
                  <Typography variant="body2" color="text.secondary">
                    {formatCurrency(option.SalesPrice)}
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
