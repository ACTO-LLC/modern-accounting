-- Migration: Copy existing BankRules data into TransactionRules (data-only)
-- The TransactionRules table is created by the sqlproj schema file

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'TransactionRules')
   AND EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'BankRules')
BEGIN
    -- Only migrate if TransactionRules is empty (idempotent)
    IF NOT EXISTS (SELECT 1 FROM [dbo].[TransactionRules])
    BEGIN
        INSERT INTO [dbo].[TransactionRules] (
            [Id], [Name], [BankAccountId],
            [MatchField], [MatchType], [MatchValue],
            [MinAmount], [MaxAmount], [TransactionType],
            [AssignAccountId], [AssignVendorId], [AssignCustomerId],
            [AssignClassId], [AssignMemo], [AssignIsPersonal],
            [Priority], [IsEnabled], [Source],
            [CreatedAt], [UpdatedAt]
        )
        SELECT
            [Id], [Name], [BankAccountId],
            [MatchField], [MatchType], [MatchValue],
            [MinAmount], [MaxAmount], [TransactionType],
            [AssignAccountId], [AssignVendorId], [AssignCustomerId],
            [AssignClassId], [AssignMemo], [AssignIsPersonal],
            [Priority], [IsEnabled], 'manual',
            [CreatedAt], [UpdatedAt]
        FROM [dbo].[BankRules];

        PRINT 'Migrated ' + CAST(@@ROWCOUNT AS VARCHAR) + ' rules from BankRules to TransactionRules';
    END
    ELSE
    BEGIN
        PRINT 'TransactionRules already has data, skipping migration';
    END
END
GO
