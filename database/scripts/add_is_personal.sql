ALTER TABLE dbo.BankTransactions ADD IsPersonal BIT DEFAULT 0;
GO

ALTER VIEW dbo.v_BankTransactions AS
SELECT 
    Id,
    SourceType,
    BankName,
    SourceAccountId,
    TransactionDate,
    PostDate,
    Amount,
    Description,
    Merchant,
    OriginalCategory,
    TransactionType,
    CardNumber,
    RawCSVLine,
    SuggestedAccountId,
    SuggestedCategory,
    SuggestedMemo,
    ConfidenceScore,
    Status,
    ReviewedBy,
    ReviewedDate,
    ApprovedAccountId,
    ApprovedCategory,
    ApprovedMemo,
    JournalEntryId,
    CreatedDate,
    IsPersonal
FROM dbo.BankTransactions;
GO
