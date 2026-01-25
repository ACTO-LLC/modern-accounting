CREATE TABLE [dbo].[Receipts]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [ExpenseId] UNIQUEIDENTIFIER NULL,
    [BankTransactionId] UNIQUEIDENTIFIER NULL,
    [FileName] NVARCHAR(255) NOT NULL,
    [FileType] NVARCHAR(50) NULL, -- image/jpeg, image/png, application/pdf
    [FileSize] INT NULL,
    [FileData] VARBINARY(MAX) NULL, -- Store file in DB (for simplicity; can be moved to blob storage)
    [ThumbnailData] VARBINARY(MAX) NULL, -- Thumbnail for preview

    -- OCR extracted data
    [ExtractedVendor] NVARCHAR(255) NULL,
    [ExtractedAmount] DECIMAL(19, 4) NULL,
    [ExtractedDate] DATE NULL,
    [ExtractedLineItems] NVARCHAR(MAX) NULL, -- JSON array of extracted line items
    [OcrConfidence] DECIMAL(5, 2) NULL, -- 0-100 confidence score
    [OcrStatus] NVARCHAR(20) NOT NULL DEFAULT 'Pending', -- Pending, Processing, Completed, Failed
    [OcrErrorMessage] NVARCHAR(500) NULL,

    [UploadedBy] NVARCHAR(255) NULL,
    [UploadedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns (system-versioned)
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_Receipts_Expenses] FOREIGN KEY ([ExpenseId]) REFERENCES [dbo].[Expenses]([Id]) ON DELETE SET NULL,
    CONSTRAINT [FK_Receipts_BankTransactions] FOREIGN KEY ([BankTransactionId]) REFERENCES [dbo].[BankTransactions]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Receipts_History]))
GO

-- Create indexes for common queries
CREATE INDEX [IX_Receipts_ExpenseId] ON [dbo].[Receipts] ([ExpenseId]) WHERE ExpenseId IS NOT NULL
GO

CREATE INDEX [IX_Receipts_BankTransactionId] ON [dbo].[Receipts] ([BankTransactionId]) WHERE BankTransactionId IS NOT NULL
GO

CREATE INDEX [IX_Receipts_OcrStatus] ON [dbo].[Receipts] ([OcrStatus])
GO

CREATE INDEX [IX_Receipts_UploadedAt] ON [dbo].[Receipts] ([UploadedAt] DESC)
GO
