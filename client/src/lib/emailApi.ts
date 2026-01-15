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
    IssueDate?: string;
    DueDate?: string;
    TotalAmount?: string;
    CompanyName?: string;
    CompanyEmail?: string;
    CompanyPhone?: string;
  }
): string {
  let result = template;
  Object.entries(variables).forEach(([key, value]) => {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
  });
  return result;
}

export default emailApi;
