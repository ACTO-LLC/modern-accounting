import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Plus, Car, BarChart3, User } from 'lucide-react';
import { GridColDef } from '@mui/x-data-grid';
import RestDataGrid from '../components/RestDataGrid';
import { formatDate } from '../lib/dateUtils';
import { getTimestampColumns } from '../lib/gridColumns';

interface MileageTrip {
  Id: string;
  TripDate: string;
  VehicleName: string;
  VehicleDescription: string;
  StartLocation: string;
  EndLocation: string;
  Distance: number;
  Purpose: string;
  Category: string;
  RatePerMile: number;
  DeductibleAmount: number;
  CustomerName: string;
  ProjectName: string;
  IsRoundTrip: boolean;
  IsPersonal: boolean;
  Status: string;
  CreatedAt: string;
  UpdatedAt: string;
}

type PersonalFilter = 'all' | 'business' | 'personal';

const getCategoryColor = (category: string) => {
  switch (category) {
    case 'Business':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'Medical':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'Charity':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
    case 'Personal':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Recorded':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'Pending':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    case 'Approved':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'Voided':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
};

export default function Mileage() {
  const [personalFilter, setPersonalFilter] = useState<PersonalFilter>('business');

  // Build endpoint with filter
  const getEndpoint = () => {
    let endpoint = '/mileagetrips?$orderby=TripDate desc';
    if (personalFilter === 'business') {
      endpoint += '&$filter=IsPersonal eq false';
    } else if (personalFilter === 'personal') {
      endpoint += '&$filter=IsPersonal eq true';
    }
    return endpoint;
  };

  const columns: GridColDef[] = [
    {
      field: 'TripDate',
      headerName: 'Date',
      width: 110,
      filterable: true,
      renderCell: (params) => formatDate(params.value),
    },
    {
      field: 'VehicleName',
      headerName: 'Vehicle',
      width: 140,
      filterable: true,
      renderCell: (params) => (
        <div className="flex items-center">
          <Car className="w-4 h-4 mr-2 text-gray-500" />
          <span>{params.value || 'No vehicle'}</span>
        </div>
      ),
    },
    {
      field: 'StartLocation',
      headerName: 'From',
      width: 150,
      filterable: true,
      renderCell: (params) => (
        <span className="truncate" title={params.value}>
          {params.value || '-'}
        </span>
      ),
    },
    {
      field: 'EndLocation',
      headerName: 'To',
      width: 150,
      filterable: true,
      renderCell: (params) => (
        <span className="truncate" title={params.value}>
          {params.value || '-'}
        </span>
      ),
    },
    {
      field: 'Distance',
      headerName: 'Miles',
      width: 90,
      type: 'number',
      filterable: true,
      renderCell: (params) => {
        const row = params.row as MileageTrip;
        return (
          <span>
            {params.value?.toFixed(1)}
            {row.IsRoundTrip && <span className="text-xs text-gray-500 ml-1">(RT)</span>}
          </span>
        );
      },
    },
    {
      field: 'Purpose',
      headerName: 'Purpose',
      width: 180,
      filterable: true,
      renderCell: (params) => (
        <span className="truncate" title={params.value}>
          {params.value || '-'}
        </span>
      ),
    },
    {
      field: 'Category',
      headerName: 'Category',
      width: 110,
      filterable: true,
      renderCell: (params) => (
        <span
          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getCategoryColor(
            params.value
          )}`}
        >
          {params.value}
        </span>
      ),
    },
    {
      field: 'IsPersonal',
      headerName: 'Type',
      width: 100,
      renderCell: (params) =>
        params.value ? (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
            <User className="w-3 h-3 mr-1" />
            Personal
          </span>
        ) : (
          <span className="text-xs text-gray-500">Business</span>
        ),
    },
    {
      field: 'DeductibleAmount',
      headerName: 'Deduction',
      width: 110,
      type: 'number',
      filterable: true,
      renderCell: (params) =>
        params.value ? (
          <span className="text-green-600 font-medium">
            ${params.value.toFixed(2)}
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        ),
    },
    {
      field: 'CustomerName',
      headerName: 'Customer',
      width: 130,
      filterable: true,
      renderCell: (params) => params.value || <span className="text-gray-400">-</span>,
    },
    {
      field: 'Status',
      headerName: 'Status',
      width: 100,
      filterable: true,
      renderCell: (params) => (
        <span
          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
            params.value
          )}`}
        >
          {params.value}
        </span>
      ),
    },
    ...getTimestampColumns(),
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Mileage Tracking</h1>
          <p className="mt-1 text-sm text-gray-500">
            Log business trips and track mileage for tax deductions
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <select
            value={personalFilter}
            onChange={(e) => setPersonalFilter(e.target.value as PersonalFilter)}
            className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm border p-2"
          >
            <option value="business">Business Only</option>
            <option value="personal">Personal Only</option>
            <option value="all">All Trips</option>
          </select>
          <Link
            to="/mileage/vehicles"
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50"
          >
            <Car className="w-4 h-4 mr-2" />
            Vehicles
          </Link>
          <Link
            to="/reports/mileage"
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50"
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            Report
          </Link>
          <Link
            to="/mileage/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Trip
          </Link>
        </div>
      </div>

      <RestDataGrid<MileageTrip>
        key={personalFilter}
        gridKey="mileage-grid"
        endpoint={getEndpoint()}
        columns={columns}
        editPath="/mileage/{id}/edit"
        initialPageSize={25}
        emptyMessage="No trips recorded yet. Click 'New Trip' to log a trip."
      />
    </div>
  );
}
