/**
 * TanStack Query hooks for Enhancement API
 *
 * This module provides React Query hooks for fetching and mutating enhancement data.
 * These hooks handle caching, background refetching, and optimistic updates.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
} from '@tanstack/react-query';
import {
  Enhancement,
  getEnhancements,
  getEnhancement,
  submitEnhancement,
  updateEnhancementStatus,
  EnhancementStatusUpdate,
} from '../services/enhancementApi';

// Query keys for cache management
export const enhancementKeys = {
  all: ['enhancements'] as const,
  lists: () => [...enhancementKeys.all, 'list'] as const,
  list: (filters: { status?: Enhancement['status'] }) =>
    [...enhancementKeys.lists(), filters] as const,
  details: () => [...enhancementKeys.all, 'detail'] as const,
  detail: (id: number) => [...enhancementKeys.details(), id] as const,
};

/**
 * Hook to fetch all enhancements
 *
 * @param status - Optional status filter
 * @param options - Additional React Query options
 * @returns Query result with enhancements array
 *
 * @example
 * ```tsx
 * // Fetch all enhancements
 * const { data, isLoading, error } = useEnhancements();
 *
 * // Fetch only pending enhancements
 * const { data } = useEnhancements('pending');
 *
 * // With custom options
 * const { data } = useEnhancements(undefined, {
 *   refetchInterval: 30000, // Refetch every 30 seconds
 * });
 * ```
 */
export function useEnhancements(
  status?: Enhancement['status'],
  options?: Omit<
    UseQueryOptions<Enhancement[], Error>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: enhancementKeys.list({ status }),
    queryFn: () => getEnhancements(status),
    staleTime: 30000, // Consider data fresh for 30 seconds
    ...options,
  });
}

/**
 * Hook to fetch a single enhancement by ID
 *
 * @param id - Enhancement ID to fetch
 * @param options - Additional React Query options
 * @returns Query result with enhancement data
 *
 * @example
 * ```tsx
 * const { data: enhancement, isLoading } = useEnhancement(123);
 *
 * // With enabled option (conditional fetching)
 * const { data } = useEnhancement(selectedId, {
 *   enabled: selectedId !== null,
 * });
 * ```
 */
export function useEnhancement(
  id: number,
  options?: Omit<
    UseQueryOptions<Enhancement, Error>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: enhancementKeys.detail(id),
    queryFn: () => getEnhancement(id),
    staleTime: 30000,
    ...options,
  });
}

/**
 * Hook to create a new enhancement
 *
 * @param options - Mutation options including onSuccess, onError callbacks
 * @returns Mutation object with mutate function
 *
 * @example
 * ```tsx
 * const { mutate, isPending, error } = useCreateEnhancement({
 *   onSuccess: (data) => {
 *     console.log('Created enhancement:', data.id);
 *   },
 *   onError: (error) => {
 *     console.error('Failed to create:', error.message);
 *   },
 * });
 *
 * // Submit a new enhancement
 * mutate({
 *   description: 'Add dark mode toggle',
 *   requestorName: 'admin@example.com',
 * });
 * ```
 */
export function useCreateEnhancement(
  options?: UseMutationOptions<
    Enhancement,
    Error,
    { description: string; requestorName?: string }
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ description, requestorName = 'Admin' }) =>
      submitEnhancement(description, requestorName),
    onSuccess: (data) => {
      // Invalidate all enhancement lists to refetch with new data
      queryClient.invalidateQueries({ queryKey: enhancementKeys.lists() });

      // Optionally set the new enhancement in cache
      queryClient.setQueryData(enhancementKeys.detail(data.id), data);
    },
    ...options,
  });
}

/**
 * Hook to update an enhancement's status
 *
 * @param options - Mutation options including onSuccess, onError callbacks
 * @returns Mutation object with mutate function
 *
 * @example
 * ```tsx
 * const { mutate: updateStatus, isPending } = useUpdateEnhancement({
 *   onSuccess: () => {
 *     showToast('Status updated successfully');
 *   },
 * });
 *
 * // Update enhancement status
 * updateStatus({
 *   id: 123,
 *   update: { status: 'approved', notes: 'Looks good!' },
 * });
 * ```
 */
export function useUpdateEnhancement(
  options?: UseMutationOptions<
    Enhancement,
    Error,
    { id: number; update: EnhancementStatusUpdate }
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, update }) => updateEnhancementStatus(id, update),
    onError: (_err, variables) => {
      // Invalidate to refetch on error
      queryClient.invalidateQueries({
        queryKey: enhancementKeys.detail(variables.id),
      });
    },
    onSettled: (_data, _error, variables) => {
      // Refetch to ensure cache is in sync with server
      queryClient.invalidateQueries({
        queryKey: enhancementKeys.detail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: enhancementKeys.lists() });
    },
    ...options,
  });
}

/**
 * Hook to prefetch an enhancement (useful for hover states)
 *
 * @returns Function to prefetch enhancement data
 *
 * @example
 * ```tsx
 * const prefetchEnhancement = usePrefetchEnhancement();
 *
 * // In a list item's onMouseEnter
 * <li onMouseEnter={() => prefetchEnhancement(item.id)}>
 *   {item.description}
 * </li>
 * ```
 */
export function usePrefetchEnhancement() {
  const queryClient = useQueryClient();

  return (id: number) => {
    queryClient.prefetchQuery({
      queryKey: enhancementKeys.detail(id),
      queryFn: () => getEnhancement(id),
      staleTime: 30000,
    });
  };
}

/**
 * Hook to invalidate enhancement caches (useful after external changes)
 *
 * @returns Object with invalidation functions
 *
 * @example
 * ```tsx
 * const { invalidateAll, invalidateOne } = useInvalidateEnhancements();
 *
 * // After a webhook notification
 * invalidateAll();
 *
 * // After a specific enhancement changes
 * invalidateOne(123);
 * ```
 */
export function useInvalidateEnhancements() {
  const queryClient = useQueryClient();

  return {
    invalidateAll: () =>
      queryClient.invalidateQueries({ queryKey: enhancementKeys.all }),
    invalidateOne: (id: number) =>
      queryClient.invalidateQueries({ queryKey: enhancementKeys.detail(id) }),
    invalidateLists: () =>
      queryClient.invalidateQueries({ queryKey: enhancementKeys.lists() }),
  };
}
