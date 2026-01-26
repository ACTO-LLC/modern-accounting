/*
Migration: 037_SeedCashFlowCategories.sql
Purpose: Seed CashFlowCategory values for existing accounts based on their Type and Subtype.

Cash Flow Categories:
- Operating: Day-to-day business activities (AR, AP, Inventory, most expenses/revenue)
- Investing: Long-term asset purchases/sales (Fixed Assets, Investments)
- Financing: Capital structure changes (Loans, Equity, Owner's Draw)
- NULL: Cash accounts themselves (not adjustments, they ARE the cash)

According to the indirect method, we start with net income and adjust for:
1. Non-cash items (depreciation, amortization)
2. Changes in operating assets/liabilities (AR, AP, Inventory, Prepaid, Accrued)
3. Gains/losses from investing/financing activities
*/

-- Update existing accounts with CashFlowCategory based on Type and Subtype
-- Cash and Bank accounts don't have a category - they are cash itself
UPDATE [dbo].[Accounts]
SET [CashFlowCategory] = NULL
WHERE [Subtype] IN ('Bank', 'Cash')
   OR [Name] LIKE '%Cash%'
   OR [Name] LIKE '%Checking%'
   OR [Name] LIKE '%Savings%';
GO

-- Operating Activities - Current Assets (non-cash)
UPDATE [dbo].[Accounts]
SET [CashFlowCategory] = 'Operating'
WHERE [Type] = 'Asset'
  AND [Subtype] IN ('Receivable', 'Inventory', 'OtherCurrentAsset', 'PrepaidExpense')
  AND [CashFlowCategory] IS NULL;
GO

-- Operating Activities - Current Liabilities
UPDATE [dbo].[Accounts]
SET [CashFlowCategory] = 'Operating'
WHERE [Type] = 'Liability'
  AND [Subtype] IN ('Payable', 'CreditCard', 'OtherCurrentLiability', 'AccruedLiability');
GO

-- Operating Activities - All Revenue and Expense accounts
-- (Net Income is calculated from these, but changes in related accounts are operating)
UPDATE [dbo].[Accounts]
SET [CashFlowCategory] = 'Operating'
WHERE [Type] IN ('Revenue', 'Expense')
  AND [CashFlowCategory] IS NULL;
GO

-- Investing Activities - Fixed Assets and Investments
UPDATE [dbo].[Accounts]
SET [CashFlowCategory] = 'Investing'
WHERE [Type] = 'Asset'
  AND ([Subtype] IN ('FixedAsset', 'Investment', 'OtherAsset')
       OR [Name] LIKE '%Equipment%'
       OR [Name] LIKE '%Vehicle%'
       OR [Name] LIKE '%Building%'
       OR [Name] LIKE '%Property%'
       OR [Name] LIKE '%Investment%'
       OR [Name] LIKE '%Depreciation%');
GO

-- Financing Activities - Long-term Liabilities
UPDATE [dbo].[Accounts]
SET [CashFlowCategory] = 'Financing'
WHERE [Type] = 'Liability'
  AND ([Subtype] IN ('LongTermLiability', 'NotesPayable', 'Loan')
       OR [Name] LIKE '%Loan%'
       OR [Name] LIKE '%Note%'
       OR [Name] LIKE '%Mortgage%');
GO

-- Financing Activities - Equity accounts
UPDATE [dbo].[Accounts]
SET [CashFlowCategory] = 'Financing'
WHERE [Type] = 'Equity'
  AND [CashFlowCategory] IS NULL;
GO

-- Catch any remaining accounts - default to Operating
UPDATE [dbo].[Accounts]
SET [CashFlowCategory] = 'Operating'
WHERE [CashFlowCategory] IS NULL
  AND [Subtype] NOT IN ('Bank', 'Cash')
  AND [Name] NOT LIKE '%Cash%'
  AND [Name] NOT LIKE '%Checking%'
  AND [Name] NOT LIKE '%Savings%';
GO

PRINT 'CashFlowCategory values seeded successfully.';
GO
