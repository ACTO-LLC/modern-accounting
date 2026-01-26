import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../lib/api';
import MileageForm, { MileageFormData } from '../components/MileageForm';

interface MileageTrip {
  Id: string;
  VehicleId: string | null;
  TripDate: string;
  StartLocation: string;
  EndLocation: string;
  StartOdometer: number | null;
  EndOdometer: number | null;
  Distance: number;
  Purpose: string;
  Category: string;
  RatePerMile: number | null;
  DeductibleAmount: number | null;
  CustomerId: string | null;
  ProjectId: string | null;
  Notes: string | null;
  IsRoundTrip: boolean;
  Status: string;
}

export default function EditMileage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: trip, isLoading } = useQuery({
    queryKey: ['mileagetrip', id],
    queryFn: async () => {
      const response = await api.get<{ value: MileageTrip[] }>(
        `/mileagetrips?$filter=Id eq ${id}`
      );
      return response.data.value[0];
    },
    enabled: !!id,
  });

  const mutation = useMutation({
    mutationFn: async (data: MileageFormData) => {
      await api.patch(`/mileagetrips_write/Id/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mileagetrips'] });
      queryClient.invalidateQueries({ queryKey: ['mileagetrip', id] });
      navigate('/mileage');
    },
    onError: (error) => {
      console.error('Failed to update mileage trip:', error);
      setErrorMessage('Failed to update mileage trip. Please try again.');
    },
  });

  const handleSubmit = async (data: MileageFormData) => {
    await mutation.mutateAsync(data);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-600">Trip not found.</p>
        </div>
      </div>
    );
  }

  // Transform trip data for the form
  const initialValues: Partial<MileageFormData> = {
    VehicleId: trip.VehicleId,
    TripDate: trip.TripDate,
    StartLocation: trip.StartLocation,
    EndLocation: trip.EndLocation,
    StartOdometer: trip.StartOdometer,
    EndOdometer: trip.EndOdometer,
    Distance: trip.Distance,
    Purpose: trip.Purpose,
    Category: trip.Category as 'Business' | 'Personal' | 'Medical' | 'Charity',
    RatePerMile: trip.RatePerMile,
    DeductibleAmount: trip.DeductibleAmount,
    CustomerId: trip.CustomerId,
    ProjectId: trip.ProjectId,
    Notes: trip.Notes,
    IsRoundTrip: trip.IsRoundTrip,
    Status: trip.Status as 'Recorded' | 'Pending' | 'Approved' | 'Voided',
  };

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
      <MileageForm
        title="Edit Trip"
        initialValues={initialValues}
        onSubmit={handleSubmit}
        isSubmitting={mutation.isPending}
        submitButtonText="Update Trip"
      />
    </div>
  );
}
