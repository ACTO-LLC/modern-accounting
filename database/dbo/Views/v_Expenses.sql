CREATE VIEW [dbo].[v_Expenses] AS
SELECT
    e.[Id],
    e.[ExpenseNumber],
    e.[ExpenseDate],
    e.[VendorId],
    COALESCE(v.[Name], e.[VendorName]) AS VendorName,
    e.[AccountId],
    a.[Name] AS AccountName,
    a.[Type] AS AccountType,
    e.[Amount],
    e.[PaymentAccountId],
    pa.[Name] AS PaymentAccountName,
    e.[PaymentMethod],
    e.[Description],
    e.[Reference],
    e.[IsReimbursable],
    e.[ReimbursedDate],
    e.[CustomerId],
    c.[Name] AS CustomerName,
    e.[ProjectId],
    p.[Name] AS ProjectName,
    e.[ClassId],
    cl.[Name] AS ClassName,
    e.[BankTransactionId],
    e.[Status],
    e.[IsPersonal],
    e.[JournalEntryId],
    e.[CreatedBy],
    e.[CreatedAt],
    e.[UpdatedAt],
    (SELECT COUNT(*) FROM [dbo].[Receipts] r WHERE r.[ExpenseId] = e.[Id]) AS ReceiptCount
FROM
    [dbo].[Expenses] e
    LEFT JOIN [dbo].[Vendors] v ON e.[VendorId] = v.[Id]
    LEFT JOIN [dbo].[Accounts] a ON e.[AccountId] = a.[Id]
    LEFT JOIN [dbo].[Accounts] pa ON e.[PaymentAccountId] = pa.[Id]
    LEFT JOIN [dbo].[Customers] c ON e.[CustomerId] = c.[Id]
    LEFT JOIN [dbo].[Projects] p ON e.[ProjectId] = p.[Id]
    LEFT JOIN [dbo].[Classes] cl ON e.[ClassId] = cl.[Id];
GO
