import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import api from '../lib/api';

interface ClassItem {
  Id: string;
  Name: string;
  Description: string | null;
}

export interface ClassSelectorProps {
  value: string;
  onChange: (classId: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  className?: string;
}

export default function ClassSelector({
  value,
  onChange,
  required = false,
  disabled = false,
  error,
  className = '',
}: ClassSelectorProps) {
  const { data: classes, isLoading } = useQuery({
    queryKey: ['classes'],
    queryFn: async (): Promise<ClassItem[]> => {
      const response = await api.get("/classes?$filter=Status eq 'Active'&$orderby=Name");
      return response.data.value;
    },
  });

  const selectedClass = useMemo(() => {
    return classes?.find((c) => c.Id === value) ?? null;
  }, [classes, value]);

  return (
    <div className={className}>
      <Autocomplete
        options={classes ?? []}
        getOptionLabel={(option: ClassItem) => option.Name}
        value={selectedClass}
        onChange={(_event, newValue: ClassItem | null) => {
          onChange(newValue?.Id ?? '');
        }}
        isOptionEqualToValue={(option: ClassItem, val: ClassItem) => option.Id === val.Id}
        loading={isLoading}
        disabled={disabled}
        size="small"
        renderOption={(props, option: ClassItem) => {
          const { key, ...rest } = props;
          return (
            <li key={key} {...rest}>
              <div>
                <div className="font-medium">{option.Name}</div>
                {option.Description && (
                  <div className="text-xs opacity-60">{option.Description}</div>
                )}
              </div>
            </li>
          );
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder="Select a class..."
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
