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
    } finally {
        await sql.close();
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
    } finally {
        await sql.close();
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
    } finally {
        await sql.close();
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
    } finally {
        await sql.close();
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
    } finally {
        await sql.close();
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
    } finally {
        await sql.close();
    }
}
