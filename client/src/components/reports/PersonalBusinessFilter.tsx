import { ToggleButton, ToggleButtonGroup } from '@mui/material';

export type PersonalFilter = 'business' | 'personal' | 'all';

interface PersonalBusinessFilterProps {
  value: PersonalFilter;
  onChange: (value: PersonalFilter) => void;
}

export default function PersonalBusinessFilter({ value, onChange }: PersonalBusinessFilterProps) {
  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      onChange={(_, newValue) => { if (newValue) onChange(newValue); }}
      size="small"
    >
      <ToggleButton value="business">Business</ToggleButton>
      <ToggleButton value="all">All</ToggleButton>
      <ToggleButton value="personal">Personal</ToggleButton>
    </ToggleButtonGroup>
  );
}
