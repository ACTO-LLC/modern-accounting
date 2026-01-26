import axios from 'axios';

const emailApi = axios.create({
  baseURL: '/email-api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface EmailSettings {
  Id?: string;
  SmtpHost: string;
  SmtpPort: number;
  SmtpSecure: boolean;
  SmtpUsername: string;
  FromEmail: string;
  FromName: string;
  ReplyToEmail?: string;
  EmailSubjectTemplate: string;
  EmailBodyTemplate: string;
  IsActive?: boolean;
  LastTestedAt?: string;
  LastTestedResult?: string;
}

export interface EmailSettingsResponse {
  configured: boolean;
  settings?: EmailSettings;
}

export interface EmailLog {
  Id: string;
  RecipientEmail: string;
  RecipientName?: string;
  Subject: string;
  Status: 'Pending' | 'Sent' | 'Failed';
  ErrorMessage?: string;
  SentAt?: string;
  CreatedAt: string;
  IsAutomatic?: boolean;
  ReminderSettingId?: string;
}

export interface SendEmailRequest {
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  body: string;
  companySettings?: {
    name?: string;
    email?: string;
    phone?: string;
  };
}

export interface SendStatementRequest extends SendEmailRequest {
  startDate: string;
  endDate: string;
}

// Email Template types
export type EmailTemplateType = 'InvoiceReminder' | 'InvoiceDelivery' | 'PaymentReceipt' | 'StatementDelivery';

export interface EmailTemplate {
  Id?: string;
  Name: string;
  Type: EmailTemplateType;
  Subject: string;
  Body: string;
  IsDefault?: boolean;
  IsActive?: boolean;
  CreatedAt?: string;
  UpdatedAt?: string;
}

// Reminder Settings types
export interface ReminderSetting {
  Id?: string;
  Name: string;
  ReminderDays: number;
  TemplateId?: string | null;
  TemplateName?: string;
  IsEnabled: boolean;
  SendTime?: string;
  CooldownDays: number;
  MaxReminders: number;
  CreatedAt?: string;
  UpdatedAt?: string;
}

// Overdue Invoice types
export interface OverdueInvoice {
  InvoiceId: string;
  InvoiceNumber: string;
  CustomerId: string;
  CustomerName: string;
  CustomerEmail: string;
  IssueDate: string;
  DueDate: string;
  TotalAmount: number;
  AmountDue: number;
  DaysOverdue: number;
  Status: string;
  RemindersSent: number;
  LastReminderDate?: string;
}

// Email Settings API
export const emailSettingsApi = {
  get: async (): Promise<EmailSettingsResponse> => {
    const response = await emailApi.get('/settings');
    return response.data;
  },

  save: async (settings: EmailSettings & { SmtpPassword?: string }): Promise<{ success: boolean; message: string }> => {
    const response = await emailApi.post('/settings', settings);
    return response.data;
  },

  test: async (): Promise<{ success: boolean; message?: string; error?: string }> => {
    const response = await emailApi.post('/settings/test');
    return response.data;
  },
};

// Email Send API
export const emailSendApi = {
  sendInvoice: async (invoiceId: string, data: SendEmailRequest): Promise<{ success: boolean; message: string; logId: string }> => {
    const response = await emailApi.post(`/send/invoice/${invoiceId}`, data);
    return response.data;
  },

  sendStatement: async (customerId: string, data: SendStatementRequest): Promise<{ success: boolean; message: string; logId: string }> => {
    const response = await emailApi.post(`/send/statement/${customerId}`, data);
    return response.data;
  },

  getLogs: async (invoiceId: string): Promise<{ logs: EmailLog[] }> => {
    const response = await emailApi.get(`/logs/${invoiceId}`);
    return response.data;
  },
};

// Template variable replacement helper
export function replaceTemplateVariables(
  template: string,
  variables: {
    CustomerName?: string;
    InvoiceNumber?: string;
    InvoiceDate?: string;
    IssueDate?: string;
    DueDate?: string;
    TotalAmount?: string;
    TotalDue?: string;
    AmountDue?: string;
    DaysOverdue?: string;
    PaymentLink?: string;
    StatementPeriod?: string;
    CompanyName?: string;
    CompanyEmail?: string;
    CompanyPhone?: string;
    AmountPaid?: string;
    PaymentDate?: string;
    PaymentMethod?: string;
    AccountBalance?: string;
  }
): string {
  let result = template;
  Object.entries(variables).forEach(([key, value]) => {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
  });
  return result;
}

// ============================================================================
// Email Templates API
// ============================================================================

export const emailTemplatesApi = {
  getAll: async (type?: EmailTemplateType): Promise<{ templates: EmailTemplate[] }> => {
    const params = type ? `?type=${type}` : '';
    const response = await emailApi.get(`/templates${params}`);
    return response.data;
  },

  getById: async (id: string): Promise<{ template: EmailTemplate }> => {
    const response = await emailApi.get(`/templates/${id}`);
    return response.data;
  },

  save: async (template: EmailTemplate): Promise<{ success: boolean; id: string }> => {
    const response = await emailApi.post('/templates', template);
    return response.data;
  },

  update: async (id: string, template: EmailTemplate): Promise<{ success: boolean; id: string }> => {
    const response = await emailApi.put(`/templates/${id}`, template);
    return response.data;
  },

  delete: async (id: string): Promise<{ success: boolean }> => {
    const response = await emailApi.delete(`/templates/${id}`);
    return response.data;
  },

  preview: async (
    subject: string,
    body: string,
    sampleData?: Record<string, string>
  ): Promise<{ subject: string; body: string }> => {
    const response = await emailApi.post('/templates/preview', { Subject: subject, Body: body, sampleData });
    return response.data;
  },
};

// ============================================================================
// Reminder Settings API
// ============================================================================

export const reminderSettingsApi = {
  getAll: async (): Promise<{ settings: ReminderSetting[] }> => {
    const response = await emailApi.get('/reminders');
    return response.data;
  },

  getById: async (id: string): Promise<{ setting: ReminderSetting }> => {
    const response = await emailApi.get(`/reminders/${id}`);
    return response.data;
  },

  save: async (setting: ReminderSetting): Promise<{ success: boolean; id: string }> => {
    const response = await emailApi.post('/reminders', setting);
    return response.data;
  },

  update: async (id: string, setting: ReminderSetting): Promise<{ success: boolean; id: string }> => {
    const response = await emailApi.put(`/reminders/${id}`, setting);
    return response.data;
  },

  delete: async (id: string): Promise<{ success: boolean }> => {
    const response = await emailApi.delete(`/reminders/${id}`);
    return response.data;
  },
};

// ============================================================================
// Overdue Invoices & Reminders API
// ============================================================================

export const overdueInvoicesApi = {
  getAll: async (): Promise<{ invoices: OverdueInvoice[] }> => {
    const response = await emailApi.get('/overdue-invoices');
    return response.data;
  },

  sendReminder: async (
    invoiceId: string,
    data: {
      recipientEmail?: string;
      recipientName?: string;
      templateId?: string;
      customSubject?: string;
      customBody?: string;
      companySettings?: {
        name?: string;
        email?: string;
        phone?: string;
      };
    }
  ): Promise<{ success: boolean; message: string; logId: string }> => {
    const response = await emailApi.post(`/send/reminder/${invoiceId}`, data);
    return response.data;
  },

  processReminders: async (): Promise<{
    success: boolean;
    message: string;
    processed: number;
    sent: number;
    skipped: number;
    failed: number;
    errors: Array<{ invoiceId: string; error: string }>;
  }> => {
    const response = await emailApi.post('/process-reminders');
    return response.data;
  },
};

export default emailApi;
