import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, List, Rocket, Plus } from 'lucide-react';
import clsx from 'clsx';

import { EnhancementForm } from '../components/admin/EnhancementForm';
import { EnhancementList } from '../components/admin/EnhancementList';
import { EnhancementDetail } from '../components/admin/EnhancementDetail';
import { DeploymentScheduler } from '../components/admin/DeploymentScheduler';
import {
  Enhancement,
  Deployment,
  getEnhancements,
  submitEnhancement,
  getDeployments,
  scheduleDeployment,
  cancelDeployment
} from '../services/enhancementApi';
import { useToast } from '../hooks/useToast';

type TabId = 'new' | 'all' | 'deployments';

interface Tab {
  id: TabId;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
}

const tabs: Tab[] = [
  { id: 'new', name: 'New Request', icon: Plus },
  { id: 'all', name: 'All Requests', icon: List },
  { id: 'deployments', name: 'Deployments', icon: Rocket }
];

export default function AdminEnhancements() {
  const [activeTab, setActiveTab] = useState<TabId>('new');
  const [selectedEnhancement, setSelectedEnhancement] = useState<Enhancement | null>(null);
  const [schedulingEnhancement, setSchedulingEnhancement] = useState<Enhancement | null>(null);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Fetch enhancements
  const {
    data: enhancements = [],
    isLoading: isLoadingEnhancements,
    refetch: refetchEnhancements
  } = useQuery({
    queryKey: ['enhancements'],
    queryFn: () => getEnhancements(),
    refetchInterval: 30000 // Refetch every 30 seconds to catch status updates
  });

  // Fetch deployments
  const {
    data: deployments = [],
    isLoading: isLoadingDeployments,
    refetch: refetchDeployments
  } = useQuery({
    queryKey: ['deployments'],
    queryFn: () => getDeployments(),
    refetchInterval: 30000
  });

  // Submit enhancement mutation
  const submitMutation = useMutation({
    mutationFn: (description: string) => submitEnhancement(description),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enhancements'] });
      showToast('Enhancement request submitted successfully!', 'success');
      setActiveTab('all'); // Switch to list tab after submission
    },
    onError: (error) => {
      showToast(error instanceof Error ? error.message : 'Failed to submit enhancement', 'error');
    }
  });

  // Schedule deployment mutation
  const scheduleMutation = useMutation({
    mutationFn: ({ enhancementId, date }: { enhancementId: number; date: Date }) =>
      scheduleDeployment(enhancementId, date),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      showToast('Deployment scheduled successfully!', 'success');
      setSchedulingEnhancement(null);
    },
    onError: (error) => {
      showToast(error instanceof Error ? error.message : 'Failed to schedule deployment', 'error');
    }
  });

  // Cancel deployment mutation
  const cancelMutation = useMutation({
    mutationFn: (deploymentId: number) => cancelDeployment(deploymentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      showToast('Deployment cancelled', 'success');
    },
    onError: (error) => {
      showToast(error instanceof Error ? error.message : 'Failed to cancel deployment', 'error');
    }
  });

  // Handlers
  const handleSubmitEnhancement = useCallback(async (description: string) => {
    await submitMutation.mutateAsync(description);
  }, [submitMutation]);

  const handleScheduleDeployment = useCallback(async (enhancementId: number, date: Date) => {
    await scheduleMutation.mutateAsync({ enhancementId, date });
  }, [scheduleMutation]);

  const handleCancelDeployment = useCallback(async (deploymentId: number) => {
    await cancelMutation.mutateAsync(deploymentId);
  }, [cancelMutation]);

  const handleRefreshEnhancements = useCallback(() => {
    refetchEnhancements();
  }, [refetchEnhancements]);

  const handleRefreshDeployments = useCallback(() => {
    refetchDeployments();
  }, [refetchDeployments]);

  const handleSelectEnhancement = useCallback((enhancement: Enhancement) => {
    setSelectedEnhancement(enhancement);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedEnhancement(null);
  }, []);

  const handleScheduleFromDetail = useCallback((enhancement: Enhancement) => {
    setSelectedEnhancement(null);
    setSchedulingEnhancement(enhancement);
    setActiveTab('deployments');
  }, []);

  // Get approved enhancements for deployment scheduler
  const approvedEnhancements = enhancements.filter(e => e.status === 'approved');

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-indigo-600" />
          AI Enhancement Requests
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Submit feature requests and let AI help implement them automatically.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            // Add badge for pending enhancements on "All Requests" tab
            let badge = null;
            if (tab.id === 'all') {
              const pendingCount = enhancements.filter(e =>
                e.status !== 'deployed' && e.status !== 'rejected'
              ).length;
              if (pendingCount > 0) {
                badge = (
                  <span className="ml-2 py-0.5 px-2 rounded-full text-xs font-medium bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">
                    {pendingCount}
                  </span>
                );
              }
            }

            // Add badge for pending deployments
            if (tab.id === 'deployments') {
              const pendingCount = deployments.filter(d => d.status === 'pending').length;
              if (pendingCount > 0) {
                badge = (
                  <span className="ml-2 py-0.5 px-2 rounded-full text-xs font-medium bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400">
                    {pendingCount}
                  </span>
                );
              }
            }

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                  isActive
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
                )}
              >
                <Icon className={clsx(
                  'mr-2 h-5 w-5',
                  isActive
                    ? 'text-indigo-500'
                    : 'text-gray-400 group-hover:text-gray-500'
                )} />
                {tab.name}
                {badge}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        {activeTab === 'new' && (
          <div>
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
              Submit a New Enhancement Request
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Describe the feature or improvement you would like. Our AI will analyze your request,
              create the necessary code changes, and submit a pull request for review.
            </p>
            <EnhancementForm onSubmit={handleSubmitEnhancement} />
          </div>
        )}

        {activeTab === 'all' && (
          <EnhancementList
            enhancements={enhancements}
            isLoading={isLoadingEnhancements}
            onRefresh={handleRefreshEnhancements}
            onSelectEnhancement={handleSelectEnhancement}
          />
        )}

        {activeTab === 'deployments' && (
          <DeploymentScheduler
            deployments={deployments}
            approvedEnhancements={approvedEnhancements}
            isLoading={isLoadingDeployments}
            onSchedule={handleScheduleDeployment}
            onCancel={handleCancelDeployment}
            onRefresh={handleRefreshDeployments}
          />
        )}
      </div>

      {/* Enhancement Detail Modal */}
      {selectedEnhancement && (
        <EnhancementDetail
          enhancement={selectedEnhancement}
          onClose={handleCloseDetail}
          onScheduleDeployment={handleScheduleFromDetail}
        />
      )}
    </div>
  );
}
