import sql from 'mssql';
import crypto from 'crypto';

const connectionString = process.env.DATABASE_URL || process.env.DB_CONNECTION_STRING;

async function getConnection() {
    return await sql.connect(connectionString);
}

export async function getEmailSettings() {
    try {
        await getConnection();
        const result = await sql.query`
            SELECT TOP 1 * FROM EmailSettings WHERE IsActive = 1 OR SmtpHost != ''
            ORDER BY IsActive DESC, UpdatedAt DESC
        `;
        return result.recordset[0] || null;
    } catch (error) {
        console.error('Error getting email settings:', error);
        throw error;
    } catch (error) {
        throw error;
    }
}

export async function saveEmailSettings(settings) {
    try {
        await getConnection();

        // Check if settings already exist
        const existing = await sql.query`SELECT TOP 1 Id FROM EmailSettings`;

        if (existing.recordset.length > 0) {
            // Update existing
            const id = existing.recordset[0].Id;
            const request = new sql.Request();
            request.input('Id', sql.UniqueIdentifier, id);
            request.input('SmtpHost', sql.NVarChar, settings.SmtpHost);
            request.input('SmtpPort', sql.Int, settings.SmtpPort);
            request.input('SmtpSecure', sql.Bit, settings.SmtpSecure);
            request.input('SmtpUsername', sql.NVarChar, settings.SmtpUsername);
            request.input('FromEmail', sql.NVarChar, settings.FromEmail);
            request.input('FromName', sql.NVarChar, settings.FromName);
            request.input('ReplyToEmail', sql.NVarChar, settings.ReplyToEmail || null);
            request.input('EmailSubjectTemplate', sql.NVarChar, settings.EmailSubjectTemplate);
            request.input('EmailBodyTemplate', sql.NVarChar, settings.EmailBodyTemplate);
            request.input('IsActive', sql.Bit, 1);
            request.input('UpdatedAt', sql.DateTime2, new Date());

            let query = `
                UPDATE EmailSettings SET
                    SmtpHost = @SmtpHost,
                    SmtpPort = @SmtpPort,
                    SmtpSecure = @SmtpSecure,
                    SmtpUsername = @SmtpUsername,
                    FromEmail = @FromEmail,
                    FromName = @FromName,
                    ReplyToEmail = @ReplyToEmail,
                    EmailSubjectTemplate = @EmailSubjectTemplate,
                    EmailBodyTemplate = @EmailBodyTemplate,
                    IsActive = @IsActive,
                    UpdatedAt = @UpdatedAt
            `;

            // Only update password if provided
            if (settings.SmtpPasswordEncrypted) {
                request.input('SmtpPasswordEncrypted', sql.NVarChar, settings.SmtpPasswordEncrypted);
                query += `, SmtpPasswordEncrypted = @SmtpPasswordEncrypted`;
            }

            query += ` WHERE Id = @Id`;

            await request.query(query);
            return id;
        } else {
            // Insert new
            const newId = crypto.randomUUID();
            const request = new sql.Request();
            request.input('Id', sql.UniqueIdentifier, newId);
            request.input('SmtpHost', sql.NVarChar, settings.SmtpHost);
            request.input('SmtpPort', sql.Int, settings.SmtpPort);
            request.input('SmtpSecure', sql.Bit, settings.SmtpSecure);
            request.input('SmtpUsername', sql.NVarChar, settings.SmtpUsername);
            request.input('SmtpPasswordEncrypted', sql.NVarChar, settings.SmtpPasswordEncrypted || '');
            request.input('FromEmail', sql.NVarChar, settings.FromEmail);
            request.input('FromName', sql.NVarChar, settings.FromName);
            request.input('ReplyToEmail', sql.NVarChar, settings.ReplyToEmail || null);
            request.input('EmailSubjectTemplate', sql.NVarChar, settings.EmailSubjectTemplate);
            request.input('EmailBodyTemplate', sql.NVarChar, settings.EmailBodyTemplate);
            request.input('IsActive', sql.Bit, 1);

            await request.query(`
                INSERT INTO EmailSettings (
                    Id, SmtpHost, SmtpPort, SmtpSecure, SmtpUsername, SmtpPasswordEncrypted,
                    FromEmail, FromName, ReplyToEmail, EmailSubjectTemplate, EmailBodyTemplate, IsActive
                ) VALUES (
                    @Id, @SmtpHost, @SmtpPort, @SmtpSecure, @SmtpUsername, @SmtpPasswordEncrypted,
                    @FromEmail, @FromName, @ReplyToEmail, @EmailSubjectTemplate, @EmailBodyTemplate, @IsActive
                )
            `);
            return newId;
        }
    } catch (error) {
        console.error('Error saving email settings:', error);
        throw error;
    } catch (error) {
        throw error;
    }
}

export async function updateTestResult(settingsId, success, message) {
    try {
        await getConnection();
        const request = new sql.Request();
        request.input('Id', sql.UniqueIdentifier, settingsId);
        request.input('LastTestedAt', sql.DateTime2, new Date());
        request.input('LastTestedResult', sql.NVarChar, success ? 'Success' : `Failed: ${message}`);

        await request.query(`
            UPDATE EmailSettings
            SET LastTestedAt = @LastTestedAt, LastTestedResult = @LastTestedResult
            WHERE Id = @Id
        `);
    } catch (error) {
        console.error('Error updating test result:', error);
        throw error;
    } catch (error) {
        throw error;
    }
}

export async function createEmailLog(logData) {
    try {
        await getConnection();
        const logId = crypto.randomUUID();
        const request = new sql.Request();
        request.input('Id', sql.UniqueIdentifier, logId);
        request.input('InvoiceId', sql.UniqueIdentifier, logData.InvoiceId);
        request.input('RecipientEmail', sql.NVarChar, logData.RecipientEmail);
        request.input('RecipientName', sql.NVarChar, logData.RecipientName || null);
        request.input('Subject', sql.NVarChar, logData.Subject);
        request.input('Body', sql.NVarChar, logData.Body);
        request.input('Status', sql.NVarChar, logData.Status);

        await request.query(`
            INSERT INTO EmailLog (Id, InvoiceId, RecipientEmail, RecipientName, Subject, Body, Status)
            VALUES (@Id, @InvoiceId, @RecipientEmail, @RecipientName, @Subject, @Body, @Status)
        `);

        return logId;
    } catch (error) {
        console.error('Error creating email log:', error);
        throw error;
    } catch (error) {
        throw error;
    }
}

export async function updateEmailLog(logId, status, errorMessage) {
    try {
        await getConnection();
        const request = new sql.Request();
        request.input('Id', sql.UniqueIdentifier, logId);
        request.input('Status', sql.NVarChar, status);
        request.input('ErrorMessage', sql.NVarChar, errorMessage);
        request.input('SentAt', sql.DateTime2, status === 'Sent' ? new Date() : null);

        await request.query(`
            UPDATE EmailLog
            SET Status = @Status, ErrorMessage = @ErrorMessage, SentAt = @SentAt
            WHERE Id = @Id
        `);
    } catch (error) {
        console.error('Error updating email log:', error);
        throw error;
    } catch (error) {
        throw error;
    }
}

export async function getEmailLogs(invoiceId) {
    try {
        await getConnection();
        const request = new sql.Request();
        request.input('InvoiceId', sql.UniqueIdentifier, invoiceId);

        const result = await request.query(`
            SELECT Id, RecipientEmail, RecipientName, Subject, Status, ErrorMessage, SentAt, CreatedAt
            FROM EmailLog
            WHERE InvoiceId = @InvoiceId
            ORDER BY CreatedAt DESC
        `);

        return result.recordset;
    } catch (error) {
        console.error('Error getting email logs:', error);
        throw error;
    } catch (error) {
        throw error;
    }
}

// ============================================================================
// Email Templates
// ============================================================================

export async function getEmailTemplates(type = null) {
    try {
        await getConnection();
        const request = new sql.Request();

        let query = 'SELECT * FROM EmailTemplates WHERE IsActive = 1';
        if (type) {
            request.input('Type', sql.NVarChar, type);
            query += ' AND Type = @Type';
        }
        query += ' ORDER BY Type, IsDefault DESC, Name';

        const result = await request.query(query);
        return result.recordset;
    } catch (error) {
        console.error('Error getting email templates:', error);
        throw error;
    } catch (error) {
        throw error;
    }
}

export async function getEmailTemplateById(id) {
    try {
        await getConnection();
        const request = new sql.Request();
        request.input('Id', sql.UniqueIdentifier, id);

        const result = await request.query('SELECT * FROM EmailTemplates WHERE Id = @Id');
        return result.recordset[0] || null;
    } catch (error) {
        console.error('Error getting email template:', error);
        throw error;
    } catch (error) {
        throw error;
    }
}

export async function saveEmailTemplate(template) {
    try {
        await getConnection();
        const request = new sql.Request();

        if (template.Id) {
            // Update existing
            request.input('Id', sql.UniqueIdentifier, template.Id);
            request.input('Name', sql.NVarChar, template.Name);
            request.input('Type', sql.NVarChar, template.Type);
            request.input('Subject', sql.NVarChar, template.Subject);
            request.input('Body', sql.NVarChar, template.Body);
            request.input('IsDefault', sql.Bit, template.IsDefault || false);
            request.input('IsActive', sql.Bit, template.IsActive !== false);
            request.input('UpdatedAt', sql.DateTime2, new Date());

            // If setting as default, unset other defaults of same type
            if (template.IsDefault) {
                const unsetRequest = new sql.Request();
                unsetRequest.input('Type', sql.NVarChar, template.Type);
                unsetRequest.input('Id', sql.UniqueIdentifier, template.Id);
                await unsetRequest.query('UPDATE EmailTemplates SET IsDefault = 0 WHERE Type = @Type AND Id != @Id');
            }

            await request.query(`
                UPDATE EmailTemplates SET
                    Name = @Name,
                    Type = @Type,
                    Subject = @Subject,
                    Body = @Body,
                    IsDefault = @IsDefault,
                    IsActive = @IsActive,
                    UpdatedAt = @UpdatedAt
                WHERE Id = @Id
            `);
            return template.Id;
        } else {
            // Insert new
            const newId = crypto.randomUUID();
            request.input('Id', sql.UniqueIdentifier, newId);
            request.input('Name', sql.NVarChar, template.Name);
            request.input('Type', sql.NVarChar, template.Type);
            request.input('Subject', sql.NVarChar, template.Subject);
            request.input('Body', sql.NVarChar, template.Body);
            request.input('IsDefault', sql.Bit, template.IsDefault || false);
            request.input('IsActive', sql.Bit, template.IsActive !== false);

            // If setting as default, unset other defaults of same type
            if (template.IsDefault) {
                const unsetRequest = new sql.Request();
                unsetRequest.input('Type', sql.NVarChar, template.Type);
                await unsetRequest.query('UPDATE EmailTemplates SET IsDefault = 0 WHERE Type = @Type');
            }

            await request.query(`
                INSERT INTO EmailTemplates (Id, Name, Type, Subject, Body, IsDefault, IsActive)
                VALUES (@Id, @Name, @Type, @Subject, @Body, @IsDefault, @IsActive)
            `);
            return newId;
        }
    } catch (error) {
        console.error('Error saving email template:', error);
        throw error;
    } catch (error) {
        throw error;
    }
}

export async function deleteEmailTemplate(id) {
    try {
        await getConnection();
        const request = new sql.Request();
        request.input('Id', sql.UniqueIdentifier, id);

        // Soft delete by setting IsActive to 0
        await request.query('UPDATE EmailTemplates SET IsActive = 0, UpdatedAt = SYSDATETIME() WHERE Id = @Id');
    } catch (error) {
        console.error('Error deleting email template:', error);
        throw error;
    } catch (error) {
        throw error;
    }
}

// ============================================================================
// Email Reminder Settings
// ============================================================================

export async function getReminderSettings() {
    try {
        await getConnection();
        const result = await sql.query`
            SELECT rs.*, et.Name AS TemplateName
            FROM EmailReminderSettings rs
            LEFT JOIN EmailTemplates et ON rs.TemplateId = et.Id
            ORDER BY rs.ReminderDays
        `;
        return result.recordset;
    } catch (error) {
        console.error('Error getting reminder settings:', error);
        throw error;
    } catch (error) {
        throw error;
    }
}

export async function getReminderSettingById(id) {
    try {
        await getConnection();
        const request = new sql.Request();
        request.input('Id', sql.UniqueIdentifier, id);

        const result = await request.query(`
            SELECT rs.*, et.Name AS TemplateName
            FROM EmailReminderSettings rs
            LEFT JOIN EmailTemplates et ON rs.TemplateId = et.Id
            WHERE rs.Id = @Id
        `);
        return result.recordset[0] || null;
    } catch (error) {
        console.error('Error getting reminder setting:', error);
        throw error;
    } catch (error) {
        throw error;
    }
}

export async function saveReminderSetting(setting) {
    try {
        await getConnection();
        const request = new sql.Request();

        if (setting.Id) {
            // Update existing
            request.input('Id', sql.UniqueIdentifier, setting.Id);
            request.input('Name', sql.NVarChar, setting.Name);
            request.input('ReminderDays', sql.Int, setting.ReminderDays);
            request.input('TemplateId', sql.UniqueIdentifier, setting.TemplateId || null);
            request.input('IsEnabled', sql.Bit, setting.IsEnabled !== false);
            request.input('SendTime', sql.NVarChar, setting.SendTime || '09:00:00');
            request.input('CooldownDays', sql.Int, setting.CooldownDays || 7);
            request.input('MaxReminders', sql.Int, setting.MaxReminders || 3);
            request.input('UpdatedAt', sql.DateTime2, new Date());

            await request.query(`
                UPDATE EmailReminderSettings SET
                    Name = @Name,
                    ReminderDays = @ReminderDays,
                    TemplateId = @TemplateId,
                    IsEnabled = @IsEnabled,
                    SendTime = @SendTime,
                    CooldownDays = @CooldownDays,
                    MaxReminders = @MaxReminders,
                    UpdatedAt = @UpdatedAt
                WHERE Id = @Id
            `);
            return setting.Id;
        } else {
            // Insert new
            const newId = crypto.randomUUID();
            request.input('Id', sql.UniqueIdentifier, newId);
            request.input('Name', sql.NVarChar, setting.Name);
            request.input('ReminderDays', sql.Int, setting.ReminderDays);
            request.input('TemplateId', sql.UniqueIdentifier, setting.TemplateId || null);
            request.input('IsEnabled', sql.Bit, setting.IsEnabled !== false);
            request.input('SendTime', sql.NVarChar, setting.SendTime || '09:00:00');
            request.input('CooldownDays', sql.Int, setting.CooldownDays || 7);
            request.input('MaxReminders', sql.Int, setting.MaxReminders || 3);

            await request.query(`
                INSERT INTO EmailReminderSettings (Id, Name, ReminderDays, TemplateId, IsEnabled, SendTime, CooldownDays, MaxReminders)
                VALUES (@Id, @Name, @ReminderDays, @TemplateId, @IsEnabled, @SendTime, @CooldownDays, @MaxReminders)
            `);
            return newId;
        }
    } catch (error) {
        console.error('Error saving reminder setting:', error);
        throw error;
    } catch (error) {
        throw error;
    }
}

export async function deleteReminderSetting(id) {
    try {
        await getConnection();
        const request = new sql.Request();
        request.input('Id', sql.UniqueIdentifier, id);

        await request.query('DELETE FROM EmailReminderSettings WHERE Id = @Id');
    } catch (error) {
        console.error('Error deleting reminder setting:', error);
        throw error;
    } catch (error) {
        throw error;
    }
}

// ============================================================================
// Overdue Invoices and Reminder Processing
// ============================================================================

export async function getOverdueInvoicesForReminder() {
    try {
        await getConnection();
        const result = await sql.query`
            SELECT * FROM v_OverdueInvoicesForReminder
            ORDER BY DaysOverdue DESC
        `;
        return result.recordset;
    } catch (error) {
        console.error('Error getting overdue invoices:', error);
        throw error;
    } catch (error) {
        throw error;
    }
}

export async function getInvoicesForReminderSetting(reminderDays) {
    try {
        await getConnection();
        const request = new sql.Request();
        request.input('ReminderDays', sql.Int, reminderDays);

        // Get invoices that are at least reminderDays overdue
        // and haven't received this specific reminder yet
        const result = await request.query(`
            SELECT oi.*
            FROM v_OverdueInvoicesForReminder oi
            WHERE oi.DaysOverdue >= @ReminderDays
            ORDER BY oi.DaysOverdue DESC
        `);
        return result.recordset;
    } catch (error) {
        console.error('Error getting invoices for reminder:', error);
        throw error;
    } catch (error) {
        throw error;
    }
}

export async function createReminderLog(logData) {
    try {
        await getConnection();
        const logId = crypto.randomUUID();
        const request = new sql.Request();
        request.input('Id', sql.UniqueIdentifier, logId);
        request.input('InvoiceId', sql.UniqueIdentifier, logData.InvoiceId);
        request.input('EntityType', sql.NVarChar, 'Invoice');
        request.input('EntityId', sql.UniqueIdentifier, logData.InvoiceId);
        request.input('RecipientEmail', sql.NVarChar, logData.RecipientEmail);
        request.input('RecipientName', sql.NVarChar, logData.RecipientName || null);
        request.input('Subject', sql.NVarChar, logData.Subject);
        request.input('Body', sql.NVarChar, logData.Body);
        request.input('Status', sql.NVarChar, logData.Status);
        request.input('ReminderSettingId', sql.UniqueIdentifier, logData.ReminderSettingId || null);
        request.input('TemplateId', sql.UniqueIdentifier, logData.TemplateId || null);
        request.input('IsAutomatic', sql.Bit, logData.IsAutomatic || false);

        await request.query(`
            INSERT INTO EmailLog (Id, InvoiceId, EntityType, EntityId, RecipientEmail, RecipientName, Subject, Body, Status, ReminderSettingId, TemplateId, IsAutomatic)
            VALUES (@Id, @InvoiceId, @EntityType, @EntityId, @RecipientEmail, @RecipientName, @Subject, @Body, @Status, @ReminderSettingId, @TemplateId, @IsAutomatic)
        `);

        return logId;
    } catch (error) {
        console.error('Error creating reminder log:', error);
        throw error;
    } catch (error) {
        throw error;
    }
}

export async function getLastReminderForInvoice(invoiceId, reminderSettingId) {
    try {
        await getConnection();
        const request = new sql.Request();
        request.input('InvoiceId', sql.UniqueIdentifier, invoiceId);
        request.input('ReminderSettingId', sql.UniqueIdentifier, reminderSettingId);

        const result = await request.query(`
            SELECT TOP 1 *
            FROM EmailLog
            WHERE InvoiceId = @InvoiceId
                AND ReminderSettingId = @ReminderSettingId
                AND IsAutomatic = 1
            ORDER BY CreatedAt DESC
        `);
        return result.recordset[0] || null;
    } catch (error) {
        console.error('Error getting last reminder:', error);
        throw error;
    } catch (error) {
        throw error;
    }
}

export async function getReminderCountForInvoice(invoiceId, reminderSettingId) {
    try {
        await getConnection();
        const request = new sql.Request();
        request.input('InvoiceId', sql.UniqueIdentifier, invoiceId);
        request.input('ReminderSettingId', sql.UniqueIdentifier, reminderSettingId);

        const result = await request.query(`
            SELECT COUNT(*) AS ReminderCount
            FROM EmailLog
            WHERE InvoiceId = @InvoiceId
                AND ReminderSettingId = @ReminderSettingId
                AND IsAutomatic = 1
                AND Status = 'Sent'
        `);
        return result.recordset[0]?.ReminderCount || 0;
    } catch (error) {
        console.error('Error getting reminder count:', error);
        throw error;
    } catch (error) {
        throw error;
    }
}
