import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../lib/api';
import VendorCreditForm, { VendorCreditFormData } from '../components/VendorCreditForm';

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(id: string | undefined): id is string {
  return id !== undefined && UUID_REGEX.test(id);
}

interface VendorCreditLine {
  Id: string;
  VendorCreditId: string;
  AccountId: string;
  ProductServiceId: string | null;
  Description: string;
  Quantity: number;
  UnitPrice: number;
  Amount: number;
  ProjectId?: string | null;
  ClassId?: string | null;
}

interface VendorCredit {
  Id: string;
  VendorId: string;
  CreditNumber: string;
  CreditDate: string;
  Reason: string;
  Subtotal: number;
  TaxAmount: number;
  TotalAmount: number;
  AmountApplied: number;
  Status: 'Open' | 'Applied' | 'Partial' | 'Voided';
  ProjectId?: string | null;
  ClassId?: string | null;
  Lines?: VendorCreditLine[];
}

export default function EditVendorCredit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Validate ID before using in query
  const isIdValid = isValidUUID(id);

  const { data: credit, isLoading, error } = useQuery({
    queryKey: ['vendorcredit', id],
    queryFn: async () => {
      if (!isIdValid) {
        throw new Error('Invalid vendor credit ID format');
      }
      // Use unquoted GUIDs in OData filter for DAB
      const [creditResponse, linesResponse] = await Promise.all([
        api.get<{ value: VendorCredit[] }>(`/vendorcredits?$filter=Id eq ${id}`),
        api.get<{ value: VendorCreditLine[] }>(`/vendorcreditlines?$filter=VendorCreditId eq ${id}`)
      ]);

      const creditData = creditResponse.data.value[0];
      if (creditData) {
        creditData.Lines = linesResponse.data.value;
      }
      return creditData;
    },
    enabled: isIdValid
  });

  const mutation = useMutation({
    mutationFn: async (data: VendorCreditFormData) => {
      if (!isIdValid) {
        throw new Error('Invalid vendor credit ID format');
      }

      // 1. Update Vendor Credit (exclude Lines)
      const { Lines, ...creditData } = data;
      await api.patch(`/vendorcredits_write/Id/${id}`, {
        ...creditData,
        ProjectId: data.ProjectId || null,
        ClassId: data.ClassId || null,
      });

      // 2. Handle Lines Reconciliation
      // Use unquoted GUIDs in OData filter for DAB
      const currentLinesResponse = await api.get<{ value: VendorCreditLine[] }>(`/vendorcreditlines?$filter=VendorCreditId eq ${id}`);
      const currentLines = currentLinesResponse.data.value;
      const currentLineIds = new Set(currentLines.map(l => l.Id));

      const incomingLines = Lines || [];
      const incomingLineIds = new Set(incomingLines.map(l => l.Id).filter(Boolean));

      // Identify operations
      const toDelete = currentLines.filter(l => !incomingLineIds.has(l.Id));
      const toUpdate = incomingLines.filter(l => l.Id && currentLineIds.has(l.Id));
      const toAdd = incomingLines.filter(l => !l.Id);

      // Execute operations
      const promises = [
        ...toDelete.map(l => api.delete(`/vendorcreditlines/Id/${l.Id}`)),
        ...toUpdate.map(l => api.patch(`/vendorcreditlines/Id/${l.Id}`, {
          AccountId: l.AccountId,
          ProductServiceId: l.ProductServiceId || null,
          Description: l.Description || '',
          Quantity: l.Quantity,
          UnitPrice: l.UnitPrice,
          Amount: l.Amount,
          ProjectId: l.ProjectId || null,
          ClassId: l.ClassId || null,
        })),
        ...toAdd.map(l => api.post('/vendorcreditlines', {
          VendorCreditId: id,
          AccountId: l.AccountId,
          ProductServiceId: l.ProductServiceId || null,
          Description: l.Description || '',
          Quantity: l.Quantity,
          UnitPrice: l.UnitPrice,
          Amount: l.Amount,
          ProjectId: l.ProjectId || null,
          ClassId: l.ClassId || null,
        }))
      ];

      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendorcredits'] });
      queryClient.invalidateQueries({ queryKey: ['vendorcredit', id] });
      navigate('/vendor-credits');
    },
    onError: (error) => {
      console.error('Failed to update vendor credit:', error);
      setErrorMessage('Failed to update vendor credit. Please try again.');
    }
  });

  if (!isIdValid) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-600">Invalid vendor credit ID format</p>
          <button
            onClick={() => navigate('/vendor-credits')}
            className="mt-2 text-indigo-600 hover:text-indigo-800"
          >
            Return to Vendor Credits
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) return <div className="p-4">Loading vendor credit...</div>;
  if (error || !credit) return <div className="p-4 text-red-600">Error loading vendor credit</div>;

  return (
    <div>
      {errorMessage && (
        <div className="max-w-4xl mx-auto mb-4">
          <div className="bg-red-50 border border-red-200 rounded-md p-4 flex justify-between items-center">
            <p className="text-red-600">{errorMessage}</p>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-600 hover:text-red-800"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      <VendorCreditForm
        title="Edit Vendor Credit"
        initialValues={credit}
        onSubmit={(data) => mutation.mutateAsync(data)}
        isSubmitting={mutation.isPending}
      />
    </div>
  );
}
