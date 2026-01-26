-- Migration: Add Vendor Credits (Debit Memos) functionality
-- Issue #212: feat: Vendor Credits (Debit Memos)
-- Date: 2026-01-25

-- =============================================
-- VendorCredits table - main header for vendor credits/debit memos
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[VendorCredits]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[VendorCredits] (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        CreditNumber NVARCHAR(50) NOT NULL,
        VendorId UNIQUEIDENTIFIER NOT NULL,
        CreditDate DATE NOT NULL,
        Reason NVARCHAR(500),
        Subtotal DECIMAL(19,4) NOT NULL DEFAULT 0,
        TaxAmount DECIMAL(19,4) DEFAULT 0,
        TotalAmount DECIMAL(19,4) NOT NULL DEFAULT 0,
        AmountApplied DECIMAL(19,4) DEFAULT 0,
        Status NVARCHAR(20) DEFAULT 'Open', -- Open, Applied, Voided
        JournalEntryId UNIQUEIDENTIFIER,
        SourceSystem NVARCHAR(50),
        SourceId NVARCHAR(255),
        CreatedAt DATETIME2 DEFAULT SYSDATETIME(),
        UpdatedAt DATETIME2 DEFAULT SYSDATETIME(),
        CONSTRAINT FK_VendorCredits_Vendors FOREIGN KEY (VendorId) REFERENCES dbo.Vendors(Id),
        CONSTRAINT FK_VendorCredits_JournalEntries FOREIGN KEY (JournalEntryId) REFERENCES dbo.JournalEntries(Id),
        CONSTRAINT CK_VendorCredits_Status CHECK (Status IN ('Open', 'Applied', 'Partial', 'Voided'))
    );

    CREATE INDEX IX_VendorCredits_VendorId ON dbo.VendorCredits(VendorId);
    CREATE INDEX IX_VendorCredits_Status ON dbo.VendorCredits(Status);
    CREATE INDEX IX_VendorCredits_CreditDate ON dbo.VendorCredits(CreditDate);
    CREATE UNIQUE INDEX IX_VendorCredits_CreditNumber ON dbo.VendorCredits(CreditNumber);

    PRINT 'Created table: VendorCredits';
END
GO

-- =============================================
-- VendorCreditLines table - line items for vendor credits
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[VendorCreditLines]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[VendorCreditLines] (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        VendorCreditId UNIQUEIDENTIFIER NOT NULL,
        ProductServiceId UNIQUEIDENTIFIER,
        Description NVARCHAR(500),
        Quantity DECIMAL(18,4) DEFAULT 1,
        UnitPrice DECIMAL(19,4) NOT NULL DEFAULT 0,
        Amount DECIMAL(19,4) NOT NULL DEFAULT 0,
        AccountId UNIQUEIDENTIFIER,
        CreatedAt DATETIME2 DEFAULT SYSDATETIME(),
        UpdatedAt DATETIME2 DEFAULT SYSDATETIME(),
        CONSTRAINT FK_VendorCreditLines_VendorCredits FOREIGN KEY (VendorCreditId) REFERENCES dbo.VendorCredits(Id) ON DELETE CASCADE,
        CONSTRAINT FK_VendorCreditLines_ProductsServices FOREIGN KEY (ProductServiceId) REFERENCES dbo.ProductsServices(Id),
        CONSTRAINT FK_VendorCreditLines_Accounts FOREIGN KEY (AccountId) REFERENCES dbo.Accounts(Id)
    );

    CREATE INDEX IX_VendorCreditLines_VendorCreditId ON dbo.VendorCreditLines(VendorCreditId);
    CREATE INDEX IX_VendorCreditLines_AccountId ON dbo.VendorCreditLines(AccountId);

    PRINT 'Created table: VendorCreditLines';
END
GO

-- =============================================
-- VendorCreditApplications table - tracks credits applied to bills
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[VendorCreditApplications]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[VendorCreditApplications] (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        VendorCreditId UNIQUEIDENTIFIER NOT NULL,
        BillId UNIQUEIDENTIFIER NOT NULL,
        AmountApplied DECIMAL(19,4) NOT NULL,
        ApplicationDate DATE NOT NULL,
        CreatedAt DATETIME2 DEFAULT SYSDATETIME(),
        CONSTRAINT FK_VendorCreditApplications_VendorCredits FOREIGN KEY (VendorCreditId) REFERENCES dbo.VendorCredits(Id),
        CONSTRAINT FK_VendorCreditApplications_Bills FOREIGN KEY (BillId) REFERENCES dbo.Bills(Id)
    );

    CREATE INDEX IX_VendorCreditApplications_VendorCreditId ON dbo.VendorCreditApplications(VendorCreditId);
    CREATE INDEX IX_VendorCreditApplications_BillId ON dbo.VendorCreditApplications(BillId);

    PRINT 'Created table: VendorCreditApplications';
END
GO

-- =============================================
-- View: v_VendorCredits - joins with vendor info for display
-- =============================================
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[v_VendorCredits]') AND type = N'V')
    DROP VIEW [dbo].[v_VendorCredits];
GO

CREATE VIEW [dbo].[v_VendorCredits]
AS
SELECT
    vc.Id,
    vc.CreditNumber,
    vc.VendorId,
    v.Name AS VendorName,
    vc.CreditDate,
    vc.Reason,
    vc.Subtotal,
    vc.TaxAmount,
    vc.TotalAmount,
    vc.AmountApplied,
    (vc.TotalAmount - vc.AmountApplied) AS BalanceRemaining,
    vc.Status,
    vc.JournalEntryId,
    vc.SourceSystem,
    vc.SourceId,
    vc.CreatedAt,
    vc.UpdatedAt
FROM dbo.VendorCredits vc
LEFT JOIN dbo.Vendors v ON vc.VendorId = v.Id;
GO

PRINT 'Created view: v_VendorCredits';
GO

-- =============================================
-- View: v_VendorCreditApplications - detailed view of credit applications
-- =============================================
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[v_VendorCreditApplications]') AND type = N'V')
    DROP VIEW [dbo].[v_VendorCreditApplications];
GO

CREATE VIEW [dbo].[v_VendorCreditApplications]
AS
SELECT
    vca.Id,
    vca.VendorCreditId,
    vc.CreditNumber,
    vca.BillId,
    b.BillNumber,
    vca.AmountApplied,
    vca.ApplicationDate,
    vca.CreatedAt,
    v.Id AS VendorId,
    v.Name AS VendorName
FROM dbo.VendorCreditApplications vca
INNER JOIN dbo.VendorCredits vc ON vca.VendorCreditId = vc.Id
INNER JOIN dbo.Bills b ON vca.BillId = b.Id
LEFT JOIN dbo.Vendors v ON vc.VendorId = v.Id;
GO

PRINT 'Created view: v_VendorCreditApplications';
GO
