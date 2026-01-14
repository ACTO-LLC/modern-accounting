# Session Wrap-Up: CSV Import Auto-Detection

## Current State
The CSV import system now supports **auto-detection** of source accounts and categories for multiple bank formats:

### Supported Formats
1. **QBSE (QuickBooks Self-Employed)** - Full auto-detection
   - Source account from `Bank` + `Account` columns (e.g., "Capital One - Spark Cash")
   - Category account from `Category` column
   - Personal/Business transaction handling via `Type` column

2. **Capital One** - Full auto-detection
   - Source account from "Capital One" + Card number (e.g., "Capital One - Card 4430")
   - Category account from `Category` column (e.g., "Merchandise", "Dining")
   - Transactions auto-approved when category is present

3. **Chase** - Manual source account selection required
4. **Wells Fargo** - Manual source account selection required

### Key Features
- **Auto-creates source accounts**: If "Capital One - Card 4430" doesn't exist, it creates it as Credit Card type
- **Auto-creates category accounts**: Categories like "Merchandise", "Dining" are created as Expense/Income accounts
- **Imports ALL transactions**: No longer limited to first 10 rows
- **Auto-approves**: Transactions with categories are marked as Approved (bypasses AI)

## Files Changed
- `csv-import-api/server.js` - Rewrote import logic with auto-detection
- `client/src/pages/ImportTransactions.tsx` - Updated dropdown and messages
- `client/tests/import-capital-one.spec.ts` - New test for Capital One imports

## How to Test

### Prerequisites
Start all services:
```bash
# Terminal 1: Database + DAB
docker-compose up

# Terminal 2: CSV Import API
cd csv-import-api && npm start

# Terminal 3: Chat API (AI Assistant)
cd chat-api && npm install && npm run dev

# Terminal 4: Client
cd client && npm run dev
```

### Chat API Environment Setup
The Chat API requires Azure OpenAI credentials. Create `chat-api/.env`:
```
# Using ACTO Dev 2 Subscription for local development
AZURE_OPENAI_ENDPOINT=https://eastus.api.cognitive.microsoft.com/
AZURE_OPENAI_API_KEY=<your-api-key>
AZURE_OPENAI_DEPLOYMENT=gpt-4o
DAB_API_URL=http://localhost:5000/api
APP_URL=http://localhost:5219
```

**Azure Resources (ACTO DEV 2):**
- Subscription: `b9167e1d-d52f-48fe-859d-65bc32b6c2f6`
- Resource Group: `acto-dev-pss-ai`
- OpenAI Resource: `acto-dev2-openai`
- Region: `eastus`
- Model Deployment: `gpt-4o`

To get the API key:
```bash
az cognitiveservices account keys list \
  --name "acto-dev2-openai" \
  --resource-group "acto-dev-pss-ai" \
  --subscription "ACTO DEV 2" \
  --query "key1" -o tsv
```

### Manual Test
1. Navigate to http://localhost:5173/import
2. Leave source account as "Auto-detect from CSV (QBSE, Capital One)"
3. Upload `data/capital-one-spark.csv`
4. Click Import - should create accounts and import ~650 transactions
5. Navigate to /review to see imported transactions with "Approved" status

### Automated Tests
```bash
cd client
npx playwright test tests/import-capital-one.spec.ts
npx playwright test tests/import-qbse-autodetect.spec.ts
```

## Environment Info
- **Database**: Port 14330 (SQL Server)
- **DAB**: Port 5000
- **CSV Import API**: Port 7072
- **Chat API**: Port 7071
- **Client**: Port 5219
