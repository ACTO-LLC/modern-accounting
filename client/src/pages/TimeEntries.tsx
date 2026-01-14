import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, ChevronLeft, ChevronRight, Calendar, List, Trash2 } from 'lucide-react';
import { timeEntriesApi, TimeEntry } from '../lib/api';
import clsx from 'clsx';

type ViewMode = 'list' | 'calendar';

export default function TimeEntries() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);
    return monday;
  });

  const weekEnd = useMemo(() => {
    const end = new Date(currentWeekStart);
    end.setDate(end.getDate() + 6);
    return end;
  }, [currentWeekStart]);

  const formatDate = (date: Date) => date.toISOString().split('T')[0];

  const { data: allEntries = [], isLoading, error } = useQuery<TimeEntry[]>({
    queryKey: ['timeEntries'],
    queryFn: timeEntriesApi.getAll,
  });

  // Filter entries for current week
  const weekEntries = useMemo(() => {
    return allEntries.filter(entry => {
      const entryDate = new Date(entry.EntryDate);
      return entryDate >= currentWeekStart && entryDate <= weekEnd;
    });
  }, [allEntries, currentWeekStart, weekEnd]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => timeEntriesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
    },
    onError: (error) => {
      console.error('Failed to delete time entry:', error);
      alert('Failed to delete time entry');
    }
  });

  const navigateWeek = (direction: 'prev' | 'next') => {
    setCurrentWeekStart(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
      return newDate;
    });
  };

  const goToThisWeek = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);
    setCurrentWeekStart(monday);
  };

  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(currentWeekStart);
      day.setDate(day.getDate() + i);
      days.push(day);
    }
    return days;
  }, [currentWeekStart]);

  const totalHours = weekEntries.reduce((sum, entry) => sum + entry.Hours, 0);

  const getEntriesForDay = (date: Date) => {
    const dateStr = formatDate(date);
    return weekEntries.filter(entry => entry.EntryDate.split('T')[0] === dateStr);
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'Approved':
        return 'bg-green-100 text-green-800';
      case 'Invoiced':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) return <div className="p-4">Loading time entries...</div>;
  if (error) return <div className="p-4 text-red-600">Error loading time entries</div>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Time Tracking</h1>
        <Link
          to="/time-entries/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          Log Time
        </Link>
      </div>

      {/* Week Navigation */}
      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigateWeek('prev')}
              className="p-2 rounded-md hover:bg-gray-100"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-lg font-medium">
              {currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} -{' '}
              {weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <button
              onClick={() => navigateWeek('next')}
              className="p-2 rounded-md hover:bg-gray-100"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={goToThisWeek}
              className="text-sm text-indigo-600 hover:text-indigo-800"
            >
              This Week
            </button>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-500">
              Total: <span className="font-semibold text-gray-900">{totalHours.toFixed(1)} hrs</span>
            </div>
            <div className="flex border rounded-md">
              <button
                onClick={() => setViewMode('list')}
                className={clsx(
                  'px-3 py-1 text-sm',
                  viewMode === 'list' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                )}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={clsx(
                  'px-3 py-1 text-sm',
                  viewMode === 'calendar' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                )}
              >
                <Calendar className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        /* Calendar View */
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="grid grid-cols-7 gap-px bg-gray-200">
            {weekDays.map((day) => (
              <div key={day.toISOString()} className="bg-gray-50 py-2 text-center">
                <div className="text-xs text-gray-500">
                  {day.toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div className={clsx(
                  'text-sm font-medium',
                  formatDate(day) === formatDate(new Date()) ? 'text-indigo-600' : 'text-gray-900'
                )}>
                  {day.getDate()}
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-gray-200 min-h-[200px]">
            {weekDays.map((day) => {
              const dayEntries = getEntriesForDay(day);
              const dayTotal = dayEntries.reduce((sum, e) => sum + e.Hours, 0);
              return (
                <div key={day.toISOString()} className="bg-white p-2">
                  {dayEntries.length > 0 ? (
                    <div className="space-y-1">
                      {dayEntries.map((entry) => (
                        <div
                          key={entry.Id}
                          className="text-xs p-1 bg-indigo-50 rounded border-l-2 border-indigo-500"
                        >
                          <div className="font-medium truncate">
                            {entry.ProjectName || 'Unknown'}
                          </div>
                          <div className="text-gray-500">{entry.Hours}h</div>
                        </div>
                      ))}
                      <div className="text-xs text-gray-500 pt-1 border-t">
                        Total: {dayTotal.toFixed(1)}h
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 text-center py-4">-</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* List View */
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          {weekEntries.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No time entries</h3>
              <p className="mt-1 text-sm text-gray-500">No time logged for this week.</p>
              <div className="mt-6">
                <Link
                  to="/time-entries/new"
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Log Time
                </Link>
              </div>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Project
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hours
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Billable
                  </th>
                  <th scope="col" className="relative px-6 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {weekEntries
                  .sort((a, b) => new Date(b.EntryDate).getTime() - new Date(a.EntryDate).getTime())
                  .map((entry) => (
                    <tr key={entry.Id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(entry.EntryDate).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {entry.ProjectName || 'Unknown'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                        {entry.Description || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {entry.Hours.toFixed(1)}h
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={clsx(
                          'px-2 inline-flex text-xs leading-5 font-semibold rounded-full',
                          getStatusBadgeClass(entry.Status)
                        )}>
                          {entry.Status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {entry.IsBillable ? 'Yes' : 'No'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => {
                            if (window.confirm('Delete this time entry?')) {
                              deleteMutation.mutate(entry.Id);
                            }
                          }}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
