import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

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
  HourlyRate?: number;
  Description?: string;
  IsBillable?: boolean;
  Status?: 'Pending' | 'Approved' | 'Invoiced';
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
    const response = await api.get(`/timeentries?$filter=ProjectId eq '${projectId}'`);
    return response.data.value;
  },

  getByDateRange: async (startDate: string, endDate: string): Promise<TimeEntry[]> => {
    const response = await api.get(
      `/timeentries?$filter=EntryDate ge '${startDate}' and EntryDate le '${endDate}'`
    );
    return response.data.value;
  },

  create: async (entry: TimeEntryInput): Promise<TimeEntry> => {
    const response = await api.post('/timeentries', entry);
    return response.data;
  },

  update: async (id: string, entry: Partial<TimeEntryInput>): Promise<TimeEntry> => {
    const response = await api.patch(`/timeentries/Id/${id}`, entry);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/timeentries/Id/${id}`);
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
