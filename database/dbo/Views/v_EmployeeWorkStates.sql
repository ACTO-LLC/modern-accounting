CREATE VIEW [dbo].[v_EmployeeWorkStates] AS
SELECT
    ews.[Id],
    ews.[EmployeeId],
    e.[FirstName] + ' ' + e.[LastName] AS [EmployeeName],
    e.[EmployeeNumber],
    ews.[StateCode],
    ews.[Percentage],
    ews.[EffectiveDate],
    ews.[EndDate],
    ews.[IsPrimary],
    ews.[Notes],
    ews.[CreatedAt],
    ews.[UpdatedAt],
    CASE WHEN ews.[EndDate] IS NULL OR ews.[EndDate] > GETDATE() THEN 1 ELSE 0 END AS [IsActive]
FROM [dbo].[EmployeeWorkStates] ews
INNER JOIN [dbo].[Employees] e ON ews.[EmployeeId] = e.[Id]
GO
