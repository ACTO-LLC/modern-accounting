-- Migration: 035_AddEmailReminders
-- Description: Add tables for email templates, reminder settings, and enhance email logging
-- Related Issue: #230 - Email Invoice Reminders and Automation

-- ============================================================================
-- EmailTemplates Table
-- Stores reusable email templates for different purposes
-- ============================================================================
CREATE TABLE [dbo].[EmailTemplates]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [Name] NVARCHAR(100) NOT NULL,
    [Type] NVARCHAR(50) NOT NULL, -- InvoiceReminder, InvoiceDelivery, PaymentReceipt, StatementDelivery
    [Subject] NVARCHAR(500) NOT NULL,
    [Body] NVARCHAR(MAX) NOT NULL,
    [IsDefault] BIT NOT NULL DEFAULT 0,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO

-- Index for finding default templates by type
CREATE INDEX IX_EmailTemplates_Type_Default ON [dbo].[EmailTemplates] ([Type], [IsDefault]) WHERE IsActive = 1;
GO

-- ============================================================================
-- EmailReminderSettings Table
-- Configures when automatic reminders are sent for overdue invoices
-- ============================================================================
CREATE TABLE [dbo].[EmailReminderSettings]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [Name] NVARCHAR(100) NOT NULL,
    [ReminderDays] INT NOT NULL, -- Days after due date (positive) or before due date (negative)
    [TemplateId] UNIQUEIDENTIFIER NULL REFERENCES [dbo].[EmailTemplates](Id),
    [IsEnabled] BIT NOT NULL DEFAULT 1,
    [SendTime] TIME NULL DEFAULT '09:00:00', -- Preferred time to send (in UTC)
    [CooldownDays] INT NOT NULL DEFAULT 7, -- Minimum days between reminders to same invoice
    [MaxReminders] INT NOT NULL DEFAULT 3, -- Maximum reminders per invoice (0 = unlimited)
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO

-- Index for finding active reminder settings
CREATE INDEX IX_EmailReminderSettings_Active ON [dbo].[EmailReminderSettings] (IsEnabled, ReminderDays) WHERE IsEnabled = 1;
GO

-- ============================================================================
-- Update EmailLog to support more entity types and reminder tracking
-- ============================================================================
-- First check if columns exist before adding
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.EmailLog') AND name = 'EntityType')
BEGIN
    -- Add EntityType column to support different entity types
    ALTER TABLE [dbo].[EmailLog] ADD [EntityType] NVARCHAR(50) NULL DEFAULT 'Invoice';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.EmailLog') AND name = 'EntityId')
BEGIN
    -- Add EntityId as a general reference (InvoiceId will be deprecated)
    ALTER TABLE [dbo].[EmailLog] ADD [EntityId] UNIQUEIDENTIFIER NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.EmailLog') AND name = 'ReminderSettingId')
BEGIN
    -- Track which reminder setting triggered this email (if automatic)
    ALTER TABLE [dbo].[EmailLog] ADD [ReminderSettingId] UNIQUEIDENTIFIER NULL REFERENCES [dbo].[EmailReminderSettings](Id);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.EmailLog') AND name = 'IsAutomatic')
BEGIN
    -- Flag to distinguish manual vs automated emails
    ALTER TABLE [dbo].[EmailLog] ADD [IsAutomatic] BIT NOT NULL DEFAULT 0;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.EmailLog') AND name = 'TemplateId')
BEGIN
    -- Track which template was used
    ALTER TABLE [dbo].[EmailLog] ADD [TemplateId] UNIQUEIDENTIFIER NULL REFERENCES [dbo].[EmailTemplates](Id);
END
GO

-- Migrate existing data: copy InvoiceId to EntityId where null
UPDATE [dbo].[EmailLog]
SET [EntityId] = [InvoiceId], [EntityType] = 'Invoice'
WHERE [EntityId] IS NULL AND [InvoiceId] IS NOT NULL;
GO

-- Create index for finding emails by entity
CREATE INDEX IX_EmailLog_Entity ON [dbo].[EmailLog] ([EntityType], [EntityId])
    INCLUDE ([Status], [CreatedAt]);
GO

-- Create index for finding recent automatic reminders (for cooldown check)
CREATE INDEX IX_EmailLog_AutoReminders ON [dbo].[EmailLog] ([EntityId], [ReminderSettingId], [CreatedAt])
    WHERE [IsAutomatic] = 1;
GO

-- ============================================================================
-- Insert Default Email Templates
-- ============================================================================

-- Overdue Invoice Reminder (7 days)
INSERT INTO [dbo].[EmailTemplates] ([Name], [Type], [Subject], [Body], [IsDefault])
VALUES (
    'First Overdue Reminder',
    'InvoiceReminder',
    'Payment Reminder: Invoice {{InvoiceNumber}} is past due',
    'Dear {{CustomerName}},

This is a friendly reminder that Invoice #{{InvoiceNumber}} dated {{InvoiceDate}} for {{AmountDue}} was due on {{DueDate}}.

The invoice is now {{DaysOverdue}} days overdue.

Please submit payment at your earliest convenience. If you have already sent payment, please disregard this notice.

{{PaymentLink}}

If you have any questions regarding this invoice, please don''t hesitate to contact us.

Thank you for your prompt attention to this matter.

Best regards,
{{CompanyName}}
{{CompanyPhone}}',
    1  -- IsDefault
);
GO

-- Overdue Invoice Reminder (14 days)
INSERT INTO [dbo].[EmailTemplates] ([Name], [Type], [Subject], [Body], [IsDefault])
VALUES (
    'Second Overdue Reminder',
    'InvoiceReminder',
    'Second Notice: Invoice {{InvoiceNumber}} requires immediate attention',
    'Dear {{CustomerName}},

This is our second notice regarding Invoice #{{InvoiceNumber}} dated {{InvoiceDate}} for {{AmountDue}}.

This invoice was due on {{DueDate}} and is now {{DaysOverdue}} days overdue.

To avoid any service interruption or additional fees, please arrange for immediate payment.

{{PaymentLink}}

If you are experiencing difficulties with payment, please contact us to discuss payment arrangements.

Best regards,
{{CompanyName}}
{{CompanyPhone}}',
    0
);
GO

-- Overdue Invoice Reminder (30 days)
INSERT INTO [dbo].[EmailTemplates] ([Name], [Type], [Subject], [Body], [IsDefault])
VALUES (
    'Final Overdue Reminder',
    'InvoiceReminder',
    'Final Notice: Invoice {{InvoiceNumber}} - Action Required',
    'Dear {{CustomerName}},

FINAL NOTICE

Invoice #{{InvoiceNumber}} dated {{InvoiceDate}} for {{AmountDue}} remains unpaid. This invoice was due on {{DueDate}} and is now {{DaysOverdue}} days past due.

Please make payment immediately to avoid further collection action.

{{PaymentLink}}

If you believe this notice is in error, or if you need to discuss payment options, please contact us immediately.

Best regards,
{{CompanyName}}
{{CompanyPhone}}',
    0
);
GO

-- Invoice Delivery Template
INSERT INTO [dbo].[EmailTemplates] ([Name], [Type], [Subject], [Body], [IsDefault])
VALUES (
    'Standard Invoice Delivery',
    'InvoiceDelivery',
    'Invoice {{InvoiceNumber}} from {{CompanyName}}',
    'Dear {{CustomerName}},

Please find attached Invoice #{{InvoiceNumber}} dated {{InvoiceDate}} for {{AmountDue}}.

Payment is due by {{DueDate}}.

{{PaymentLink}}

If you have any questions about this invoice, please don''t hesitate to contact us.

Thank you for your business!

Best regards,
{{CompanyName}}
{{CompanyEmail}}
{{CompanyPhone}}',
    1  -- IsDefault
);
GO

-- Payment Receipt Template
INSERT INTO [dbo].[EmailTemplates] ([Name], [Type], [Subject], [Body], [IsDefault])
VALUES (
    'Payment Receipt',
    'PaymentReceipt',
    'Payment Received - Invoice {{InvoiceNumber}}',
    'Dear {{CustomerName}},

Thank you for your payment!

We have received your payment of {{AmountPaid}} for Invoice #{{InvoiceNumber}}.

Payment Date: {{PaymentDate}}
Payment Method: {{PaymentMethod}}

Your account balance is now: {{AccountBalance}}

Thank you for your business!

Best regards,
{{CompanyName}}
{{CompanyEmail}}
{{CompanyPhone}}',
    1  -- IsDefault
);
GO

-- ============================================================================
-- Insert Default Reminder Settings
-- ============================================================================

-- Get the template IDs for the default reminders
DECLARE @FirstReminderId UNIQUEIDENTIFIER;
DECLARE @SecondReminderId UNIQUEIDENTIFIER;
DECLARE @FinalReminderId UNIQUEIDENTIFIER;

SELECT @FirstReminderId = Id FROM [dbo].[EmailTemplates] WHERE [Name] = 'First Overdue Reminder';
SELECT @SecondReminderId = Id FROM [dbo].[EmailTemplates] WHERE [Name] = 'Second Overdue Reminder';
SELECT @FinalReminderId = Id FROM [dbo].[EmailTemplates] WHERE [Name] = 'Final Overdue Reminder';

-- 7 days overdue reminder
INSERT INTO [dbo].[EmailReminderSettings] ([Name], [ReminderDays], [TemplateId], [IsEnabled], [CooldownDays], [MaxReminders])
VALUES ('First Reminder (7 days overdue)', 7, @FirstReminderId, 0, 7, 1);
GO

-- 14 days overdue reminder
INSERT INTO [dbo].[EmailReminderSettings] ([Name], [ReminderDays], [TemplateId], [IsEnabled], [CooldownDays], [MaxReminders])
SELECT 'Second Reminder (14 days overdue)', 14, Id, 0, 7, 1
FROM [dbo].[EmailTemplates] WHERE [Name] = 'Second Overdue Reminder';
GO

-- 30 days overdue reminder
INSERT INTO [dbo].[EmailReminderSettings] ([Name], [ReminderDays], [TemplateId], [IsEnabled], [CooldownDays], [MaxReminders])
SELECT 'Final Reminder (30 days overdue)', 30, Id, 0, 14, 1
FROM [dbo].[EmailTemplates] WHERE [Name] = 'Final Overdue Reminder';
GO

-- ============================================================================
-- View for Overdue Invoices with Reminder Status
-- Uses CTEs to avoid N+1 correlated subqueries for better performance
-- ============================================================================
CREATE OR ALTER VIEW [dbo].[v_OverdueInvoicesForReminder] AS
WITH PaymentTotals AS (
    -- Pre-aggregate payment totals per invoice
    SELECT InvoiceId, SUM(Amount) AS TotalPaid
    FROM Payments
    GROUP BY InvoiceId
),
ReminderStats AS (
    -- Pre-aggregate reminder statistics per entity
    SELECT
        EntityId,
        COUNT(*) AS RemindersSent,
        MAX(CreatedAt) AS LastReminderDate
    FROM EmailLog
    WHERE IsAutomatic = 1
    GROUP BY EntityId
)
SELECT
    i.Id AS InvoiceId,
    i.InvoiceNumber,
    i.CustomerId,
    c.Name AS CustomerName,
    c.Email AS CustomerEmail,
    i.IssueDate,
    i.DueDate,
    i.TotalAmount,
    i.TotalAmount - ISNULL(pt.TotalPaid, 0) AS AmountDue,
    DATEDIFF(DAY, i.DueDate, GETDATE()) AS DaysOverdue,
    i.Status,
    ISNULL(rs.RemindersSent, 0) AS RemindersSent,
    rs.LastReminderDate
FROM Invoices i
INNER JOIN Customers c ON i.CustomerId = c.Id
LEFT JOIN PaymentTotals pt ON pt.InvoiceId = i.Id
LEFT JOIN ReminderStats rs ON rs.EntityId = i.Id
WHERE
    i.Status IN ('Sent', 'Overdue')
    AND i.DueDate < GETDATE()
    AND c.Email IS NOT NULL
    AND c.Email != '';
GO

PRINT 'Migration 035_AddEmailReminders completed successfully';
GO
