CREATE VIEW [dbo].[v_CreditMemoLines]
AS
SELECT
    cml.[Id],
    cml.[CreditMemoId],
    cm.[CreditMemoNumber],
    cml.[ProductServiceId],
    ps.[Name] AS ProductServiceName,
    cml.[Description],
    cml.[Quantity],
    cml.[UnitPrice],
    cml.[Amount],
    cml.[AccountId],
    a.[Name] AS AccountName,
    cml.[CreatedAt],
    cml.[UpdatedAt]
FROM [dbo].[CreditMemoLines] cml
INNER JOIN [dbo].[CreditMemos] cm ON cml.[CreditMemoId] = cm.[Id]
LEFT JOIN [dbo].[ProductsServices] ps ON cml.[ProductServiceId] = ps.[Id]
LEFT JOIN [dbo].[Accounts] a ON cml.[AccountId] = a.[Id]
GO
