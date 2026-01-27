/**
 * Enhancement Request API Service
 * Handles communication with the backend API for enhancement requests and deployments
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface Enhancement {
  id: number;
  description: string;
  requestorName: string;
  status: 'pending' | 'analyzing' | 'in-progress' | 'review' | 'approved' | 'deployed' | 'rejected';
  intent?: string;
  branchName?: string;
  prUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Deployment {
  id: number;
  enhancementId: number;
  scheduledDate: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'cancelled';
  enhancement?: Enhancement;
  createdAt: string;
  updatedAt: string;
}

export interface EnhancementStatusUpdate {
  status: Enhancement['status'];
  notes?: string;
}

/**
 * Submit a new enhancement request
 */
export async function submitEnhancement(description: string, requestorName: string = 'Admin'): Promise<Enhancement> {
  const res = await fetch(`${API_BASE}/api/enhancements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, requestorName })
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || 'Failed to submit enhancement');
  }
  return res.json();
}

/**
 * Get all enhancement requests, optionally filtered by status
 */
export async function getEnhancements(status?: Enhancement['status']): Promise<Enhancement[]> {
  const url = status
    ? `${API_BASE}/api/enhancements?status=${status}`
    : `${API_BASE}/api/enhancements`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Failed to fetch enhancements');
  }
  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.value)) return data.value;
  return [];
}

/**
 * Get a single enhancement by ID
 */
export async function getEnhancement(id: number): Promise<Enhancement> {
  const res = await fetch(`${API_BASE}/api/enhancements/${id}`);
  if (!res.ok) {
    throw new Error('Failed to fetch enhancement');
  }
  return res.json();
}

/**
 * Update enhancement status
 */
export async function updateEnhancementStatus(id: number, update: EnhancementStatusUpdate): Promise<Enhancement> {
  const res = await fetch(`${API_BASE}/api/enhancements/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update)
  });
  if (!res.ok) {
    throw new Error('Failed to update enhancement status');
  }
  return res.json();
}

/**
 * Schedule a deployment for an approved enhancement
 */
export async function scheduleDeployment(enhancementId: number, scheduledDate: Date): Promise<Deployment> {
  const res = await fetch(`${API_BASE}/api/deployments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      enhancementId,
      scheduledDate: scheduledDate.toISOString()
    })
  });
  if (!res.ok) {
    throw new Error('Failed to schedule deployment');
  }
  return res.json();
}

/**
 * Get all pending deployments
 */
export async function getPendingDeployments(): Promise<Deployment[]> {
  const res = await fetch(`${API_BASE}/api/deployments/pending`);
  if (!res.ok) {
    throw new Error('Failed to fetch deployments');
  }
  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.value)) return data.value;
  return [];
}

/**
 * Get all deployments
 */
export async function getDeployments(): Promise<Deployment[]> {
  const res = await fetch(`${API_BASE}/api/deployments`);
  if (!res.ok) {
    throw new Error('Failed to fetch deployments');
  }
  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.value)) return data.value;
  return [];
}

/**
 * Cancel a scheduled deployment
 */
export async function cancelDeployment(id: number): Promise<Deployment> {
  const res = await fetch(`${API_BASE}/api/deployments/${id}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!res.ok) {
    throw new Error('Failed to cancel deployment');
  }
  return res.json();
}

/**
 * Get deployment by ID
 */
export async function getDeployment(id: number): Promise<Deployment> {
  const res = await fetch(`${API_BASE}/api/deployments/${id}`);
  if (!res.ok) {
    throw new Error('Failed to fetch deployment');
  }
  return res.json();
}
