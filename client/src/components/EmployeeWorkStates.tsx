import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, AlertCircle, CheckCircle } from 'lucide-react';
import api from '../lib/api';

// US States for dropdown
const US_STATES = [
  { code: '', name: 'Select State' },
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
];

// No-tax states for info display
const NO_TAX_STATES = ['AK', 'FL', 'NV', 'NH', 'SD', 'TN', 'TX', 'WA', 'WY'];

interface WorkState {
  Id?: string;
  EmployeeId: string;
  StateCode: string;
  Percentage: number;
  EffectiveDate: string;
  EndDate?: string | null;
  IsPrimary: boolean;
  Notes?: string | null;
}

interface Reciprocity {
  Id: string;
  ResidentState: string;
  WorkState: string;
  ReciprocityType: string;
  Description: string;
}

interface EmployeeWorkStatesProps {
  employeeId: string;
  residentState?: string;
}

export default function EmployeeWorkStates({ employeeId, residentState }: EmployeeWorkStatesProps) {
  const queryClient = useQueryClient();
  const [newState, setNewState] = useState<Partial<WorkState>>({
    StateCode: '',
    Percentage: 0,
    EffectiveDate: new Date().toISOString().split('T')[0],
    IsPrimary: false,
    Notes: '',
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch work states for this employee
  const { data: workStates = [], isLoading } = useQuery({
    queryKey: ['employeeworkstates', employeeId],
    queryFn: async () => {
      const response = await api.get<{ value: WorkState[] }>(
        `/employeeworkstates?$filter=EmployeeId eq ${employeeId} and IsActive eq true&$orderby=Percentage desc`
      );
      return response.data.value;
    },
    enabled: !!employeeId,
  });

  // Fetch reciprocity agreements for display
  const { data: reciprocityAgreements = [] } = useQuery({
    queryKey: ['reciprocity', residentState],
    queryFn: async () => {
      if (!residentState) return [];
      const response = await api.get<{ value: Reciprocity[] }>(
        `/statetaxreciprocity?$filter=ResidentState eq '${residentState}' and IsActive eq true`
      );
      return response.data.value;
    },
    enabled: !!residentState,
  });

  // Add work state mutation
  const addMutation = useMutation({
    mutationFn: async (data: Partial<WorkState>) => {
      const payload = {
        EmployeeId: employeeId,
        StateCode: data.StateCode,
        Percentage: data.Percentage,
        EffectiveDate: data.EffectiveDate,
        IsPrimary: data.IsPrimary || false,
        Notes: data.Notes || null,
      };
      await api.post('/employeeworkstates_write', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employeeworkstates', employeeId] });
      setShowAddForm(false);
      setNewState({
        StateCode: '',
        Percentage: 0,
        EffectiveDate: new Date().toISOString().split('T')[0],
        IsPrimary: false,
        Notes: '',
      });
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to add work state');
    },
  });

  // Delete work state mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/employeeworkstates_write/Id/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employeeworkstates', employeeId] });
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to remove work state');
    },
  });

  // Calculate total percentage
  const totalPercentage = workStates.reduce((sum, ws) => sum + ws.Percentage, 0);
  const isBalanced = Math.abs(totalPercentage - 100) < 0.01;

  // Get reciprocity info for a state
  const getReciprocityInfo = (stateCode: string) => {
    return reciprocityAgreements.find(r => r.WorkState === stateCode);
  };

  // Check if two date ranges overlap
  const dateRangesOverlap = (
    start1: string,
    end1: string | null | undefined,
    start2: string,
    end2: string | null | undefined
  ): boolean => {
    const s1 = new Date(start1);
    const e1 = end1 ? new Date(end1) : new Date('9999-12-31');
    const s2 = new Date(start2);
    const e2 = end2 ? new Date(end2) : new Date('9999-12-31');

    // Ranges overlap if one starts before the other ends
    return s1 <= e2 && s2 <= e1;
  };

  // Validate that overlapping date ranges don't exceed 100% total allocation
  const validateDateRangeOverlap = (newWorkState: Partial<WorkState>): string | null => {
    if (!newWorkState.EffectiveDate || !newWorkState.Percentage) return null;

    // Find all existing work states that overlap with the new one
    const overlappingStates = workStates.filter(ws =>
      dateRangesOverlap(
        newWorkState.EffectiveDate!,
        newWorkState.EndDate,
        ws.EffectiveDate,
        ws.EndDate
      )
    );

    if (overlappingStates.length === 0) return null;

    // Calculate total percentage during overlap period
    const overlapTotal = overlappingStates.reduce((sum, ws) => sum + ws.Percentage, 0) + newWorkState.Percentage;

    if (overlapTotal > 100.01) {
      const stateNames = overlappingStates.map(ws =>
        US_STATES.find(s => s.code === ws.StateCode)?.name || ws.StateCode
      ).join(', ');
      return `Date range overlaps with ${stateNames}. Combined allocation would be ${overlapTotal.toFixed(1)}% (max 100%).`;
    }

    return null;
  };

  const handleAddState = () => {
    if (!newState.StateCode) {
      setError('Please select a state');
      return;
    }
    if (!newState.Percentage || newState.Percentage <= 0) {
      setError('Percentage must be greater than 0');
      return;
    }
    if (newState.Percentage > 100) {
      setError('Percentage cannot exceed 100');
      return;
    }

    // Check for duplicate state (same state code with overlapping dates)
    const duplicateWithOverlap = workStates.find(ws =>
      ws.StateCode === newState.StateCode &&
      dateRangesOverlap(
        newState.EffectiveDate!,
        newState.EndDate,
        ws.EffectiveDate,
        ws.EndDate
      )
    );
    if (duplicateWithOverlap) {
      setError('This state already has an allocation for the specified date range');
      return;
    }

    // Validate date range overlap doesn't exceed 100%
    const overlapError = validateDateRangeOverlap(newState);
    if (overlapError) {
      setError(overlapError);
      return;
    }

    addMutation.mutate(newState);
  };

  const inputClass = "block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white";
  const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300";

  if (isLoading) {
    return <div className="p-4">Loading work states...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header with total percentage indicator */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Work State Allocations</h3>
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
          isBalanced
            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
        }`}>
          {isBalanced ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          Total: {totalPercentage.toFixed(1)}%
        </div>
      </div>

      {/* Info about multi-state taxation */}
      {workStates.length === 0 ? (
        <div className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-4 rounded-md">
          <p className="font-medium mb-2">Multi-State Tax Support</p>
          <p>If this employee works in multiple states (e.g., remote workers, traveling employees),
          add each state and the percentage of time/income allocated to that state.</p>
          <p className="mt-2">Percentages must total 100% for accurate tax calculations.</p>
        </div>
      ) : null}

      {/* Error message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 p-3 rounded-md flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-600 hover:text-red-800">
            Dismiss
          </button>
        </div>
      )}

      {/* Existing work states list */}
      {workStates.length > 0 && (
        <div className="border dark:border-gray-700 rounded-md overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">State</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Percentage</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Effective Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {workStates.map((ws) => {
                const stateInfo = US_STATES.find(s => s.code === ws.StateCode);
                const reciprocityInfo = getReciprocityInfo(ws.StateCode);
                const isNoTaxState = NO_TAX_STATES.includes(ws.StateCode);

                return (
                  <tr key={ws.Id}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {stateInfo?.name || ws.StateCode}
                        </span>
                        {ws.IsPrimary && (
                          <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-2 py-0.5 rounded">
                            Primary
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-900 dark:text-white">
                      {ws.Percentage.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-400">
                      {ws.EffectiveDate?.split('T')[0]}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        {isNoTaxState && (
                          <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-2 py-0.5 rounded inline-block w-fit">
                            No State Tax
                          </span>
                        )}
                        {reciprocityInfo && (
                          <span className="text-xs bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 px-2 py-0.5 rounded inline-block w-fit" title={reciprocityInfo.Description}>
                            Reciprocity with {residentState}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={() => ws.Id && deleteMutation.mutate(ws.Id)}
                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                        title="Remove work state"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add new work state form */}
      {showAddForm ? (
        <div className="border dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-800">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Add Work State</h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label htmlFor="newStateCode" className={labelClass}>State *</label>
              <select
                id="newStateCode"
                value={newState.StateCode || ''}
                onChange={(e) => setNewState({ ...newState, StateCode: e.target.value })}
                className={inputClass}
              >
                {US_STATES.map((s) => (
                  <option key={s.code} value={s.code}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="newPercentage" className={labelClass}>Percentage *</label>
              <div className="relative">
                <input
                  id="newPercentage"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={newState.Percentage || ''}
                  onChange={(e) => setNewState({ ...newState, Percentage: parseFloat(e.target.value) || 0 })}
                  className={inputClass}
                />
                <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500">%</span>
              </div>
            </div>
            <div>
              <label htmlFor="newEffectiveDate" className={labelClass}>Effective Date *</label>
              <input
                id="newEffectiveDate"
                type="date"
                value={newState.EffectiveDate || ''}
                onChange={(e) => setNewState({ ...newState, EffectiveDate: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={newState.IsPrimary || false}
                  onChange={(e) => setNewState({ ...newState, IsPrimary: e.target.checked })}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                Primary
              </label>
            </div>
          </div>
          <div className="mt-3">
            <label htmlFor="newNotes" className={labelClass}>Notes (optional)</label>
            <input
              id="newNotes"
              type="text"
              value={newState.Notes || ''}
              onChange={(e) => setNewState({ ...newState, Notes: e.target.value })}
              className={inputClass}
              placeholder="e.g., Remote work arrangement, Client site, etc."
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setError(null);
              }}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddState}
              disabled={addMutation.isPending}
              className="px-4 py-2 text-sm bg-indigo-600 text-white hover:bg-indigo-700 rounded-md disabled:opacity-50"
            >
              {addMutation.isPending ? 'Adding...' : 'Add State'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Work State
        </button>
      )}

      {/* Reciprocity agreements info */}
      {residentState && reciprocityAgreements.length > 0 && (
        <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-md">
          <h4 className="text-sm font-medium text-purple-900 dark:text-purple-200 mb-2">
            Tax Reciprocity Agreements for {US_STATES.find(s => s.code === residentState)?.name || residentState} Residents
          </h4>
          <ul className="text-sm text-purple-700 dark:text-purple-300 space-y-1">
            {reciprocityAgreements.map((r) => (
              <li key={r.Id}>
                <span className="font-medium">{US_STATES.find(s => s.code === r.WorkState)?.name || r.WorkState}:</span>{' '}
                {r.Description}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-purple-600 dark:text-purple-400">
            When working in a reciprocal state, taxes are withheld for your resident state only.
          </p>
        </div>
      )}

      {/* W-2 Multi-State info */}
      {workStates.length > 1 && (
        <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
          <h4 className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">
            W-2 Multi-State Reporting
          </h4>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            This employee works in {workStates.length} states. At year-end, wages and withholdings for each state
            will be reported in Boxes 15-17 of the W-2 form.
          </p>
        </div>
      )}
    </div>
  );
}
