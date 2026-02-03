# Plaid Sandbox Testing Guide

**Last Updated:** February 2026

---

## Overview

This guide covers how to test Plaid bank feed integration locally using Plaid's sandbox environment. The sandbox provides test institutions and users that simulate real bank connections without accessing actual financial data.

---

## Environment Setup

### Required Environment Variables

Create or update `chat-api/.env`:

```env
PLAID_CLIENT_ID=your-client-id
PLAID_SECRET=your-sandbox-secret
PLAID_ENV=sandbox
```

Get credentials from: https://dashboard.plaid.com/developers/keys

### Start Services

```bash
# Terminal 1: DAB (port 5000)
cd database && dab start

# Terminal 2: Chat-API (port 7071)
cd chat-api && PORT=7071 npm start

# Terminal 3: Client (port 5173)
cd client && npm run dev
```

---

## Sandbox Test Users

Plaid provides several test users with different behaviors:

| Username | Password | Description |
|----------|----------|-------------|
| `user_good` | `pass_good` | Basic test user, minimal transaction data |
| `user_transactions_dynamic` | `pass_good` | **Recommended** - 50+ transactions, supports refresh |
| `user_transactions_updates` | `pass_good` | Simulates transaction updates over time |
| `user_yuppie` | `pass_good` | Persona-based, realistic spending patterns |
| `user_small_business` | `pass_good` | Business account simulation |

### Important: Getting Transactions

The `user_good` test user has **minimal or no transaction data**. To test transaction syncing, use `user_transactions_dynamic`:

1. Go to http://localhost:5173/plaid-connections
2. Click "Connect Bank"
3. Search for "First Platypus Bank" (or any non-OAuth institution)
4. **Username:** `user_transactions_dynamic`
5. **Password:** `pass_good`
6. Complete the connection flow
7. Click "Sync" - should pull ~90 transactions

---

## Generating Test Transactions

### Via Plaid Link (Recommended)

Use `user_transactions_dynamic` as described above. After connecting:

1. Initial sync pulls ~50 transactions
2. Call `/transactions/refresh` to generate more
3. Each refresh adds new pending transactions and posts previous pending ones

### Programmatically

```javascript
const { PlaidApi, Configuration, PlaidEnvironments } = require('plaid');

const plaid = new PlaidApi(new Configuration({
    basePath: PlaidEnvironments.sandbox,
    baseOptions: {
        headers: {
            'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
            'PLAID-SECRET': process.env.PLAID_SECRET,
        },
    },
}));

// Create sandbox item with transactions
const publicTokenResp = await plaid.sandboxPublicTokenCreate({
    institution_id: 'ins_109508', // First Platypus Bank
    initial_products: ['transactions'],
    options: {
        override_username: 'user_transactions_dynamic',
        override_password: 'pass_good',
    }
});

// Exchange for access token
const exchangeResp = await plaid.itemPublicTokenExchange({
    public_token: publicTokenResp.data.public_token,
});

const accessToken = exchangeResp.data.access_token;

// Trigger transaction generation
await plaid.transactionsRefresh({ access_token: accessToken });

// Wait a few seconds, then sync
await new Promise(r => setTimeout(r, 3000));

const syncResp = await plaid.transactionsSync({ access_token: accessToken });
console.log('Transactions:', syncResp.data.added.length);
```

### Creating Custom Transactions

Add specific test transactions:

```javascript
await plaid.sandboxTransactionsCreate({
    access_token: accessToken,
    transactions: [{
        amount: 99.99,
        description: 'Test Purchase',
        date: '2026-02-01',
    }]
});

// Then refresh to see them
await plaid.transactionsRefresh({ access_token: accessToken });
```

---

## Test Institutions

| Institution | ID | OAuth | Notes |
|-------------|-----|-------|-------|
| First Platypus Bank | `ins_109508` | No | Good for testing, has transaction data |
| Platypus OAuth Bank | `ins_127287` | Yes | Tests OAuth flow |
| Tartan Bank | `ins_109511` | No | Alternative test bank |
| Wells Fargo (Sandbox) | `ins_127991` | Yes | Simulates Wells Fargo |

**Note:** Non-OAuth institutions (like First Platypus Bank) are easier to test with programmatic sandbox item creation.

---

## Triggering Webhooks

Simulate webhooks for testing:

```javascript
await plaid.sandboxItemFireWebhook({
    access_token: accessToken,
    webhook_code: 'SYNC_UPDATES_AVAILABLE', // or 'DEFAULT_UPDATE'
});
```

Valid webhook codes:
- `DEFAULT_UPDATE` - New transactions available
- `SYNC_UPDATES_AVAILABLE` - For transactions/sync users
- `PRODUCT_READY` - Product data is ready
- `NEW_ACCOUNTS_AVAILABLE` - New accounts detected
- `LOGIN_REPAIRED` - Login issue resolved

---

## Common Issues

### "0 transactions synced"

**Cause:** Using `user_good` instead of `user_transactions_dynamic`

**Fix:** Reconnect with `user_transactions_dynamic` username

### "PRODUCT_NOT_READY" error

**Cause:** Trying to fetch transactions immediately after creating item

**Fix:** Call `/transactions/refresh` first, then wait 2-3 seconds before syncing

### "Plaid Integration Service Unavailable"

**Cause:** Chat-API not running on expected port

**Fix:** Ensure chat-api is running on port 7071:
```bash
cd chat-api && PORT=7071 npm start
```

### Connection shows in API but not in database

**Cause:** Chat-API caches connections in memory; database might be out of sync

**Fix:** Restart chat-api to reload from database, or check which database you're connected to (local vs prod)

---

## Verifying Local Setup

```bash
# Check services are running
curl http://localhost:5000/api/accounts  # DAB
curl http://localhost:7071/api/plaid/health  # Chat-API

# Check Plaid connections
curl http://localhost:7071/api/plaid/connections

# Check Plaid accounts
curl http://localhost:7071/api/plaid/accounts

# Trigger sync
curl -X POST http://localhost:7071/api/plaid/sync-all
```

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `PlaidConnections` | Stores institution connections (ItemId, AccessToken) |
| `PlaidAccounts` | Individual bank accounts from each connection |
| `BankTransactions` | Imported transactions (PlaidTransactionId, PlaidAccountId) |

Check local data:
```sql
SELECT * FROM PlaidConnections;
SELECT * FROM PlaidAccounts;
SELECT COUNT(*) FROM BankTransactions WHERE PlaidTransactionId IS NOT NULL;
```

---

## References

- [Plaid Sandbox Overview](https://plaid.com/docs/sandbox/)
- [Plaid Test Credentials](https://plaid.com/docs/sandbox/test-credentials/)
- [Plaid Sandbox API](https://plaid.com/docs/api/sandbox/)
- [Plaid Transactions API](https://plaid.com/docs/api/products/transactions/)
