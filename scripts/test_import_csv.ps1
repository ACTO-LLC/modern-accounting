$csvPath = "$PSScriptRoot\..\data\test\test_invoices.csv"
$uri = "http://localhost:7072/api/import-invoices"

try {
    $response = Invoke-RestMethod -Uri $uri -Method Post -InFile $csvPath -ContentType "multipart/form-data" -ErrorAction Stop
    Write-Host "Import Response:"
    $response | Format-List
    
    if ($response.details) {
        Write-Host "Details:"
        $response.details | Format-Table
    }
} catch {
    Write-Host "Error: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        # Try to read the response body
        $stream = $_.Exception.Response.GetResponseStream()
        if ($stream) {
            $reader = New-Object System.IO.StreamReader($stream)
            Write-Host "Details: $($reader.ReadToEnd())"
        }
    } elseif ($_.ErrorDetails) {
         Write-Host "Details: $($_.ErrorDetails.Message)"
    }
}
