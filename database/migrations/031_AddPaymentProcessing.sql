-- ============================================================================
-- Migration 030: Add Payment Processing Support
-- Adds AmountPaid/BalanceDue tracking to Invoices and creates payment views
-- ============================================================================

-- ============================================================================
-- ADD AMOUNT PAID TO INVOICES TABLE
-- ============================================================================

-- First, disable system versioning to add column
ALTER TABLE [dbo].[Invoices] SET (SYSTEM_VERSIONING = OFF);
GO

-- Add AmountPaid column to Invoices (matching Bills table pattern)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Invoices') AND name = 'AmountPaid')
BEGIN
    ALTER TABLE [dbo].[Invoices] ADD [AmountPaid] DECIMAL(19, 4) NOT NULL DEFAULT 0;
    ALTER TABLE [dbo].[Invoices_History] ADD [AmountPaid] DECIMAL(19, 4) NOT NULL DEFAULT 0;
END
GO

-- Re-enable system versioning
ALTER TABLE [dbo].[Invoices] SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Invoices_History]));
GO

-- ============================================================================
-- UPDATE INVOICES VIEW TO INCLUDE BALANCE TRACKING
-- ============================================================================

ALTER VIEW [dbo].[v_Invoices] AS
SELECT
    i.[Id],
    i.[InvoiceNumber],
    i.[CustomerId],
    c.[Name] AS CustomerName,
    i.[IssueDate],
    i.[DueDate],
    i.[Subtotal],
    i.[TaxRateId],
    tr.[Name] AS TaxRateName,
    tr.[Rate] AS TaxRate,
    i.[TaxAmount],
    i.[TotalAmount],
    i.[AmountPaid],
    (i.[TotalAmount] - i.[AmountPaid]) AS BalanceDue,
    CASE
        WHEN i.[Status] = 'Paid' THEN 'Paid'
        WHEN i.[AmountPaid] > 0 AND i.[AmountPaid] < i.[TotalAmount] THEN 'Partial'
        WHEN i.[DueDate] < CAST(GETDATE() AS DATE) AND i.[Status] NOT IN ('Paid', 'Draft') THEN 'Overdue'
        ELSE i.[Status]
    END AS Status,
    i.[SourceSystem],
    i.[SourceId],
    i.[ClaimId],
    i.[CreatedAt],
    i.[UpdatedAt]
FROM
    [dbo].[Invoices] i
    LEFT JOIN [dbo].[Customers] c ON i.[CustomerId] = c.[Id]
    LEFT JOIN [dbo].[TaxRates] tr ON i.[TaxRateId] = tr.[Id];
GO

-- ============================================================================
-- CREATE PAYMENTS VIEW WITH CUSTOMER INFO
-- ============================================================================

IF EXISTS (SELECT * FROM sys.views WHERE object_id = OBJECT_ID(N'[dbo].[v_Payments]'))
    DROP VIEW [dbo].[v_Payments];
GO

CREATE VIEW [dbo].[v_Payments] AS
SELECT
    p.[Id],
    p.[PaymentNumber],
    p.[CustomerId],
    c.[Name] AS CustomerName,
    p.[PaymentDate],
    p.[TotalAmount],
    p.[PaymentMethod],
    p.[DepositAccountId],
    a.[Name] AS DepositAccountName,
    p.[Memo],
    p.[Status],
    p.[SourceSystem],
    p.[SourceId],
    p.[CreatedAt],
    p.[UpdatedAt]
FROM
    [dbo].[Payments] p
    LEFT JOIN [dbo].[Customers] c ON p.[CustomerId] = c.[Id]
    LEFT JOIN [dbo].[Accounts] a ON p.[DepositAccountId] = a.[Id];
GO

-- ============================================================================
-- CREATE BILL PAYMENTS VIEW WITH VENDOR INFO
-- ============================================================================

IF EXISTS (SELECT * FROM sys.views WHERE object_id = OBJECT_ID(N'[dbo].[v_BillPayments]'))
    DROP VIEW [dbo].[v_BillPayments];
GO

CREATE VIEW [dbo].[v_BillPayments] AS
SELECT
    bp.[Id],
    bp.[PaymentNumber],
    bp.[VendorId],
    v.[Name] AS VendorName,
    bp.[PaymentDate],
    bp.[TotalAmount],
    bp.[PaymentMethod],
    bp.[PaymentAccountId],
    a.[Name] AS PaymentAccountName,
    bp.[Memo],
    bp.[Status],
    bp.[SourceSystem],
    bp.[SourceId],
    bp.[CreatedAt],
    bp.[UpdatedAt]
FROM
    [dbo].[BillPayments] bp
    LEFT JOIN [dbo].[Vendors] v ON bp.[VendorId] = v.[Id]
    LEFT JOIN [dbo].[Accounts] a ON bp.[PaymentAccountId] = a.[Id];
GO

-- ============================================================================
-- CREATE PAYMENT APPLICATIONS VIEW WITH INVOICE INFO
-- ============================================================================

IF EXISTS (SELECT * FROM sys.views WHERE object_id = OBJECT_ID(N'[dbo].[v_PaymentApplications]'))
    DROP VIEW [dbo].[v_PaymentApplications];
GO

CREATE VIEW [dbo].[v_PaymentApplications] AS
SELECT
    pa.[Id],
    pa.[PaymentId],
    p.[PaymentNumber],
    pa.[InvoiceId],
    i.[InvoiceNumber],
    pa.[AmountApplied],
    i.[TotalAmount] AS InvoiceTotalAmount,
    i.[AmountPaid] AS InvoiceAmountPaid,
    (i.[TotalAmount] - i.[AmountPaid]) AS InvoiceBalanceDue,
    pa.[CreatedAt]
FROM
    [dbo].[PaymentApplications] pa
    LEFT JOIN [dbo].[Payments] p ON pa.[PaymentId] = p.[Id]
    LEFT JOIN [dbo].[Invoices] i ON pa.[InvoiceId] = i.[Id];
GO

-- ============================================================================
-- CREATE BILL PAYMENT APPLICATIONS VIEW WITH BILL INFO
-- ============================================================================

IF EXISTS (SELECT * FROM sys.views WHERE object_id = OBJECT_ID(N'[dbo].[v_BillPaymentApplications]'))
    DROP VIEW [dbo].[v_BillPaymentApplications];
GO

CREATE VIEW [dbo].[v_BillPaymentApplications] AS
SELECT
    bpa.[Id],
    bpa.[BillPaymentId],
    bp.[PaymentNumber],
    bpa.[BillId],
    b.[BillNumber],
    bpa.[AmountApplied],
    b.[TotalAmount] AS BillTotalAmount,
    b.[AmountPaid] AS BillAmountPaid,
    (b.[TotalAmount] - b.[AmountPaid]) AS BillBalanceDue,
    bpa.[CreatedAt]
FROM
    [dbo].[BillPaymentApplications] bpa
    LEFT JOIN [dbo].[BillPayments] bp ON bpa.[BillPaymentId] = bp.[Id]
    LEFT JOIN [dbo].[Bills] b ON bpa.[BillId] = b.[Id];
GO

PRINT 'Migration 030: Payment Processing support added successfully';
