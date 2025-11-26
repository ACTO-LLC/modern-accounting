/*
Post-Deployment Script Template							
--------------------------------------------------------------------------------------
 This file contains SQL statements that will be appended to the build script.		
 Use SQLCMD syntax to include a file in the post-deployment script.			
 Example:      :r .\myfile.sql								
 Use SQLCMD syntax to reference a variable in the post-deployment script.		
 Example:      :setvar TableName MyTable							
               SELECT * FROM [$(TableName)]					
--------------------------------------------------------------------------------------
*/

IF NOT EXISTS (SELECT 1 FROM [dbo].[Accounts])
BEGIN
    INSERT INTO [dbo].[Accounts] ([Code], [Name], [Type], [Subtype])
    VALUES 
    ('1000', 'Cash', 'Asset', 'Cash'),
    ('1100', 'Accounts Receivable', 'Asset', 'Receivable'),
    ('2000', 'Accounts Payable', 'Liability', 'Payable'),
    ('3000', 'Retained Earnings', 'Equity', 'RetainedEarnings'),
    ('4000', 'Sales Revenue', 'Revenue', 'Sales'),
    ('5000', 'Office Expenses', 'Expense', 'Operating')
END
