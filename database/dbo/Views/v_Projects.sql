CREATE VIEW [dbo].[v_Projects] AS
SELECT
    p.[Id],
    p.[Name],
    p.[CustomerId],
    c.[Name] AS CustomerName,
    p.[Description],
    p.[Status],
    p.[StartDate],
    p.[EndDate],
    p.[BudgetedHours],
    p.[BudgetedAmount],
    p.[CreatedAt],
    p.[UpdatedAt]
FROM
    [dbo].[Projects] p
    LEFT JOIN [dbo].[Customers] c ON p.[CustomerId] = c.[Id];
GO
