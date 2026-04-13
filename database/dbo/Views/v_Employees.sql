CREATE VIEW [dbo].[v_Employees] AS
SELECT
    e.[Id],
    e.[EmployeeNumber],
    e.[FirstName],
    e.[LastName],
    e.[FirstName] + ' ' + e.[LastName] AS [FullName],
    e.[Email],
    e.[Phone],
    CASE WHEN e.[SSNLast4] IS NOT NULL THEN '***-**-' + e.[SSNLast4] ELSE NULL END AS [SSNMasked],
    e.[DateOfBirth],
    e.[HireDate],
    e.[TerminationDate],
    e.[PayType],
    e.[PayRate],
    e.[PayFrequency],
    e.[FederalFilingStatus],
    e.[FederalAllowances],
    e.[StateCode],
    e.[StateFilingStatus],
    e.[StateAllowances],
    e.[Address],
    e.[City],
    e.[State],
    e.[ZipCode],
    e.[Status],
    -- Bank info (masked account number)
    e.[BankRoutingNumber],
    CASE WHEN e.[BankAccountNumber] IS NOT NULL
         THEN '****' + RIGHT(e.[BankAccountNumber], 4)
         ELSE NULL
    END AS [BankAccountNumberMasked],
    e.[BankAccountType],
    -- Plaid verification fields
    e.[PlaidItemId],
    e.[PlaidAccountId],
    e.[BankVerificationStatus],
    e.[BankVerifiedAt],
    e.[BankInstitutionName],
    e.[CreatedAt],
    e.[UpdatedAt]
FROM [dbo].[Employees] e
GO
