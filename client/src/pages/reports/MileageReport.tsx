import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Filter, Car } from 'lucide-react';
import api from '../../lib/api';
import { formatDate } from '../../lib/dateUtils';
import ReportHeader from '../../components/reports/ReportHeader';
import DateRangePicker from '../../components/reports/DateRangePicker';
import { formatCurrencyStandalone } from '../../contexts/CurrencyContext';

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
}

type PersonalFilter = 'business' | 'personal' | 'all';

interface CategorySummary {
  trips: MileageTrip[];
  totalMiles: number;
  totalDeductible: number;
}

interface GroupedMileage {
  [category: string]: CategorySummary;
}

export default function MileageReport() {
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(0);
    date.setDate(1);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [groupBy, setGroupBy] = useState<'category' | 'vehicle' | 'customer'>('category');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [personalFilter, setPersonalFilter] = useState<PersonalFilter>('business');

  const { data: trips, isLoading } = useQuery({
    queryKey: ['mileage-report', startDate, endDate, categoryFilter, personalFilter],
    queryFn: async () => {
      let filter = `TripDate ge ${startDate} and TripDate le ${endDate}`;
      if (categoryFilter !== 'all') {
        filter += ` and Category eq '${categoryFilter}'`;
      }
      if (personalFilter === 'business') {
        filter += ' and IsPersonal eq false';
      } else if (personalFilter === 'personal') {
        filter += ' and IsPersonal eq true';
      }
      const response = await api.get<{ value: MileageTrip[] }>(
        `/mileagetrips?$filter=${filter}&$orderby=TripDate desc`
      );
      return response.data.value;
    },
  });

  // Group trips and calculate summaries
  const groupedMileage: GroupedMileage = {};
  let grandTotalMiles = 0;
  let grandTotalDeductible = 0;

  trips?.forEach((trip) => {
    let groupKey: string;
    switch (groupBy) {
      case 'vehicle':
        groupKey = trip.VehicleName || 'No Vehicle';
        break;
      case 'customer':
        groupKey = trip.CustomerName || 'No Customer';
        break;
      case 'category':
      default:
        groupKey = trip.Category;
    }

    if (!groupedMileage[groupKey]) {
      groupedMileage[groupKey] = { trips: [], totalMiles: 0, totalDeductible: 0 };
    }

    const effectiveDistance = trip.IsRoundTrip ? trip.Distance * 2 : trip.Distance;
    groupedMileage[groupKey].trips.push(trip);
    groupedMileage[groupKey].totalMiles += effectiveDistance;
    groupedMileage[groupKey].totalDeductible += trip.DeductibleAmount || 0;
    grandTotalMiles += effectiveDistance;
    grandTotalDeductible += trip.DeductibleAmount || 0;
  });

  const sortedGroups = Object.entries(groupedMileage).sort(
    (a, b) => b[1].totalMiles - a[1].totalMiles
  );

  const handleExportCSV = () => {
    if (!trips || trips.length === 0) return;

    const headers = [
      'Date',
      'Vehicle',
      'From',
      'To',
      'Miles',
      'Round Trip',
      'Category',
      'Personal',
      'Purpose',
      'Rate/Mile',
      'Deduction',
      'Customer',
      'Project',
    ];
    const rows = trips.map((t) => {
      const effectiveMiles = t.IsRoundTrip ? t.Distance * 2 : t.Distance;
      return [
        t.TripDate,
        t.VehicleName || '',
        t.StartLocation || '',
        t.EndLocation || '',
        effectiveMiles.toFixed(1),
        t.IsRoundTrip ? 'Yes' : 'No',
        t.Category,
        t.IsPersonal ? 'Yes' : 'No',
        t.Purpose || '',
        t.RatePerMile?.toFixed(4) || '',
        t.DeductibleAmount?.toFixed(2) || '',
        t.CustomerName || '',
        t.ProjectName || '',
      ];
    });

    // Add summary row
    rows.push([]);
    rows.push(['TOTAL', '', '', '', grandTotalMiles.toFixed(1), '', '', '', '', grandTotalDeductible.toFixed(2), '', '']);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mileage-report-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Business':
        return 'text-green-700 bg-green-50';
      case 'Medical':
        return 'text-blue-700 bg-blue-50';
      case 'Charity':
        return 'text-purple-700 bg-purple-50';
      case 'Personal':
        return 'text-gray-700 bg-gray-50';
      default:
        return 'text-gray-700 bg-gray-50';
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <ReportHeader
        title="Mileage Report"
        subtitle={`${formatDate(startDate)} - ${formatDate(endDate)}`}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white shadow rounded-lg p-4">
          <p className="text-sm font-medium text-gray-500">Total Miles</p>
          <p className="text-2xl font-bold text-gray-900">{grandTotalMiles.toFixed(1)}</p>
        </div>
        <div className="bg-white shadow rounded-lg p-4">
          <p className="text-sm font-medium text-gray-500">Total Trips</p>
          <p className="text-2xl font-bold text-gray-900">{trips?.length || 0}</p>
        </div>
        <div className="bg-green-50 shadow rounded-lg p-4">
          <p className="text-sm font-medium text-green-600">Tax Deductible</p>
          <p className="text-2xl font-bold text-green-700">{formatCurrencyStandalone(grandTotalDeductible)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="all">All Categories</option>
              <option value="Business">Business</option>
              <option value="Medical">Medical</option>
              <option value="Charity">Charity</option>
              <option value="Personal">Personal</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Show</label>
            <select
              value={personalFilter}
              onChange={(e) => setPersonalFilter(e.target.value as PersonalFilter)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="business">Business Only</option>
              <option value="personal">Personal Only</option>
              <option value="all">All Trips</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Group By</label>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="category">Category</option>
              <option value="vehicle">Vehicle</option>
              <option value="customer">Customer</option>
            </select>
          </div>

          <button
            onClick={handleExportCSV}
            disabled={!trips || trips.length === 0}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Report Content */}
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      ) : trips && trips.length > 0 ? (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          {sortedGroups.map(([groupName, groupData]) => (
            <div key={groupName} className="border-b last:border-b-0">
              <div
                className={`px-6 py-3 flex justify-between items-center ${
                  groupBy === 'category' ? getCategoryColor(groupName) : 'bg-gray-50'
                }`}
              >
                <div className="flex items-center">
                  {groupBy === 'vehicle' && <Car className="w-5 h-5 mr-2 text-gray-500" />}
                  <h3 className="font-medium">{groupName}</h3>
                  <span className="ml-3 text-sm text-gray-500">
                    {groupData.trips.length} trip{groupData.trips.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-semibold">{groupData.totalMiles.toFixed(1)} miles</span>
                  {groupData.totalDeductible > 0 && (
                    <span className="ml-4 font-semibold text-green-700">
                      {formatCurrencyStandalone(groupData.totalDeductible)}
                    </span>
                  )}
                </div>
              </div>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Date
                    </th>
                    {groupBy !== 'vehicle' && (
                      <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Vehicle
                      </th>
                    )}
                    <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Route
                    </th>
                    <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Purpose
                    </th>
                    <th className="px-6 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Miles
                    </th>
                    {groupBy !== 'category' && (
                      <th className="px-6 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                        Category
                      </th>
                    )}
                    <th className="px-6 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Deduction
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {groupData.trips.map((trip) => {
                    const effectiveMiles = trip.IsRoundTrip ? trip.Distance * 2 : trip.Distance;
                    return (
                      <tr key={trip.Id}>
                        <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-900">
                          {formatDate(trip.TripDate)}
                        </td>
                        {groupBy !== 'vehicle' && (
                          <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-500">
                            {trip.VehicleName || '-'}
                          </td>
                        )}
                        <td className="px-6 py-2 text-sm text-gray-500 max-w-xs truncate">
                          {trip.StartLocation} → {trip.EndLocation}
                          {trip.IsRoundTrip && (
                            <span className="ml-1 text-xs text-indigo-600">(RT)</span>
                          )}
                        </td>
                        <td className="px-6 py-2 text-sm text-gray-500 truncate max-w-xs">
                          {trip.Purpose || '-'}
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-900 text-right">
                          {effectiveMiles.toFixed(1)}
                        </td>
                        {groupBy !== 'category' && (
                          <td className="px-6 py-2 whitespace-nowrap text-sm text-center">
                            <span
                              className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${getCategoryColor(
                                trip.Category
                              )}`}
                            >
                              {trip.Category}
                            </span>
                          </td>
                        )}
                        <td className="px-6 py-2 whitespace-nowrap text-sm text-right">
                          {trip.DeductibleAmount ? (
                            <span className="text-green-600 font-medium">
                              {formatCurrencyStandalone(trip.DeductibleAmount)}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}

          {/* Grand Total */}
          <div className="bg-indigo-50 px-6 py-4">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-indigo-900">Grand Total</span>
              <div className="text-right">
                <span className="text-xl font-bold text-indigo-900">
                  {grandTotalMiles.toFixed(1)} miles
                </span>
                <span className="ml-6 text-xl font-bold text-green-700">
                  {formatCurrencyStandalone(grandTotalDeductible)} deductible
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg p-8 text-center">
          <Filter className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-gray-500">No mileage trips found for the selected date range.</p>
        </div>
      )}

      {/* Tax Deduction Notes */}
      <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-yellow-800 mb-2">Tax Deduction Notes</h4>
        <ul className="text-sm text-yellow-700 list-disc list-inside space-y-1">
          <li>Only Business, Medical, and Charity trips qualify for tax deductions.</li>
          <li>Personal trips are not tax deductible.</li>
          <li>Rates shown are IRS standard mileage rates. Consult your tax advisor for actual deduction amounts.</li>
          <li>Keep detailed records including date, destination, business purpose, and miles for each trip.</li>
        </ul>
      </div>
    </div>
  );
}
