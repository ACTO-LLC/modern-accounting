import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { validate as uuidValidate } from 'uuid';
import {
    getEmailSettings,
    saveEmailSettings,
    updateTestResult,
    getEmailLogs,
    createEmailLog,
    updateEmailLog,
    // Email Templates
    getEmailTemplates,
    getEmailTemplateById,
    saveEmailTemplate,
    deleteEmailTemplate,
    // Reminder Settings
    getReminderSettings,
    getReminderSettingById,
    saveReminderSetting,
    deleteReminderSetting,
    // Overdue Invoices
    getOverdueInvoicesForReminder,
    getInvoicesForReminderSetting,
    createReminderLog,
    getLastReminderForInvoice,
    getReminderCountForInvoice
} from './services/dbService.js';
import { encrypt, decrypt } from './services/encryptionService.js';
import { sendEmail, testConnection } from './services/emailService.js';
import { generateInvoicePdf } from './services/pdfService.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const DAB_API_URL = process.env.DAB_API_URL || 'http://localhost:5000/api';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';

// Helper to validate UUID before using in OData queries (prevents SQL injection)
function validateUuid(id, paramName = 'id') {
    if (!id || !uuidValidate(id)) {
        const error = new Error(`Invalid ${paramName}: must be a valid UUID`);
        error.statusCode = 400;
        throw error;
    }
    return id;
}

// Helper to safely decrypt passwords with error handling
function safeDecrypt(encryptedValue, context = 'password') {
    if (!encryptedValue) {
        throw new Error(`No encrypted ${context} found`);
    }
    try {
        return decrypt(encryptedValue);
    } catch (error) {
        console.error(`Failed to decrypt ${context}:`, error.message);
        throw new Error(`Failed to decrypt ${context}. The encryption key may have changed.`);
    }
}

// Health check
app.get('/email-api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get email settings (without password)
app.get('/email-api/settings', async (req, res) => {
    try {
        const settings = await getEmailSettings();
        if (!settings) {
            return res.json({ configured: false });
        }
        // Don't return the encrypted password
        const { SmtpPasswordEncrypted, ...safeSettings } = settings;
        res.json({ configured: true, settings: safeSettings });
    } catch (error) {
        console.error('Error getting settings:', error);
        res.status(500).json({ error: 'Failed to get email settings', details: error.message });
    }
});

// Save email settings
app.post('/email-api/settings', async (req, res) => {
    try {
        const { SmtpPassword, ...otherSettings } = req.body;

        // Encrypt the password if provided
        let encryptedPassword = null;
        if (SmtpPassword) {
            encryptedPassword = encrypt(SmtpPassword);
        }

        await saveEmailSettings({
            ...otherSettings,
            SmtpPasswordEncrypted: encryptedPassword
        });

        res.json({ success: true, message: 'Email settings saved' });
    } catch (error) {
        console.error('Error saving settings:', error);
        res.status(500).json({ error: 'Failed to save email settings', details: error.message });
    }
});

// Test email connection
app.post('/email-api/settings/test', async (req, res) => {
    try {
        const settings = await getEmailSettings();
        if (!settings || !settings.SmtpHost) {
            return res.status(400).json({ success: false, error: 'Email settings not configured' });
        }

        const decryptedPassword = safeDecrypt(settings.SmtpPasswordEncrypted, 'SMTP password');

        const result = await testConnection({
            host: settings.SmtpHost,
            port: settings.SmtpPort,
            secure: settings.SmtpSecure,
            auth: {
                user: settings.SmtpUsername,
                pass: decryptedPassword
            }
        });

        // Update test result in database
        await updateTestResult(settings.Id, result.success, result.message || result.error);

        if (result.success) {
            res.json({ success: true, message: 'Connection successful' });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('Error testing connection:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Send invoice email
app.post('/email-api/send/invoice/:id', async (req, res) => {
    try {
        const invoiceId = validateUuid(req.params.id, 'invoiceId');
        const { recipientEmail, recipientName, subject, body, companySettings } = req.body;

        // Validate email format
        if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
            return res.status(400).json({ success: false, error: 'Invalid recipient email address' });
        }

        // Get email settings
        const settings = await getEmailSettings();
        if (!settings || !settings.SmtpHost) {
            return res.status(400).json({ success: false, error: 'Email settings not configured' });
        }

        // Create email log entry
        const logId = await createEmailLog({
            InvoiceId: invoiceId,
            RecipientEmail: recipientEmail,
            RecipientName: recipientName,
            Subject: subject,
            Body: body,
            Status: 'Pending'
        });

        try {
            // Generate PDF
            console.log(`Generating PDF for invoice ${invoiceId}...`);
            const pdfBuffer = await generateInvoicePdf(invoiceId, APP_BASE_URL);

            // Get invoice number for filename
            const invoiceResponse = await fetch(`${DAB_API_URL}/invoices?$filter=Id eq '${invoiceId}'`);
            const invoiceData = await invoiceResponse.json();
            const invoice = invoiceData.value?.[0];
            const invoiceNumber = invoice?.InvoiceNumber || invoiceId;

            // Decrypt password
            const decryptedPassword = safeDecrypt(settings.SmtpPasswordEncrypted, 'SMTP password');

            // Send email
            console.log(`Sending email to ${recipientEmail}...`);
            await sendEmail({
                host: settings.SmtpHost,
                port: settings.SmtpPort,
                secure: settings.SmtpSecure,
                auth: {
                    user: settings.SmtpUsername,
                    pass: decryptedPassword
                },
                from: {
                    name: settings.FromName,
                    email: settings.FromEmail
                },
                replyTo: settings.ReplyToEmail,
                to: recipientEmail,
                subject: subject,
                text: body,
                attachments: [{
                    filename: `Invoice-${invoiceNumber}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }]
            });

            // Update log as sent
            await updateEmailLog(logId, 'Sent', null);

            res.json({ success: true, message: 'Email sent successfully', logId });
        } catch (sendError) {
            // Update log as failed
            await updateEmailLog(logId, 'Failed', sendError.message);
            throw sendError;
        }
    } catch (error) {
        console.error('Error sending invoice email:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get email logs for an invoice
app.get('/email-api/logs/:invoiceId', async (req, res) => {
    try {
        const logs = await getEmailLogs(req.params.invoiceId);
        res.json({ logs });
    } catch (error) {
        console.error('Error getting email logs:', error);
        res.status(500).json({ error: 'Failed to get email logs', details: error.message });
    }
});

// Resend a failed email
app.post('/email-api/resend/:logId', async (req, res) => {
    try {
        // This would re-fetch the log entry and resend
        // For now, client should use the send endpoint with same data
        res.status(501).json({ error: 'Use /email-api/send/invoice/:id to resend' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// Email Templates API
// ============================================================================

// Get all templates (optionally filtered by type)
app.get('/email-api/templates', async (req, res) => {
    try {
        const { type } = req.query;
        const templates = await getEmailTemplates(type);
        res.json({ templates });
    } catch (error) {
        console.error('Error getting templates:', error);
        res.status(500).json({ error: 'Failed to get templates', details: error.message });
    }
});

// Get template by ID
app.get('/email-api/templates/:id', async (req, res) => {
    try {
        const template = await getEmailTemplateById(req.params.id);
        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }
        res.json({ template });
    } catch (error) {
        console.error('Error getting template:', error);
        res.status(500).json({ error: 'Failed to get template', details: error.message });
    }
});

// Create or update template
app.post('/email-api/templates', async (req, res) => {
    try {
        const { Name, Type, Subject, Body, IsDefault, IsActive, Id } = req.body;

        if (!Name || !Type || !Subject || !Body) {
            return res.status(400).json({ error: 'Name, Type, Subject, and Body are required' });
        }

        const validTypes = ['InvoiceReminder', 'InvoiceDelivery', 'PaymentReceipt', 'StatementDelivery'];
        if (!validTypes.includes(Type)) {
            return res.status(400).json({ error: `Type must be one of: ${validTypes.join(', ')}` });
        }

        const templateId = await saveEmailTemplate({ Id, Name, Type, Subject, Body, IsDefault, IsActive });
        res.json({ success: true, id: templateId });
    } catch (error) {
        console.error('Error saving template:', error);
        res.status(500).json({ error: 'Failed to save template', details: error.message });
    }
});

// Update template
app.put('/email-api/templates/:id', async (req, res) => {
    try {
        const { Name, Type, Subject, Body, IsDefault, IsActive } = req.body;

        if (!Name || !Type || !Subject || !Body) {
            return res.status(400).json({ error: 'Name, Type, Subject, and Body are required' });
        }

        const templateId = await saveEmailTemplate({ Id: req.params.id, Name, Type, Subject, Body, IsDefault, IsActive });
        res.json({ success: true, id: templateId });
    } catch (error) {
        console.error('Error updating template:', error);
        res.status(500).json({ error: 'Failed to update template', details: error.message });
    }
});

// Delete template (soft delete)
app.delete('/email-api/templates/:id', async (req, res) => {
    try {
        await deleteEmailTemplate(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({ error: 'Failed to delete template', details: error.message });
    }
});

// Preview template with sample data
app.post('/email-api/templates/preview', async (req, res) => {
    try {
        const { Subject, Body, sampleData } = req.body;

        const defaultSampleData = {
            CustomerName: 'John Smith',
            InvoiceNumber: 'INV-001',
            InvoiceDate: new Date().toLocaleDateString(),
            DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(),
            AmountDue: '$1,500.00',
            DaysOverdue: '7',
            PaymentLink: 'https://pay.example.com/invoice/123',
            CompanyName: 'Your Company',
            CompanyEmail: 'billing@example.com',
            CompanyPhone: '(555) 123-4567',
            AmountPaid: '$1,500.00',
            PaymentDate: new Date().toLocaleDateString(),
            PaymentMethod: 'Credit Card',
            AccountBalance: '$0.00'
        };

        const data = { ...defaultSampleData, ...sampleData };

        // Replace template variables
        let previewSubject = Subject || '';
        let previewBody = Body || '';

        Object.entries(data).forEach(([key, value]) => {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            previewSubject = previewSubject.replace(regex, value);
            previewBody = previewBody.replace(regex, value);
        });

        res.json({ subject: previewSubject, body: previewBody });
    } catch (error) {
        console.error('Error previewing template:', error);
        res.status(500).json({ error: 'Failed to preview template', details: error.message });
    }
});

// ============================================================================
// Reminder Settings API
// ============================================================================

// Get all reminder settings
app.get('/email-api/reminders', async (req, res) => {
    try {
        const settings = await getReminderSettings();
        res.json({ settings });
    } catch (error) {
        console.error('Error getting reminder settings:', error);
        res.status(500).json({ error: 'Failed to get reminder settings', details: error.message });
    }
});

// Get reminder setting by ID
app.get('/email-api/reminders/:id', async (req, res) => {
    try {
        const setting = await getReminderSettingById(req.params.id);
        if (!setting) {
            return res.status(404).json({ error: 'Reminder setting not found' });
        }
        res.json({ setting });
    } catch (error) {
        console.error('Error getting reminder setting:', error);
        res.status(500).json({ error: 'Failed to get reminder setting', details: error.message });
    }
});

// Create or update reminder setting
app.post('/email-api/reminders', async (req, res) => {
    try {
        const { Name, ReminderDays, TemplateId, IsEnabled, SendTime, CooldownDays, MaxReminders, Id } = req.body;

        if (!Name || ReminderDays === undefined) {
            return res.status(400).json({ error: 'Name and ReminderDays are required' });
        }

        const settingId = await saveReminderSetting({
            Id,
            Name,
            ReminderDays,
            TemplateId,
            IsEnabled,
            SendTime,
            CooldownDays,
            MaxReminders
        });
        res.json({ success: true, id: settingId });
    } catch (error) {
        console.error('Error saving reminder setting:', error);
        res.status(500).json({ error: 'Failed to save reminder setting', details: error.message });
    }
});

// Update reminder setting
app.put('/email-api/reminders/:id', async (req, res) => {
    try {
        const { Name, ReminderDays, TemplateId, IsEnabled, SendTime, CooldownDays, MaxReminders } = req.body;

        if (!Name || ReminderDays === undefined) {
            return res.status(400).json({ error: 'Name and ReminderDays are required' });
        }

        const settingId = await saveReminderSetting({
            Id: req.params.id,
            Name,
            ReminderDays,
            TemplateId,
            IsEnabled,
            SendTime,
            CooldownDays,
            MaxReminders
        });
        res.json({ success: true, id: settingId });
    } catch (error) {
        console.error('Error updating reminder setting:', error);
        res.status(500).json({ error: 'Failed to update reminder setting', details: error.message });
    }
});

// Delete reminder setting
app.delete('/email-api/reminders/:id', async (req, res) => {
    try {
        await deleteReminderSetting(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting reminder setting:', error);
        res.status(500).json({ error: 'Failed to delete reminder setting', details: error.message });
    }
});

// ============================================================================
// Overdue Invoices & Manual Reminder API
// ============================================================================

// Get overdue invoices for reminder
app.get('/email-api/overdue-invoices', async (req, res) => {
    try {
        const invoices = await getOverdueInvoicesForReminder();
        res.json({ invoices });
    } catch (error) {
        console.error('Error getting overdue invoices:', error);
        res.status(500).json({ error: 'Failed to get overdue invoices', details: error.message });
    }
});

// Send manual reminder for a specific invoice
app.post('/email-api/send/reminder/:invoiceId', async (req, res) => {
    try {
        const invoiceId = validateUuid(req.params.invoiceId, 'invoiceId');
        const { recipientEmail, recipientName, templateId, customSubject, customBody, companySettings } = req.body;

        // Get email settings
        const settings = await getEmailSettings();
        if (!settings || !settings.SmtpHost) {
            return res.status(400).json({ success: false, error: 'Email settings not configured' });
        }

        // Get template if specified
        let subject = customSubject;
        let body = customBody;

        if (templateId && (!subject || !body)) {
            const template = await getEmailTemplateById(templateId);
            if (template) {
                subject = subject || template.Subject;
                body = body || template.Body;
            }
        }

        if (!subject || !body) {
            return res.status(400).json({ error: 'Subject and body are required (either provide customSubject/customBody or a valid templateId)' });
        }

        // Get invoice details for template variables
        const invoiceResponse = await fetch(`${DAB_API_URL}/invoices?$filter=Id eq '${invoiceId}'`);
        const invoiceData = await invoiceResponse.json();
        const invoice = invoiceData.value?.[0];

        if (!invoice) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        // Get customer details
        const customerResponse = await fetch(`${DAB_API_URL}/customers?$filter=Id eq '${invoice.CustomerId}'`);
        const customerData = await customerResponse.json();
        const customer = customerData.value?.[0];

        // Calculate days overdue
        const daysOverdue = Math.max(0, Math.floor((Date.now() - new Date(invoice.DueDate).getTime()) / (1000 * 60 * 60 * 24)));

        // Build template variables
        const templateVars = {
            CustomerName: customer?.Name || recipientName || '',
            InvoiceNumber: invoice.InvoiceNumber,
            InvoiceDate: new Date(invoice.IssueDate).toLocaleDateString(),
            DueDate: new Date(invoice.DueDate).toLocaleDateString(),
            AmountDue: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(invoice.TotalAmount),
            DaysOverdue: daysOverdue.toString(),
            PaymentLink: `${APP_BASE_URL}/pay/${invoiceId}`,
            CompanyName: companySettings?.name || '',
            CompanyEmail: companySettings?.email || '',
            CompanyPhone: companySettings?.phone || ''
        };

        // Replace template variables
        Object.entries(templateVars).forEach(([key, value]) => {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            subject = subject.replace(regex, value);
            body = body.replace(regex, value);
        });

        // Create email log entry
        const logId = await createReminderLog({
            InvoiceId: invoiceId,
            RecipientEmail: recipientEmail || customer?.Email,
            RecipientName: recipientName || customer?.Name,
            Subject: subject,
            Body: body,
            Status: 'Pending',
            TemplateId: templateId || null,
            IsAutomatic: false
        });

        // Validate email before sending
        const targetEmail = recipientEmail || customer?.Email;
        if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
            return res.status(400).json({ success: false, error: 'Invalid recipient email address' });
        }

        try {
            // Decrypt password
            const decryptedPassword = safeDecrypt(settings.SmtpPasswordEncrypted, 'SMTP password');

            // Generate PDF attachment
            console.log(`Generating PDF for reminder - invoice ${invoiceId}...`);
            const pdfBuffer = await generateInvoicePdf(invoiceId, APP_BASE_URL);

            // Send email
            console.log(`Sending reminder to ${recipientEmail || customer?.Email}...`);
            await sendEmail({
                host: settings.SmtpHost,
                port: settings.SmtpPort,
                secure: settings.SmtpSecure,
                auth: {
                    user: settings.SmtpUsername,
                    pass: decryptedPassword
                },
                from: {
                    name: settings.FromName,
                    email: settings.FromEmail
                },
                replyTo: settings.ReplyToEmail,
                to: recipientEmail || customer?.Email,
                subject: subject,
                text: body,
                attachments: [{
                    filename: `Invoice-${invoice.InvoiceNumber}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }]
            });

            // Update log as sent
            await updateEmailLog(logId, 'Sent', null);

            res.json({ success: true, message: 'Reminder sent successfully', logId });
        } catch (sendError) {
            await updateEmailLog(logId, 'Failed', sendError.message);
            throw sendError;
        }
    } catch (error) {
        console.error('Error sending reminder:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// Batch Reminder Processing (for scheduled jobs)
// ============================================================================

// Process all pending reminders (called by scheduler)
app.post('/email-api/process-reminders', async (req, res) => {
    try {
        const results = {
            processed: 0,
            sent: 0,
            skipped: 0,
            failed: 0,
            errors: []
        };

        // Get enabled reminder settings
        const settings = await getReminderSettings();
        const enabledSettings = settings.filter(s => s.IsEnabled);

        if (enabledSettings.length === 0) {
            return res.json({ message: 'No enabled reminder settings', ...results });
        }

        // Get email settings
        const emailSettings = await getEmailSettings();
        if (!emailSettings || !emailSettings.SmtpHost) {
            return res.status(400).json({ error: 'Email settings not configured' });
        }

        // Process each reminder setting
        for (const reminderSetting of enabledSettings) {
            const invoices = await getInvoicesForReminderSetting(reminderSetting.ReminderDays);

            for (const invoice of invoices) {
                results.processed++;

                try {
                    // Check cooldown
                    const lastReminder = await getLastReminderForInvoice(invoice.InvoiceId, reminderSetting.Id);
                    if (lastReminder) {
                        const daysSinceLastReminder = Math.floor(
                            (Date.now() - new Date(lastReminder.CreatedAt).getTime()) / (1000 * 60 * 60 * 24)
                        );
                        if (daysSinceLastReminder < reminderSetting.CooldownDays) {
                            results.skipped++;
                            continue;
                        }
                    }

                    // Check max reminders
                    if (reminderSetting.MaxReminders > 0) {
                        const reminderCount = await getReminderCountForInvoice(invoice.InvoiceId, reminderSetting.Id);
                        if (reminderCount >= reminderSetting.MaxReminders) {
                            results.skipped++;
                            continue;
                        }
                    }

                    // Get template
                    const template = reminderSetting.TemplateId
                        ? await getEmailTemplateById(reminderSetting.TemplateId)
                        : null;

                    if (!template) {
                        results.skipped++;
                        results.errors.push({ invoiceId: invoice.InvoiceId, error: 'No template configured' });
                        continue;
                    }

                    // Build template variables
                    const templateVars = {
                        CustomerName: invoice.CustomerName || '',
                        InvoiceNumber: invoice.InvoiceNumber,
                        InvoiceDate: new Date(invoice.IssueDate).toLocaleDateString(),
                        DueDate: new Date(invoice.DueDate).toLocaleDateString(),
                        AmountDue: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(invoice.AmountDue),
                        DaysOverdue: invoice.DaysOverdue.toString(),
                        PaymentLink: `${APP_BASE_URL}/pay/${invoice.InvoiceId}`,
                        CompanyName: emailSettings.FromName || '',
                        CompanyEmail: emailSettings.FromEmail || '',
                        CompanyPhone: ''
                    };

                    // Replace template variables
                    let subject = template.Subject;
                    let body = template.Body;
                    Object.entries(templateVars).forEach(([key, value]) => {
                        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
                        subject = subject.replace(regex, value);
                        body = body.replace(regex, value);
                    });

                    // Create log entry
                    const logId = await createReminderLog({
                        InvoiceId: invoice.InvoiceId,
                        RecipientEmail: invoice.CustomerEmail,
                        RecipientName: invoice.CustomerName,
                        Subject: subject,
                        Body: body,
                        Status: 'Pending',
                        ReminderSettingId: reminderSetting.Id,
                        TemplateId: template.Id,
                        IsAutomatic: true
                    });

                    // Validate email before sending
                    if (!invoice.CustomerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoice.CustomerEmail)) {
                        results.skipped++;
                        results.errors.push({ invoiceId: invoice.InvoiceId, error: 'Invalid customer email address' });
                        continue;
                    }

                    try {
                        // Generate PDF
                        const pdfBuffer = await generateInvoicePdf(invoice.InvoiceId, APP_BASE_URL);

                        // Send email
                        const decryptedPassword = safeDecrypt(emailSettings.SmtpPasswordEncrypted, 'SMTP password');
                        await sendEmail({
                            host: emailSettings.SmtpHost,
                            port: emailSettings.SmtpPort,
                            secure: emailSettings.SmtpSecure,
                            auth: {
                                user: emailSettings.SmtpUsername,
                                pass: decryptedPassword
                            },
                            from: {
                                name: emailSettings.FromName,
                                email: emailSettings.FromEmail
                            },
                            replyTo: emailSettings.ReplyToEmail,
                            to: invoice.CustomerEmail,
                            subject: subject,
                            text: body,
                            attachments: [{
                                filename: `Invoice-${invoice.InvoiceNumber}.pdf`,
                                content: pdfBuffer,
                                contentType: 'application/pdf'
                            }]
                        });

                        await updateEmailLog(logId, 'Sent', null);
                        results.sent++;
                    } catch (sendError) {
                        await updateEmailLog(logId, 'Failed', sendError.message);
                        results.failed++;
                        results.errors.push({ invoiceId: invoice.InvoiceId, error: sendError.message });
                    }
                } catch (invoiceError) {
                    results.failed++;
                    results.errors.push({ invoiceId: invoice.InvoiceId, error: invoiceError.message });
                }
            }
        }

        res.json({
            success: true,
            message: `Processed ${results.processed} invoices: ${results.sent} sent, ${results.skipped} skipped, ${results.failed} failed`,
            ...results
        });
    } catch (error) {
        console.error('Error processing reminders:', error);
        res.status(500).json({ error: 'Failed to process reminders', details: error.message });
    }
});

const PORT = process.env.EMAIL_API_PORT || 7073;
app.listen(PORT, () => {
    console.log(`Email API running on http://localhost:${PORT}`);
});
