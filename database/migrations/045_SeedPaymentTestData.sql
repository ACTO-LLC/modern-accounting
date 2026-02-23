-- Migration 045: Seed test data for Receive Payment E2E tests
-- Creates a known customer with 3 open invoices for deterministic testing

-- Use fixed GUIDs for idempotency (hex-only characters)
DECLARE @CustomerId UNIQUEIDENTIFIER = 'E2E00000-0000-0000-0000-00000000A001';
DECLARE @InvoiceId1 UNIQUEIDENTIFIER = 'E2E00000-0000-0000-0000-00000000B001';
DECLARE @InvoiceId2 UNIQUEIDENTIFIER = 'E2E00000-0000-0000-0000-00000000B002';
DECLARE @InvoiceId3 UNIQUEIDENTIFIER = 'E2E00000-0000-0000-0000-00000000B003';

-- Insert test customer
IF NOT EXISTS (SELECT 1 FROM [dbo].[Customers] WHERE [Id] = @CustomerId)
BEGIN
    INSERT INTO [dbo].[Customers] ([Id], [Name], [Email])
    VALUES (@CustomerId, 'E2E Test Customer - Payments', 'e2e-payments@test.local');
END

-- Invoice 1: $500, due in future (current)
IF NOT EXISTS (SELECT 1 FROM [dbo].[Invoices] WHERE [Id] = @InvoiceId1)
    INSERT INTO [dbo].[Invoices] ([Id], [InvoiceNumber], [CustomerId], [IssueDate], [DueDate], [Subtotal], [TotalAmount], [AmountPaid], [Status])
    VALUES (@InvoiceId1, 'E2E-PAY-001', @CustomerId, '2026-01-15', '2026-06-30', 500.0000, 500.0000, 0, 'Open');
ELSE
    UPDATE [dbo].[Invoices] SET [AmountPaid] = 0, [Status] = 'Open' WHERE [Id] = @InvoiceId1 AND [Status] <> 'Open';

-- Invoice 2: $250, due in future (current)
IF NOT EXISTS (SELECT 1 FROM [dbo].[Invoices] WHERE [Id] = @InvoiceId2)
    INSERT INTO [dbo].[Invoices] ([Id], [InvoiceNumber], [CustomerId], [IssueDate], [DueDate], [Subtotal], [TotalAmount], [AmountPaid], [Status])
    VALUES (@InvoiceId2, 'E2E-PAY-002', @CustomerId, '2026-01-20', '2026-06-30', 250.0000, 250.0000, 0, 'Open');
ELSE
    UPDATE [dbo].[Invoices] SET [AmountPaid] = 0, [Status] = 'Open' WHERE [Id] = @InvoiceId2 AND [Status] <> 'Open';

-- Invoice 3: $1000, due 2025-12-31 (overdue - tests aging display)
IF NOT EXISTS (SELECT 1 FROM [dbo].[Invoices] WHERE [Id] = @InvoiceId3)
    INSERT INTO [dbo].[Invoices] ([Id], [InvoiceNumber], [CustomerId], [IssueDate], [DueDate], [Subtotal], [TotalAmount], [AmountPaid], [Status])
    VALUES (@InvoiceId3, 'E2E-PAY-003', @CustomerId, '2025-11-30', '2025-12-31', 1000.0000, 1000.0000, 0, 'Open');
ELSE
    UPDATE [dbo].[Invoices] SET [AmountPaid] = 0, [Status] = 'Open' WHERE [Id] = @InvoiceId3 AND [Status] <> 'Open';

-- Clean up any payment applications from previous test runs
DELETE FROM [dbo].[PaymentApplications] WHERE [InvoiceId] IN (@InvoiceId1, @InvoiceId2, @InvoiceId3);
GO
