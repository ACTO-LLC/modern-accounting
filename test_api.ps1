$body = @{
    InvoiceNumber = "INV-API-TEST-001"
    CustomerId = "C1A050F3-1FB3-4DAD-8E59-A45FFFB3D1B3"
    IssueDate = "2023-11-28"
    DueDate = "2023-12-28"
    Status = "Draft"
    TotalAmount = 150.00
    Lines = @(
        @{
            Description = "API Test Item"
            Quantity = 2
            UnitPrice = 75.00
        }
    )
} | ConvertTo-Json -Depth 3

try {
    $response = Invoke-RestMethod -Uri "http://localhost:7072/api/invoices" -Method Post -Body $body -ContentType "application/json"
    Write-Host "Success! Created Invoice ID: $($response.Id)"
    $response | Format-List
} catch {
    Write-Host "Error: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Host "Details: $($reader.ReadToEnd())"
    }
}
