/**
 * Email Reminder Scheduler Service
 *
 * This service handles automatic processing of overdue invoice reminders.
 * It can be run as a standalone cron job or integrated with a task scheduler.
 *
 * Usage:
 *   - As standalone: node reminderScheduler.js
 *   - As cron job: 0 9 * * * node /path/to/reminderScheduler.js
 *   - Or call processReminders() from another service
 */

import dotenv from 'dotenv';
import {
    getReminderSettings,
    getInvoicesForReminderSetting,
    getEmailTemplateById,
    getLastReminderForInvoice,
    getReminderCountForInvoice,
    createReminderLog,
    updateEmailLog,
    getEmailSettings,
} from './dbService.js';
import { decrypt } from './encryptionService.js';
import { sendEmail } from './emailService.js';
import { generateInvoicePdf } from './pdfService.js';

dotenv.config();

const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';

/**
 * Process all pending reminders based on configured settings
 * @returns {Promise<Object>} Results summary
 */
export async function processReminders() {
    const results = {
        processed: 0,
        sent: 0,
        skipped: 0,
        failed: 0,
        errors: [],
        startTime: new Date().toISOString(),
    };

    try {
        console.log('[Reminder Scheduler] Starting reminder processing...');

        // Get enabled reminder settings
        const settings = await getReminderSettings();
        const enabledSettings = settings.filter(s => s.IsEnabled);

        if (enabledSettings.length === 0) {
            console.log('[Reminder Scheduler] No enabled reminder settings found');
            results.endTime = new Date().toISOString();
            return results;
        }

        console.log(`[Reminder Scheduler] Found ${enabledSettings.length} enabled reminder setting(s)`);

        // Get email settings
        const emailSettings = await getEmailSettings();
        if (!emailSettings || !emailSettings.SmtpHost) {
            console.error('[Reminder Scheduler] Email settings not configured');
            results.errors.push({ error: 'Email settings not configured' });
            results.endTime = new Date().toISOString();
            return results;
        }

        // Process each reminder setting
        for (const reminderSetting of enabledSettings) {
            console.log(`[Reminder Scheduler] Processing: ${reminderSetting.Name} (${reminderSetting.ReminderDays} days)`);

            const invoices = await getInvoicesForReminderSetting(reminderSetting.ReminderDays);
            console.log(`[Reminder Scheduler] Found ${invoices.length} invoice(s) matching criteria`);

            for (const invoice of invoices) {
                results.processed++;

                try {
                    // Check cooldown period
                    const lastReminder = await getLastReminderForInvoice(invoice.InvoiceId, reminderSetting.Id);
                    if (lastReminder) {
                        const daysSinceLastReminder = Math.floor(
                            (Date.now() - new Date(lastReminder.CreatedAt).getTime()) / (1000 * 60 * 60 * 24)
                        );
                        if (daysSinceLastReminder < reminderSetting.CooldownDays) {
                            console.log(`[Reminder Scheduler] Skipping ${invoice.InvoiceNumber}: cooldown (${daysSinceLastReminder}/${reminderSetting.CooldownDays} days)`);
                            results.skipped++;
                            continue;
                        }
                    }

                    // Check max reminders
                    if (reminderSetting.MaxReminders > 0) {
                        const reminderCount = await getReminderCountForInvoice(invoice.InvoiceId, reminderSetting.Id);
                        if (reminderCount >= reminderSetting.MaxReminders) {
                            console.log(`[Reminder Scheduler] Skipping ${invoice.InvoiceNumber}: max reminders reached (${reminderCount}/${reminderSetting.MaxReminders})`);
                            results.skipped++;
                            continue;
                        }
                    }

                    // Get template
                    const template = reminderSetting.TemplateId
                        ? await getEmailTemplateById(reminderSetting.TemplateId)
                        : null;

                    if (!template) {
                        console.warn(`[Reminder Scheduler] Skipping ${invoice.InvoiceNumber}: no template configured`);
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
                        CompanyPhone: '',
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
                        IsAutomatic: true,
                    });

                    try {
                        // Generate PDF
                        console.log(`[Reminder Scheduler] Generating PDF for ${invoice.InvoiceNumber}...`);
                        const pdfBuffer = await generateInvoicePdf(invoice.InvoiceId, APP_BASE_URL);

                        // Send email
                        console.log(`[Reminder Scheduler] Sending email to ${invoice.CustomerEmail}...`);
                        const decryptedPassword = decrypt(emailSettings.SmtpPasswordEncrypted);
                        await sendEmail({
                            host: emailSettings.SmtpHost,
                            port: emailSettings.SmtpPort,
                            secure: emailSettings.SmtpSecure,
                            auth: {
                                user: emailSettings.SmtpUsername,
                                pass: decryptedPassword,
                            },
                            from: {
                                name: emailSettings.FromName,
                                email: emailSettings.FromEmail,
                            },
                            replyTo: emailSettings.ReplyToEmail,
                            to: invoice.CustomerEmail,
                            subject: subject,
                            text: body,
                            attachments: [{
                                filename: `Invoice-${invoice.InvoiceNumber}.pdf`,
                                content: pdfBuffer,
                                contentType: 'application/pdf',
                            }],
                        });

                        await updateEmailLog(logId, 'Sent', null);
                        results.sent++;
                        console.log(`[Reminder Scheduler] Sent reminder for ${invoice.InvoiceNumber}`);
                    } catch (sendError) {
                        await updateEmailLog(logId, 'Failed', sendError.message);
                        results.failed++;
                        results.errors.push({ invoiceId: invoice.InvoiceId, invoiceNumber: invoice.InvoiceNumber, error: sendError.message });
                        console.error(`[Reminder Scheduler] Failed to send reminder for ${invoice.InvoiceNumber}:`, sendError.message);
                    }
                } catch (invoiceError) {
                    results.failed++;
                    results.errors.push({ invoiceId: invoice.InvoiceId, invoiceNumber: invoice.InvoiceNumber, error: invoiceError.message });
                    console.error(`[Reminder Scheduler] Error processing ${invoice.InvoiceNumber}:`, invoiceError.message);
                }
            }
        }

        results.endTime = new Date().toISOString();
        console.log(`[Reminder Scheduler] Completed: ${results.sent} sent, ${results.skipped} skipped, ${results.failed} failed`);
        return results;
    } catch (error) {
        console.error('[Reminder Scheduler] Fatal error:', error);
        results.errors.push({ error: error.message });
        results.endTime = new Date().toISOString();
        return results;
    }
}

// Run as standalone script if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log('[Reminder Scheduler] Running as standalone script...');
    processReminders()
        .then(results => {
            console.log('[Reminder Scheduler] Results:', JSON.stringify(results, null, 2));
            process.exit(results.failed > 0 ? 1 : 0);
        })
        .catch(error => {
            console.error('[Reminder Scheduler] Fatal error:', error);
            process.exit(1);
        });
}

export default { processReminders };
