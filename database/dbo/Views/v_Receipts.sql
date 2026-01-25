CREATE VIEW [dbo].[v_Receipts] AS
SELECT
    r.[Id],
    r.[ExpenseId],
    e.[ExpenseNumber],
    e.[ExpenseDate],
    r.[BankTransactionId],
    r.[FileName],
    r.[FileType],
    r.[FileSize],
    r.[ExtractedVendor],
    r.[ExtractedAmount],
    r.[ExtractedDate],
    r.[OcrConfidence],
    r.[OcrStatus],
    r.[OcrErrorMessage],
    r.[UploadedBy],
    r.[UploadedAt],
    CASE WHEN r.[ExpenseId] IS NULL THEN 0 ELSE 1 END AS IsMatched
FROM
    [dbo].[Receipts] r
    LEFT JOIN [dbo].[Expenses] e ON r.[ExpenseId] = e.[Id];
GO
