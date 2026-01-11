DECLARE @CustomerId UNIQUEIDENTIFIER;
SELECT TOP 1 @CustomerId = Id FROM v_Customers;
DECLARE @Json NVARCHAR(MAX) = N'{
    "InvoiceNumber": "INV-TEST-MANUAL",
    "CustomerId": "' + CAST(@CustomerId AS NVARCHAR(36)) + '",
    "IssueDate": "2023-10-27",
    "DueDate": "2023-11-26",
    "Status": "Draft",
    "TotalAmount": 100.00,
    "Lines": [
        {
            "Description": "Test Item",
            "Quantity": 1,
            "UnitPrice": 100.00
        }
    ]
}';
EXEC dbo.CreateInvoice @InvoiceJson = @Json;
