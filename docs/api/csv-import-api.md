# CSV Import API Documentation

The CSV Import API provides endpoints for importing bank and credit card transactions from CSV files into the accounting system.

**Base URL:** `http://localhost:7072`

## Endpoints

### POST /api/import-csv

Import transactions from a CSV file. Supports auto-detection of source accounts and categories.

#### Request

- **Content-Type:** `multipart/form-data`
- **Body:**
  | Field | Type | Required | Description |
  |-------|------|----------|-------------|
  | `file` | File | Yes | CSV file to import |
  | `sourceAccountId` | UUID | No | Manual source account ID (leave empty for auto-detect) |
  | `sourceType` | String | No | "Bank" or "CreditCard" (required if sourceAccountId provided) |
  | `sourceName` | String | No | Display name for source (required if sourceAccountId provided) |

#### Response

```json
{
  "success": true,
  "count": 649,
  "format": "capital-one",
  "trainingDataCount": 245,
  "sourceAccountsCreated": 4,
  "categoryAccountsCreated": 17,
  "transactions": [
    {
      "SourceType": "CreditCard",
      "SourceName": "Capital One - Card 4430",
      "SourceAccountId": "uuid",
      "TransactionDate": "2024-01-15",
      "Amount": -45.99,
      "Description": "AMAZON.COM",
      "Status": "Approved",
      "ApprovedCategory": "Merchandise"
    }
  ]
}
```

#### Error Response

```json
{
  "error": "Import failed",
  "details": "Unsupported CSV format"
}
```

---

### POST /api/post-transactions

Post approved transactions to the general ledger by creating journal entries.

#### Request

- **Content-Type:** `application/json`
- **Body:**
  ```json
  {
    "transactionIds": ["uuid-1", "uuid-2", "uuid-3"]
  }
  ```

#### Response

```json
{
  "success": true,
  "count": 3
}
```

---

### POST /api/reset-db

Reset the database by deleting all transactions (for testing purposes).

#### Request

No body required.

#### Response

```json
{
  "success": true,
  "message": "Database reset successfully"
}
```

---

## Supported CSV Formats

### Capital One

**Auto-detection:** Full support (source account + categories)

**Headers:** `Transaction Date, Posted Date, Card No., Description, Category, Debit, Credit`

**Example:**
```csv
Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit
2024-01-15,2024-01-16,4430,AMAZON.COM,Merchandise,45.99,
2024-01-14,2024-01-15,4430,Payment Thank You,,, 500.00
```

**Auto-detection behavior:**
- Source account created as `Capital One - Card {CardNo}` (e.g., "Capital One - Card 4430")
- Account type: `Credit Card`
- Categories from CSV create Expense/Income accounts
- Transactions with categories are auto-approved

---

### QBSE (QuickBooks Self-Employed)

**Auto-detection:** Full support (source account + categories + personal/business)

**Headers:** `Date, Bank, Account, Description, Amount, Type, Category, Receipt, Notes, Income streams, Ungrouped`

**Example:**
```csv
Date,Bank,Account,Description,Amount,Type,Category,Receipt,Notes,Income streams,Ungrouped
11/25/24,Capital One,Spark Cash,Office Supplies,-125.00,Business,Office Expenses,N,,
11/25/24,Chase,Personal Checking,ATM Withdrawal,-200.00,Personal,,N,,
```

**Auto-detection behavior:**
- Source account created as `{Bank} - {Account}` (e.g., "Capital One - Spark Cash")
- Account type: `Credit Card` if "Card" in name, otherwise `Bank`
- Categories from CSV create Expense/Income accounts
- `Type` column determines personal vs business transactions
- Personal transactions post to Owner's Draw/Contribution accounts

---

### Chase

**Auto-detection:** Manual source account required

**Headers:** `Transaction Date, Post Date, Description, Category, Type, Amount, Memo`

**Example:**
```csv
Transaction Date,Post Date,Description,Category,Type,Amount,Memo
01/15/2024,01/16/2024,UBER TRIP,Travel,Sale,-25.00,
```

---

### Wells Fargo

**Auto-detection:** Manual source account required

**Format:** No header row, 5 columns

**Columns:** `Date, Amount, *, *, Description`

**Example:**
```csv
01/15/2024,-125.00,*,*,CHECK #1234
01/14/2024,500.00,*,*,DIRECT DEPOSIT
```

---

## Auto-Detection Details

### Source Account Creation

When no `sourceAccountId` is provided and the CSV format supports auto-detection:

1. System extracts bank/account info from CSV columns
2. Checks if account already exists by name
3. If not found, creates new account:
   - **Name:** `{Bank} - {Account}` (e.g., "Capital One - Card 4430")
   - **Type:** `Credit Card` if name contains "Card" or "Credit", otherwise `Bank`
   - **Code:** Auto-generated (e.g., "AUTO-1704567890-XYZ12")

### Category Account Creation

When CSV contains category information:

1. System extracts category from CSV
2. Checks if account already exists by name
3. If not found, creates new account:
   - **Name:** Category name (e.g., "Merchandise", "Dining")
   - **Type:** `Expense` for negative amounts, `Income` for positive
   - **Code:** Auto-generated

### Transaction Status

| Condition | Status |
|-----------|--------|
| CSV has category | `Approved` (bypasses AI) |
| No category, AI enabled | `Pending` (needs review) |
| No category, AI disabled | `Pending` with 0 confidence |

---

## Environment Variables

```env
# Required
DB_CONNECTION_STRING=Server=localhost,14330;Database=AccountingDB;User Id=sa;Password=...;TrustServerCertificate=true

# Optional
CSV_IMPORT_PORT=7072
DAB_API_URL=http://localhost:5000/api

# Optional - AI Categorization (leave blank to disable)
AZURE_OPENAI_ENDPOINT=https://your-instance.openai.azure.com
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_DEPLOYMENT=gpt-4
```

---

## Usage Examples

### Import with Auto-Detection (Recommended)

```bash
curl -X POST http://localhost:7072/api/import-csv \
  -F "file=@capital-one-spark.csv"
```

### Import with Manual Source Account

```bash
curl -X POST http://localhost:7072/api/import-csv \
  -F "file=@transactions.csv" \
  -F "sourceAccountId=abc-123-def" \
  -F "sourceType=Bank" \
  -F "sourceName=Chase Checking"
```

### Post Transactions to Ledger

```bash
curl -X POST http://localhost:7072/api/post-transactions \
  -H "Content-Type: application/json" \
  -d '{"transactionIds": ["uuid-1", "uuid-2"]}'
```

---

## Journal Entry Logic

When posting transactions, the system creates double-entry journal entries:

### Business Transactions

| Transaction Type | Debit Account | Credit Account |
|-----------------|---------------|----------------|
| Expense (negative amount) | Category Account | Source Account |
| Income (positive amount) | Source Account | Category Account |

### Personal Transactions

| Transaction Type | Debit Account | Credit Account |
|-----------------|---------------|----------------|
| Personal Expense | Owner's Draw | Source Account |
| Personal Income | Source Account | Owner's Contribution |

---

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| `No file uploaded` | Missing file in request | Include CSV file |
| `Unsupported CSV format` | Headers don't match known formats | Check CSV format |
| `Source account required` | No sourceAccountId and format doesn't support auto-detect | Provide sourceAccountId or use supported format |
| `Source account not found` | Invalid sourceAccountId | Check account exists |
| `Invalid column name` | Database schema mismatch | Run migrations |
