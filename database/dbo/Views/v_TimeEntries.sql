CREATE VIEW [dbo].[v_TimeEntries] AS
SELECT
    t.[Id],
    t.[ProjectId],
    p.[Name] AS ProjectName,
    t.[CustomerId],
    t.[EmployeeName],
    t.[EntryDate],
    t.[Hours],
    t.[HourlyRate],
    t.[Description],
    t.[IsBillable],
    t.[Status],
    t.[InvoiceLineId],
    t.[CreatedAt],
    t.[UpdatedAt]
FROM
    [dbo].[TimeEntries] t
    LEFT JOIN [dbo].[Projects] p ON t.[ProjectId] = p.[Id];
GO
