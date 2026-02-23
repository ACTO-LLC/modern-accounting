import axios from 'axios';
import { PublicClientApplication, SilentRequest, AccountInfo } from '@azure/msal-browser';
import { apiRequest, roleHierarchy } from './authConfig';
import { formatDateForOData } from './dateUtils';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Resolve the highest DAB role from Azure AD token claims
function resolveDabRole(account: AccountInfo): string {
  const roles = (account.idTokenClaims as any)?.roles as string[] | undefined;
  if (roles?.length) {
    // Return the highest role per the hierarchy
    for (let i = roleHierarchy.length - 1; i >= 0; i--) {
      if (roles.includes(roleHierarchy[i])) return roleHierarchy[i];
    }
  }
  return 'authenticated';
}

// Store the MSAL instance for use in interceptors
let msalInstance: PublicClientApplication | null = null;

// Store the current tenant ID for multi-tenant requests
let currentTenantId: string | null = null;

// Initialize the API with MSAL instance for token injection
export function initializeApiAuth(instance: PublicClientApplication) {
  msalInstance = instance;
}

// Set the current tenant ID for API requests
export function setCurrentTenantId(tenantId: string | null) {
  currentTenantId = tenantId;
}

// Get the current tenant ID
export function getCurrentTenantId(): string | null {
  return currentTenantId;
}

// Track if we're already redirecting to avoid multiple redirects
let isRedirecting = false;

// Request interceptor to add auth token and tenant header
api.interceptors.request.use(
  async (config) => {
    // Add tenant ID header if available
    if (currentTenantId) {
      config.headers['X-Tenant-Id'] = currentTenantId;
    }

    if (!msalInstance) {
      // Bypass auth mode: add Admin role header so DAB allows write operations
      config.headers['X-MS-API-ROLE'] = 'Admin';
      return config;
    }

    const accounts = msalInstance.getAllAccounts();
    console.log('[API Auth] Accounts:', accounts.length, 'Scopes:', apiRequest.scopes, 'URL:', config.url);

    if (accounts.length === 0) {
      console.warn('[API Auth] No accounts found, triggering login redirect');
      if (!isRedirecting) {
        isRedirecting = true;
        await msalInstance.loginRedirect(apiRequest);
      }
      return config;
    }

    const silentRequest: SilentRequest = {
      ...apiRequest,
      account: accounts[0],
    };

    try {
      const response = await msalInstance.acquireTokenSilent(silentRequest);
      console.log('[API Auth] Token acquired, expires:', response.expiresOn, 'aud:', response.account?.idTokenClaims?.aud);
      config.headers.Authorization = `Bearer ${response.accessToken}`;
      // DAB Simulator needs X-MS-API-ROLE to resolve permissions (production AzureAD provider ignores it)
      config.headers['X-MS-API-ROLE'] = resolveDabRole(accounts[0]);
      console.log('[API Auth] Token attached to request, length:', response.accessToken.length, 'role:', config.headers['X-MS-API-ROLE']);
    } catch (error: any) {
      console.error('[API Auth] acquireTokenSilent failed:', error?.name, error?.message, error);

      // Any token acquisition failure: clear cache and force re-login
      if (!isRedirecting) {
        isRedirecting = true;
        console.warn('[API Auth] Clearing cache and forcing re-login...');

        // Clear all cached accounts to force fresh login
        const accounts = msalInstance.getAllAccounts();
        for (const account of accounts) {
          await msalInstance.clearCache({ account });
        }

        // Redirect to login with API scopes
        await msalInstance.loginRedirect(apiRequest);
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for handling auth errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Unauthorized - token may be expired or invalid
      console.error('Unauthorized request - authentication required');
      // Could trigger a login redirect here if needed
    }
    return Promise.reject(error);
  }
);

// GraphQL client - uses a separate axios instance with no baseURL to hit /graphql directly
const graphqlClient = axios.create({
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add the same auth interceptor to graphQL client
graphqlClient.interceptors.request.use(
  async (config) => {
    if (!msalInstance) {
      // Bypass auth mode: add Admin role header so DAB allows write operations
      config.headers['X-MS-API-ROLE'] = 'Admin';
      return config;
    }

    const accounts = msalInstance.getAllAccounts();
    if (accounts.length === 0) {
      console.warn('[GraphQL Auth] No accounts found');
      if (!isRedirecting) {
        isRedirecting = true;
        await msalInstance.loginRedirect(apiRequest);
      }
      return config;
    }

    const silentRequest: SilentRequest = {
      ...apiRequest,
      account: accounts[0],
    };

    try {
      const response = await msalInstance.acquireTokenSilent(silentRequest);
      config.headers.Authorization = `Bearer ${response.accessToken}`;
      config.headers['X-MS-API-ROLE'] = resolveDabRole(accounts[0]);
    } catch (error: any) {
      console.error('[GraphQL Auth] acquireTokenSilent failed:', error?.name, error?.message);

      if (!isRedirecting) {
        isRedirecting = true;
        console.warn('[GraphQL Auth] Forcing re-login...');
        await msalInstance.loginRedirect(apiRequest);
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// GraphQL query helper
export async function graphql<T = any>(query: string, variables?: Record<string, any>): Promise<T> {
  const response = await graphqlClient.post('/graphql', { query, variables });
  if (response.data.errors) {
    throw new Error(response.data.errors[0]?.message || 'GraphQL error');
  }
  return response.data.data;
}

export default api;

// Project Types
export interface Project {
  Id: string;
  Name: string;
  CustomerId: string;
  Description?: string;
  Status: 'Active' | 'Completed' | 'OnHold';
  StartDate?: string;
  EndDate?: string;
  BudgetedHours?: number;
  BudgetedAmount?: number;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface ProjectInput {
  Name: string;
  CustomerId: string;
  Description?: string;
  Status?: 'Active' | 'Completed' | 'OnHold';
  StartDate?: string;
  EndDate?: string;
  BudgetedHours?: number;
  BudgetedAmount?: number;
}

// Time Entry Types
export interface TimeEntry {
  Id: string;
  ProjectId: string;
  ProjectName: string;
  CustomerId: string;
  EmployeeName: string;
  EntryDate: string;
  Hours: number;
  HourlyRate: number;
  Description?: string;
  IsBillable: boolean;
  Status: 'Pending' | 'Approved' | 'Invoiced';
  InvoiceLineId?: string;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface TimeEntryInput {
  ProjectId: string;
  CustomerId: string;
  EmployeeName: string;
  EntryDate: string;
  Hours: number;
  HourlyRate?: number | null;
  Description?: string | null;
  IsBillable?: boolean | null;
  Status?: 'Pending' | 'Approved' | 'Invoiced' | null;
}

// Customer Type (for reference)
export interface Customer {
  Id: string;
  Name: string;
  Email?: string;
  Phone?: string;
  Address?: string;
  CreatedAt: string;
  UpdatedAt: string;
}

// Projects API
export const projectsApi = {
  getAll: async (): Promise<Project[]> => {
    const response = await api.get('/projects');
    return response.data.value;
  },

  getById: async (id: string): Promise<Project> => {
    const response = await api.get(`/projects/Id/${id}`);
    return response.data;
  },

  create: async (project: ProjectInput): Promise<Project> => {
    const response = await api.post('/projects', project);
    return response.data;
  },

  update: async (id: string, project: Partial<ProjectInput>): Promise<Project> => {
    const response = await api.patch(`/projects/Id/${id}`, project);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/projects/Id/${id}`);
  },
};

// Time Entries API
export const timeEntriesApi = {
  getAll: async (): Promise<TimeEntry[]> => {
    const response = await api.get('/timeentries');
    return response.data.value;
  },

  getById: async (id: string): Promise<TimeEntry> => {
    const response = await api.get(`/timeentries/Id/${id}`);
    return response.data;
  },

  getByProject: async (projectId: string): Promise<TimeEntry[]> => {
    const response = await api.get(`/timeentries?$filter=ProjectId eq ${projectId}`);
    return response.data.value;
  },

  getByDateRange: async (startDate: string, endDate: string): Promise<TimeEntry[]> => {
    const start = formatDateForOData(startDate);
    const end = formatDateForOData(endDate, true);
    const response = await api.get(
      `/timeentries?$filter=EntryDate ge ${start} and EntryDate le ${end}`
    );
    return response.data.value;
  },

  create: async (entry: TimeEntryInput): Promise<TimeEntry> => {
    const response = await api.post('/timeentries_write', entry);
    return response.data;
  },

  update: async (id: string, entry: Partial<TimeEntryInput>): Promise<TimeEntry> => {
    const response = await api.patch(`/timeentries_write/Id/${id}`, entry);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/timeentries_write/Id/${id}`);
  },
};

// Customers API
export const customersApi = {
  getAll: async (): Promise<Customer[]> => {
    const response = await api.get('/customers');
    return response.data.value;
  },

  getById: async (id: string): Promise<Customer> => {
    const response = await api.get(`/customers/Id/${id}`);
    return response.data;
  },
};

// Employee Type
export interface Employee {
  Id: string;
  EmployeeNumber: string;
  FirstName: string;
  LastName: string;
  FullName: string;
  Email?: string;
  Phone?: string;
  Status: string;
  HireDate: string;
  PayType: string;
  PayRate: number;
}

// Employees API
export const employeesApi = {
  getAll: async (): Promise<Employee[]> => {
    const response = await api.get('/employees');
    return response.data.value;
  },

  getById: async (id: string): Promise<Employee> => {
    const response = await api.get(`/employees/Id/${id}`);
    return response.data;
  },
};
