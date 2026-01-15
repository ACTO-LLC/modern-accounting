-- ============================================================================
-- Migration 009: Add Payments, BillPayments tables and Priority 2 migration support
-- Supports QBO Payment, BillPayment, and JournalEntry migration
-- ============================================================================

-- ============================================================================
-- PAYMENTS TABLE (Customer/AR Payments)
-- Tracks customer payments received against invoices
-- ============================================================================

CREATE TABLE [dbo].[Payments]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [PaymentNumber] NVARCHAR(50) NULL,              -- Reference/check number
    [CustomerId] UNIQUEIDENTIFIER NOT NULL,         -- FK to Customers
    [PaymentDate] DATE NOT NULL,
    [TotalAmount] DECIMAL(19, 4) NOT NULL DEFAULT 0,
    [PaymentMethod] NVARCHAR(50) NULL,              -- Cash, Check, Credit Card, etc.
    [DepositAccountId] UNIQUEIDENTIFIER NULL,       -- FK to Accounts (bank account)
    [Memo] NVARCHAR(500) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Completed', -- Completed, Voided
    [SourceSystem] NVARCHAR(50) NULL,               -- 'QBO', 'Xero', etc.
    [SourceId] NVARCHAR(100) NULL,                  -- External system ID
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_Payments_Customers] FOREIGN KEY ([CustomerId]) REFERENCES [dbo].[Customers]([Id]),
    CONSTRAINT [FK_Payments_Accounts] FOREIGN KEY ([DepositAccountId]) REFERENCES [dbo].[Accounts]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Payments_History]))
GO

-- Enable change tracking
ALTER TABLE [dbo].[Payments] ENABLE CHANGE_TRACKING
WITH (TRACK_COLUMNS_UPDATED = ON)
GO

-- Indexes
CREATE INDEX [IX_Payments_CustomerId] ON [dbo].[Payments] ([CustomerId])
GO
CREATE INDEX [IX_Payments_PaymentDate] ON [dbo].[Payments] ([PaymentDate])
GO
CREATE INDEX [IX_Payments_Source] ON [dbo].[Payments] ([SourceSystem], [SourceId]) WHERE [SourceSystem] IS NOT NULL
GO

-- ============================================================================
-- PAYMENT APPLICATIONS TABLE
-- Links payments to the invoices they are applied against
-- ============================================================================

CREATE TABLE [dbo].[PaymentApplications]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [PaymentId] UNIQUEIDENTIFIER NOT NULL,          -- FK to Payments
    [InvoiceId] UNIQUEIDENTIFIER NOT NULL,          -- FK to Invoices
    [AmountApplied] DECIMAL(19, 4) NOT NULL DEFAULT 0,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_PaymentApplications_Payments] FOREIGN KEY ([PaymentId]) REFERENCES [dbo].[Payments]([Id]) ON DELETE CASCADE,
    CONSTRAINT [FK_PaymentApplications_Invoices] FOREIGN KEY ([InvoiceId]) REFERENCES [dbo].[Invoices]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[PaymentApplications_History]))
GO

CREATE INDEX [IX_PaymentApplications_PaymentId] ON [dbo].[PaymentApplications] ([PaymentId])
GO
CREATE INDEX [IX_PaymentApplications_InvoiceId] ON [dbo].[PaymentApplications] ([InvoiceId])
GO

-- ============================================================================
-- BILL PAYMENTS TABLE (Vendor/AP Payments)
-- Tracks payments made to vendors against bills
-- ============================================================================

CREATE TABLE [dbo].[BillPayments]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [PaymentNumber] NVARCHAR(50) NULL,              -- Reference/check number
    [VendorId] UNIQUEIDENTIFIER NOT NULL,           -- FK to Vendors
    [PaymentDate] DATE NOT NULL,
    [TotalAmount] DECIMAL(19, 4) NOT NULL DEFAULT 0,
    [PaymentMethod] NVARCHAR(50) NULL,              -- Check, ACH, Credit Card, etc.
    [PaymentAccountId] UNIQUEIDENTIFIER NULL,       -- FK to Accounts (bank/credit card)
    [Memo] NVARCHAR(500) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Completed', -- Completed, Voided
    [SourceSystem] NVARCHAR(50) NULL,
    [SourceId] NVARCHAR(100) NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_BillPayments_Vendors] FOREIGN KEY ([VendorId]) REFERENCES [dbo].[Vendors]([Id]),
    CONSTRAINT [FK_BillPayments_Accounts] FOREIGN KEY ([PaymentAccountId]) REFERENCES [dbo].[Accounts]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[BillPayments_History]))
GO

-- Enable change tracking
ALTER TABLE [dbo].[BillPayments] ENABLE CHANGE_TRACKING
WITH (TRACK_COLUMNS_UPDATED = ON)
GO

-- Indexes
CREATE INDEX [IX_BillPayments_VendorId] ON [dbo].[BillPayments] ([VendorId])
GO
CREATE INDEX [IX_BillPayments_PaymentDate] ON [dbo].[BillPayments] ([PaymentDate])
GO
CREATE INDEX [IX_BillPayments_Source] ON [dbo].[BillPayments] ([SourceSystem], [SourceId]) WHERE [SourceSystem] IS NOT NULL
GO

-- ============================================================================
-- BILL PAYMENT APPLICATIONS TABLE
-- Links bill payments to the bills they are applied against
-- ============================================================================

CREATE TABLE [dbo].[BillPaymentApplications]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [BillPaymentId] UNIQUEIDENTIFIER NOT NULL,      -- FK to BillPayments
    [BillId] UNIQUEIDENTIFIER NOT NULL,             -- FK to Bills
    [AmountApplied] DECIMAL(19, 4) NOT NULL DEFAULT 0,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_BillPaymentApplications_BillPayments] FOREIGN KEY ([BillPaymentId]) REFERENCES [dbo].[BillPayments]([Id]) ON DELETE CASCADE,
    CONSTRAINT [FK_BillPaymentApplications_Bills] FOREIGN KEY ([BillId]) REFERENCES [dbo].[Bills]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[BillPaymentApplications_History]))
GO

CREATE INDEX [IX_BillPaymentApplications_BillPaymentId] ON [dbo].[BillPaymentApplications] ([BillPaymentId])
GO
CREATE INDEX [IX_BillPaymentApplications_BillId] ON [dbo].[BillPaymentApplications] ([BillId])
GO

-- ============================================================================
-- ADD SOURCE TRACKING TO JOURNAL ENTRIES
-- ============================================================================

ALTER TABLE [dbo].[JournalEntries] ADD
    [SourceSystem] NVARCHAR(50) NULL,
    [SourceId] NVARCHAR(100) NULL;
GO

CREATE INDEX [IX_JournalEntries_Source] ON [dbo].[JournalEntries] ([SourceSystem], [SourceId]) WHERE [SourceSystem] IS NOT NULL
GO

-- ============================================================================
-- MIGRATION FIELD MAPPINGS FOR PRIORITY 2 ENTITIES
-- ============================================================================

-- Payment (Customer Payment/Receive Payment) field mappings
INSERT INTO MigrationFieldMaps (SourceSystem, EntityType, SourceField, TargetField, Transform, DefaultValue, IsRequired, SortOrder) VALUES
('QBO', 'Payment', 'PaymentRefNum', 'PaymentNumber', 'string', NULL, 0, 1),
('QBO', 'Payment', 'CustomerRef.value', 'CustomerId', 'entity:Customer', NULL, 1, 2),
('QBO', 'Payment', 'TxnDate', 'PaymentDate', 'date', NULL, 1, 3),
('QBO', 'Payment', 'TotalAmt', 'TotalAmount', 'float', '0', 0, 4),
('QBO', 'Payment', 'PaymentMethodRef.name', 'PaymentMethod', 'string', NULL, 0, 5),
('QBO', 'Payment', 'DepositToAccountRef.value', 'DepositAccountId', 'entity:Account', NULL, 0, 6),
('QBO', 'Payment', 'PrivateNote', 'Memo', 'string', NULL, 0, 7);

-- BillPayment field mappings
INSERT INTO MigrationFieldMaps (SourceSystem, EntityType, SourceField, TargetField, Transform, DefaultValue, IsRequired, SortOrder) VALUES
('QBO', 'BillPayment', 'DocNumber', 'PaymentNumber', 'string', NULL, 0, 1),
('QBO', 'BillPayment', 'VendorRef.value', 'VendorId', 'entity:Vendor', NULL, 1, 2),
('QBO', 'BillPayment', 'TxnDate', 'PaymentDate', 'date', NULL, 1, 3),
('QBO', 'BillPayment', 'TotalAmt', 'TotalAmount', 'float', '0', 0, 4),
('QBO', 'BillPayment', 'PayType', 'PaymentMethod', 'lookup:PaymentType', NULL, 0, 5),
('QBO', 'BillPayment', 'CheckPayment.BankAccountRef.value', 'PaymentAccountId', 'entity:Account', NULL, 0, 6),
('QBO', 'BillPayment', 'CreditCardPayment.CCAccountRef.value', 'PaymentAccountId', 'entity:Account', NULL, 0, 7),
('QBO', 'BillPayment', 'PrivateNote', 'Memo', 'string', NULL, 0, 8);

-- JournalEntry field mappings
INSERT INTO MigrationFieldMaps (SourceSystem, EntityType, SourceField, TargetField, Transform, DefaultValue, IsRequired, SortOrder) VALUES
('QBO', 'JournalEntry', 'DocNumber', 'Reference', 'string', NULL, 0, 1),
('QBO', 'JournalEntry', 'TxnDate', 'TransactionDate', 'date', NULL, 1, 2),
('QBO', 'JournalEntry', 'PrivateNote', 'Description', 'string', 'Imported from QuickBooks', 0, 3),
('QBO', 'JournalEntry', 'Adjustment', 'Status', 'journalentrystatus', 'Posted', 0, 4);

-- ============================================================================
-- MIGRATION TYPE MAPPINGS FOR PRIORITY 2 ENTITIES
-- ============================================================================

-- Payment method mappings (QBO PayType -> ACTO PaymentMethod)
INSERT INTO MigrationTypeMaps (SourceSystem, Category, SourceValue, TargetValue, IsDefault) VALUES
('QBO', 'PaymentType', 'Check', 'Check', 0),
('QBO', 'PaymentType', 'CreditCard', 'Credit Card', 0),
('QBO', 'PaymentType', 'Cash', 'Cash', 1);  -- Default

-- Journal entry status mappings
INSERT INTO MigrationTypeMaps (SourceSystem, Category, SourceValue, TargetValue, IsDefault) VALUES
('QBO', 'JournalEntryStatus', 'true', 'Draft', 0),   -- Adjustment=true means it's an adjustment
('QBO', 'JournalEntryStatus', 'false', 'Posted', 1); -- Default: Posted

-- ============================================================================
-- MIGRATION CONFIG ADDITIONS
-- ============================================================================

INSERT INTO MigrationConfigs (SourceSystem, ConfigKey, ConfigValue, Description) VALUES
('QBO', 'UpdateInvoiceBalances', 'true', 'Update invoice balances when payments are migrated'),
('QBO', 'UpdateBillBalances', 'true', 'Update bill balances when bill payments are migrated'),
('QBO', 'AutoPostJournalEntries', 'true', 'Automatically post migrated journal entries');

PRINT 'Migration 009: Payments, BillPayments, and JournalEntry migration support added successfully';
