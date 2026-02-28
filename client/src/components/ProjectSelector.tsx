import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import api from '../lib/api';

interface ProjectItem {
  Id: string;
  Name: string;
  Description: string | null;
  CustomerId: string | null;
}

export interface ProjectSelectorProps {
  value: string;
  onChange: (projectId: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  className?: string;
  customerId?: string | null;
}

export default function ProjectSelector({
  value,
  onChange,
  required = false,
  disabled = false,
  error,
  className = '',
  customerId,
}: ProjectSelectorProps) {
  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects', customerId],
    queryFn: async (): Promise<ProjectItem[]> => {
      let url = "/projects?$filter=Status eq 'Active'&$orderby=Name";
      if (customerId) {
        url = `/projects?$filter=Status eq 'Active' and CustomerId eq '${customerId}'&$orderby=Name`;
      }
      const response = await api.get(url);
      return response.data.value;
    },
  });

  const selectedProject = useMemo(() => {
    return projects?.find((p) => p.Id === value) ?? null;
  }, [projects, value]);

  return (
    <div className={className}>
      <Autocomplete
        options={projects ?? []}
        getOptionLabel={(option: ProjectItem) => option.Name}
        value={selectedProject}
        onChange={(_event, newValue: ProjectItem | null) => {
          onChange(newValue?.Id ?? '');
        }}
        isOptionEqualToValue={(option: ProjectItem, val: ProjectItem) => option.Id === val.Id}
        loading={isLoading}
        disabled={disabled}
        size="small"
        renderOption={(props, option: ProjectItem) => {
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
            placeholder="Select a project..."
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
