import { useEffect, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import api from '../lib/api';

interface ClassItem {
  Id: string;
  Name: string;
  ParentClassId: string | null;
  Description: string | null;
  Status: string;
}

export const classSchema = z.object({
  Name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  ParentClassId: z.string().nullish(),
  Description: z.string().nullish(),
  Status: z.string(),
});

export type ClassFormData = z.infer<typeof classSchema>;

interface ClassFormProps {
  initialValues?: Partial<ClassFormData> & { Id?: string };
  onSubmit: (data: ClassFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
}

/**
 * Get all descendant IDs of a given class to prevent circular references.
 */
function getDescendantIds(classId: string, classes: ClassItem[]): Set<string> {
  const descendants = new Set<string>();
  const queue = [classId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const children = classes.filter((c) => c.ParentClassId === currentId);
    for (const child of children) {
      if (!descendants.has(child.Id)) {
        descendants.add(child.Id);
        queue.push(child.Id);
      }
    }
  }

  return descendants;
}

export default function ClassForm({ initialValues, onSubmit, title, isSubmitting }: ClassFormProps) {
  const navigate = useNavigate();

  const { data: allClasses } = useQuery({
    queryKey: ['classes'],
    queryFn: async () => {
      const response = await api.get<{ value: ClassItem[] }>('/classes');
      return response.data.value;
    },
  });

  const { control, handleSubmit, reset, formState: { errors } } = useForm<ClassFormData>({
    resolver: zodResolver(classSchema),
    defaultValues: {
      Name: '',
      ParentClassId: null,
      Description: '',
      Status: 'Active',
    },
  });

  useEffect(() => {
    if (initialValues) {
      reset({
        Name: initialValues.Name || '',
        ParentClassId: initialValues.ParentClassId || null,
        Description: initialValues.Description || '',
        Status: initialValues.Status || 'Active',
      });
    }
  }, [initialValues, reset]);

  // Get available parents for selection - exclude self and descendants
  const availableParents = useMemo(() => {
    if (!allClasses) return [];
    if (!initialValues?.Id) return allClasses;

    const descendantIds = getDescendantIds(initialValues.Id, allClasses);
    return allClasses.filter(
      (c) => c.Id !== initialValues.Id && !descendantIds.has(c.Id)
    );
  }, [allClasses, initialValues?.Id]);

  const onFormSubmit = async (data: ClassFormData) => {
    await onSubmit({
      ...data,
      Name: data.Name.trim(),
      ParentClassId: data.ParentClassId || null,
      Description: data.Description?.trim() || null,
    });
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/classes')}
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Classes
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
      </div>

      <form onSubmit={handleSubmit(onFormSubmit)} className="bg-white dark:bg-gray-800 shadow sm:rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Controller
            name="Name"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Name"
                required
                fullWidth
                error={!!errors.Name}
                helperText={errors.Name?.message}
                inputProps={{ maxLength: 100 }}
              />
            )}
          />
          <Controller
            name="ParentClassId"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value || ''}
                onChange={(e) => field.onChange(e.target.value || null)}
                label="Parent Class"
                select
                fullWidth
              >
                <MenuItem value="">None (Top-level)</MenuItem>
                {availableParents?.map((c) => (
                  <MenuItem key={c.Id} value={c.Id}>
                    {c.Name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <Controller
            name="Status"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Status"
                select
                fullWidth
              >
                <MenuItem value="Active">Active</MenuItem>
                <MenuItem value="Inactive">Inactive</MenuItem>
              </TextField>
            )}
          />
        </div>
        <Controller
          name="Description"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              value={field.value || ''}
              label="Description"
              fullWidth
              multiline
              rows={2}
            />
          )}
        />
        <div className="flex justify-end gap-3 pt-4">
          <Button
            variant="outlined"
            onClick={() => navigate('/classes')}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : initialValues?.Id ? 'Update Class' : 'Create Class'}
          </Button>
        </div>
      </form>
    </div>
  );
}
