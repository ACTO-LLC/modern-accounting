import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, ChevronRight, X } from 'lucide-react';
import { useState, useMemo } from 'react';
import api from '../lib/api';

interface Class {
  Id: string;
  Name: string;
  ParentClassId: string | null;
  Description: string | null;
  Status: string;
  CreatedAt: string;
  UpdatedAt: string;
}

interface ClassInput {
  Name: string;
  ParentClassId?: string | null;
  Description?: string;
  Status?: string;
}

// Validation constants
const NAME_MAX_LENGTH = 100;

// Validation error messages
interface ValidationErrors {
  name?: string;
}

/**
 * Get all descendant IDs of a given class to prevent circular references.
 * If class A is a parent of B, and B is a parent of C, then A cannot have B or C as its parent.
 */
function getDescendantIds(classId: string, classes: Class[]): Set<string> {
  const descendants = new Set<string>();
  const queue = [classId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    // Find all classes that have currentId as their parent
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

export default function Classes() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [formData, setFormData] = useState<ClassInput>({
    Name: '',
    ParentClassId: null,
    Description: '',
    Status: 'Active',
  });
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

  const queryClient = useQueryClient();

  const {
    data: classes,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['classes'],
    queryFn: async () => {
      const response = await api.get<{ value: Class[] }>('/classes');
      return response.data.value;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: ClassInput) => {
      const response = await api.post('/classes', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ClassInput> }) => {
      const response = await api.patch(`/classes/Id/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/classes/Id/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes'] });
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingClass(null);
    setFormData({
      Name: '',
      ParentClassId: null,
      Description: '',
      Status: 'Active',
    });
    setValidationErrors({});
  };

  /**
   * Validate form data before submission
   */
  const validateForm = (): boolean => {
    const errors: ValidationErrors = {};
    const trimmedName = formData.Name.trim();

    // Check for empty name
    if (!trimmedName) {
      errors.name = 'Name is required';
    } else if (trimmedName.length > NAME_MAX_LENGTH) {
      errors.name = `Name must be ${NAME_MAX_LENGTH} characters or less`;
    } else {
      // Check for duplicate names at the same level (same parent)
      const parentId = formData.ParentClassId || null;
      const duplicate = classes?.find(
        (c) =>
          c.Name.toLowerCase() === trimmedName.toLowerCase() &&
          c.ParentClassId === parentId &&
          (!editingClass || c.Id !== editingClass.Id)
      );
      if (duplicate) {
        errors.name = 'A class with this name already exists at this level';
      }
    }

    // Validate circular reference protection (extra safety check)
    if (editingClass && formData.ParentClassId) {
      const descendantIds = getDescendantIds(editingClass.Id, classes || []);
      if (descendantIds.has(formData.ParentClassId)) {
        errors.name = 'Cannot set a descendant as parent (circular reference)';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const submitData = {
      ...formData,
      Name: formData.Name.trim(),
      ParentClassId: formData.ParentClassId || null,
    };
    if (editingClass) {
      updateMutation.mutate({ id: editingClass.Id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const handleEdit = (classItem: Class) => {
    setEditingClass(classItem);
    setFormData({
      Name: classItem.Name,
      ParentClassId: classItem.ParentClassId,
      Description: classItem.Description || '',
      Status: classItem.Status,
    });
    setValidationErrors({});
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this class?')) {
      deleteMutation.mutate(id);
    }
  };

  // Build hierarchy map
  const getParentName = (parentId: string | null): string | null => {
    if (!parentId || !classes) return null;
    const parent = classes.find((c) => c.Id === parentId);
    return parent?.Name || null;
  };

  // Filter classes
  const filteredClasses = classes?.filter((classItem) => {
    const matchesSearch =
      searchTerm === '' ||
      classItem.Name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      classItem.Description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || classItem.Status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Get available parents for selection - exclude self AND all descendants to prevent circular references
  const availableParents = useMemo(() => {
    if (!classes) return [];
    if (!editingClass) return classes;

    // Get all descendants of the current class
    const descendantIds = getDescendantIds(editingClass.Id, classes);

    // Filter out the current class and all its descendants
    return classes.filter(
      (c) => c.Id !== editingClass.Id && !descendantIds.has(c.Id)
    );
  }, [classes, editingClass]);

  if (isLoading) return <div className="p-4">Loading classes...</div>;
  if (error)
    return <div className="p-4 text-red-600">Error loading classes</div>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Classes</h1>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Class
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white shadow sm:rounded-lg mb-6 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-medium text-gray-900">
              {editingClass ? 'Edit Class' : 'New Class'}
            </h2>
            <button
              onClick={resetForm}
              className="text-gray-400 hover:text-gray-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-gray-700"
                >
                  Name *
                </label>
                <input
                  type="text"
                  id="name"
                  required
                  maxLength={NAME_MAX_LENGTH}
                  value={formData.Name}
                  onChange={(e) => {
                    setFormData({ ...formData, Name: e.target.value });
                    if (validationErrors.name) {
                      setValidationErrors({ ...validationErrors, name: undefined });
                    }
                  }}
                  className={`mt-1 block w-full rounded-md shadow-sm focus:ring-indigo-500 sm:text-sm border p-2 ${
                    validationErrors.name
                      ? 'border-red-300 focus:border-red-500'
                      : 'border-gray-300 focus:border-indigo-500'
                  }`}
                />
                {validationErrors.name && (
                  <p className="mt-1 text-sm text-red-600">{validationErrors.name}</p>
                )}
              </div>
              <div>
                <label
                  htmlFor="parentClass"
                  className="block text-sm font-medium text-gray-700"
                >
                  Parent Class
                </label>
                <select
                  id="parentClass"
                  value={formData.ParentClassId || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      ParentClassId: e.target.value || null,
                    })
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                >
                  <option value="">None (Top-level)</option>
                  {availableParents?.map((c) => (
                    <option key={c.Id} value={c.Id}>
                      {c.Name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="status"
                  className="block text-sm font-medium text-gray-700"
                >
                  Status
                </label>
                <select
                  id="status"
                  value={formData.Status}
                  onChange={(e) =>
                    setFormData({ ...formData, Status: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label
                  htmlFor="description"
                  className="block text-sm font-medium text-gray-700"
                >
                  Description
                </label>
                <textarea
                  id="description"
                  rows={2}
                  value={formData.Description}
                  onChange={(e) =>
                    setFormData({ ...formData, Description: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                {createMutation.isPending || updateMutation.isPending
                  ? 'Saving...'
                  : editingClass
                  ? 'Update Class'
                  : 'Create Class'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search classes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
        >
          <option value="all">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Name
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Parent
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Description
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Status
              </th>
              <th scope="col" className="relative px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredClasses?.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                  No classes found. Create your first class to get started.
                </td>
              </tr>
            ) : (
              filteredClasses?.map((classItem) => (
                <tr key={classItem.Id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    <div className="flex items-center">
                      {classItem.ParentClassId && (
                        <ChevronRight className="w-4 h-4 mr-1 text-gray-400" />
                      )}
                      {classItem.Name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {getParentName(classItem.ParentClassId) || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {classItem.Description || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        classItem.Status === 'Active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {classItem.Status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleEdit(classItem)}
                      className="text-indigo-600 hover:text-indigo-900 mr-4"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(classItem.Id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-gray-500">
        <p>
          Classes help you track transactions by department, division, product line, or any other category.
          Use parent classes to create a hierarchy.
        </p>
      </div>
    </div>
  );
}
