import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { getEmailSettings, saveEmailSettings, updateTestResult, getEmailLogs, createEmailLog, updateEmailLog } from './services/dbService.js';
import { encrypt, decrypt } from './services/encryptionService.js';
import { sendEmail, testConnection } from './services/emailService.js';
import { generateInvoicePdf } from './services/pdfService.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const DAB_API_URL = process.env.DAB_API_URL || 'http://localhost:5000/api';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';

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

        const decryptedPassword = decrypt(settings.SmtpPasswordEncrypted);

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
        const invoiceId = req.params.id;
        const { recipientEmail, recipientName, subject, body, companySettings } = req.body;

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
            const decryptedPassword = decrypt(settings.SmtpPasswordEncrypted);

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

const PORT = process.env.EMAIL_API_PORT || 7073;
app.listen(PORT, () => {
    console.log(`Email API running on http://localhost:${PORT}`);
});
