import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import { jobCostCodesApi, JobCostCode } from '../lib/api';

export interface CostCodeSelectorProps {
  value: string;
  onChange: (costCodeId: string) => void;
  /** Required: scope the picker to a project. When falsy, the picker is disabled. */
  projectId: string | null | undefined;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  className?: string;
}

/**
 * Project-scoped cost-code picker. Disabled (with hint) when no project is
 * selected, since cost codes only exist under a project.
 *
 * Used by the Job Costing transaction forms (#615) — keep flag-gating at the
 * caller so this component stays presentation-only.
 */
export default function CostCodeSelector({
  value,
  onChange,
  projectId,
  required = false,
  disabled = false,
  error,
  className = '',
}: CostCodeSelectorProps) {
  const { data: costCodes, isLoading } = useQuery<JobCostCode[]>({
    queryKey: ['jobCostCodes', projectId],
    queryFn: () => jobCostCodesApi.getByProject(projectId as string),
    enabled: !!projectId,
  });

  const selected = useMemo(
    () => costCodes?.find((c) => c.Id === value) ?? null,
    [costCodes, value],
  );

  const effectivelyDisabled = disabled || !projectId;
  const hint = !projectId ? 'Pick a project first' : error;

  return (
    <div className={className}>
      <Autocomplete
        options={costCodes ?? []}
        getOptionLabel={(option: JobCostCode) => `${option.Code} – ${option.Description}`}
        value={selected}
        onChange={(_event, newValue: JobCostCode | null) => {
          onChange(newValue?.Id ?? '');
        }}
        isOptionEqualToValue={(option: JobCostCode, val: JobCostCode) => option.Id === val.Id}
        loading={isLoading}
        disabled={effectivelyDisabled}
        size="small"
        renderOption={(props, option: JobCostCode) => {
          const { key, ...rest } = props;
          return (
            <li key={key} {...rest}>
              <div>
                <div className="font-medium font-mono">{option.Code}</div>
                <div className="text-xs opacity-60">{option.Description}</div>
              </div>
            </li>
          );
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Cost Code"
            placeholder={projectId ? 'Select a cost code...' : ''}
            required={required}
            error={!!error}
            helperText={hint}
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
