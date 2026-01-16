/**
 * Plaid Transaction Sync Service
 * Handles syncing transactions from Plaid and importing them into BankTransactions
 */

import dotenv from 'dotenv';
dotenv.config();

import { plaidService } from './plaid-service.js';
import axios from 'axios';
import crypto from 'crypto';
import { OpenAI } from 'openai';

const DAB_API_URL = process.env.DAB_API_URL || 'http://localhost:5000/api';

// Azure OpenAI client for categorization (optional)
let openaiClient = null;
const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4';

if (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY) {
    openaiClient = new OpenAI({
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${deploymentName}`,
        defaultQuery: { 'api-version': '2024-02-15-preview' },
        defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_API_KEY },
    });
    console.log('Plaid sync: Azure OpenAI initialized for categorization');
}

class PlaidSync {
    constructor() {
        this.plaidClient = plaidService.getClient();
    }

    /**
     * Sync transactions for a specific Plaid connection
     * Uses cursor-based sync for incremental updates
     */
    async syncConnection(itemId) {
        if (!this.plaidClient) {
            throw new Error('Plaid client not initialized');
        }

        console.log(`Starting sync for Plaid connection: ${itemId}`);

        // Get connection from database
        const connection = await plaidService.getConnectionByItemId(itemId);
        if (!connection || !connection.IsActive) {
            throw new Error('Connection not found or inactive');
        }

        // Update status to syncing
        await this.updateConnectionStatus(connection.Id, 'Syncing');

        try {
            const accessToken = await plaidService.getAccessToken(itemId);
            const cursor = connection.LastSyncCursor || null;

            // Call Plaid transactions/sync endpoint
            let hasMore = true;
            let nextCursor = cursor;
            let totalAdded = 0;
            let totalModified = 0;
            let totalRemoved = 0;

            while (hasMore) {
                const syncResponse = await this.plaidClient.transactionsSync({
                    access_token: accessToken,
                    cursor: nextCursor || undefined,
                    count: 100,
                });

                const { added, modified, removed, next_cursor, has_more } = syncResponse.data;

                // Process added transactions
                if (added && added.length > 0) {
                    const count = await this.processAddedTransactions(connection, added);
                    totalAdded += count;
                }

                // Process modified transactions
                if (modified && modified.length > 0) {
                    const count = await this.processModifiedTransactions(connection, modified);
                    totalModified += count;
                }

                // Process removed transactions
                if (removed && removed.length > 0) {
                    const count = await this.processRemovedTransactions(removed);
                    totalRemoved += count;
                }

                nextCursor = next_cursor;
                hasMore = has_more;
            }

            // Update connection with new cursor and status
            await this.updateConnectionAfterSync(connection.Id, nextCursor, 'Success');

            console.log(`Sync complete for ${itemId}: +${totalAdded}, ~${totalModified}, -${totalRemoved}`);

            return {
                success: true,
                itemId,
                added: totalAdded,
                modified: totalModified,
                removed: totalRemoved,
            };
        } catch (error) {
            console.error(`Sync failed for ${itemId}:`, error.message);
            await this.updateConnectionStatus(connection.Id, 'Error', error.message);
            throw error;
        }
    }

    /**
     * Process newly added transactions from Plaid
     */
    async processAddedTransactions(connection, transactions) {
        let successCount = 0;

        // Get chart of accounts for categorization
        const accountsResponse = await axios.get(`${DAB_API_URL}/accounts`);
        const accounts = accountsResponse.data?.value || [];

        // Get Plaid accounts for this connection
        const plaidAccounts = await plaidService.getAccountsByConnectionId(connection.Id);
        const plaidAccountMap = new Map(plaidAccounts.map(a => [a.PlaidAccountId, a]));

        for (const plaidTx of transactions) {
            try {
                // Check if transaction already exists (deduplication)
                const existing = await this.getTransactionByPlaidId(plaidTx.transaction_id);
                if (existing) {
                    console.log(`Transaction ${plaidTx.transaction_id} already exists, skipping`);
                    continue;
                }

                // Get the Plaid account info
                const plaidAccount = plaidAccountMap.get(plaidTx.account_id);
                if (!plaidAccount) {
                    console.warn(`Plaid account ${plaidTx.account_id} not found for transaction ${plaidTx.transaction_id}`);
                    continue;
                }

                // Determine source account (linked account or auto-create)
                let sourceAccountId = plaidAccount.LinkedAccountId;
                if (!sourceAccountId) {
                    // Create or find a source account
                    sourceAccountId = await this.findOrCreateSourceAccount(
                        connection.InstitutionName,
                        plaidAccount.AccountName,
                        plaidAccount.AccountType,
                        accounts
                    );
                }

                // Map Plaid transaction to BankTransaction
                const bankTransaction = await this.mapPlaidTransaction(plaidTx, {
                    connection,
                    plaidAccount,
                    sourceAccountId,
                    accounts,
                });

                // Save to database
                await this.saveBankTransaction(bankTransaction);
                successCount++;
            } catch (error) {
                console.error(`Failed to process transaction ${plaidTx.transaction_id}:`, error.message);
            }
        }

        return successCount;
    }

    /**
     * Process modified transactions
     */
    async processModifiedTransactions(connection, transactions) {
        let successCount = 0;

        for (const plaidTx of transactions) {
            try {
                const existing = await this.getTransactionByPlaidId(plaidTx.transaction_id);
                if (!existing) {
                    // Treat as new if not found
                    console.log(`Modified transaction ${plaidTx.transaction_id} not found, treating as new`);
                    continue;
                }

                // Update the transaction
                await this.updateBankTransaction(existing.Id, {
                    Amount: this.normalizeAmount(plaidTx.amount),
                    Description: plaidTx.name || plaidTx.merchant_name || 'Unknown',
                    Merchant: plaidTx.merchant_name,
                    TransactionDate: plaidTx.date,
                    PostDate: plaidTx.authorized_date,
                    OriginalCategory: plaidTx.personal_finance_category?.primary,
                });

                successCount++;
            } catch (error) {
                console.error(`Failed to update transaction ${plaidTx.transaction_id}:`, error.message);
            }
        }

        return successCount;
    }

    /**
     * Process removed transactions
     */
    async processRemovedTransactions(removedTransactions) {
        let successCount = 0;

        for (const removed of removedTransactions) {
            try {
                const existing = await this.getTransactionByPlaidId(removed.transaction_id);
                if (existing) {
                    // Mark as removed (don't actually delete for audit purposes)
                    await this.updateBankTransaction(existing.Id, {
                        Status: 'Removed',
                    });
                    successCount++;
                }
            } catch (error) {
                console.error(`Failed to remove transaction ${removed.transaction_id}:`, error.message);
            }
        }

        return successCount;
    }

    /**
     * Map Plaid transaction to BankTransaction schema
     */
    async mapPlaidTransaction(plaidTx, context) {
        const { connection, plaidAccount, sourceAccountId, accounts } = context;

        // Determine source type based on account type
        const sourceType = plaidAccount.AccountType === 'credit' ? 'CreditCard' : 'Bank';

        // Source name: Institution + Account name
        const sourceName = `${connection.InstitutionName} - ${plaidAccount.AccountName}`;

        // Normalize amount: Plaid uses positive for debits (spending), we use negative
        const amount = this.normalizeAmount(plaidTx.amount);

        // Get category suggestion from AI
        let suggestedAccountId = null;
        let suggestedCategory = plaidTx.personal_finance_category?.primary || null;
        let suggestedMemo = plaidTx.name;
        let confidenceScore = 0;

        // Try AI categorization if available
        if (openaiClient) {
            try {
                const categorization = await this.categorizeTransaction({
                    description: plaidTx.name,
                    amount: amount,
                    merchant: plaidTx.merchant_name,
                    category: plaidTx.personal_finance_category?.primary,
                }, accounts);

                if (categorization.accountName) {
                    const matchedAccount = accounts.find(a =>
                        a.Name.toLowerCase() === categorization.accountName.toLowerCase()
                    );
                    if (matchedAccount) {
                        suggestedAccountId = matchedAccount.Id;
                    }
                }
                suggestedCategory = categorization.category || suggestedCategory;
                suggestedMemo = categorization.memo || suggestedMemo;
                confidenceScore = categorization.confidence || 0;
            } catch (error) {
                console.warn('AI categorization failed:', error.message);
            }
        }

        return {
            Id: crypto.randomUUID(),
            SourceType: sourceType,
            SourceName: sourceName,
            SourceAccountId: sourceAccountId,
            TransactionDate: plaidTx.date,
            PostDate: plaidTx.authorized_date || plaidTx.date,
            Amount: amount,
            Description: plaidTx.name || plaidTx.merchant_name || 'Unknown Transaction',
            Merchant: plaidTx.merchant_name || null,
            OriginalCategory: plaidTx.personal_finance_category?.primary || null,
            TransactionType: plaidTx.payment_channel || null,
            PlaidTransactionId: plaidTx.transaction_id,
            PlaidAccountId: plaidAccount.Id,
            SuggestedAccountId: suggestedAccountId,
            SuggestedCategory: suggestedCategory,
            SuggestedMemo: suggestedMemo,
            ConfidenceScore: confidenceScore,
            Status: 'Pending',
        };
    }

    /**
     * Normalize Plaid amount to our convention
     * Plaid: positive = debit (money out), negative = credit (money in)
     * Our convention: negative = expense, positive = income
     */
    normalizeAmount(plaidAmount) {
        // Invert sign to match our convention
        return -plaidAmount;
    }

    /**
     * AI-powered transaction categorization
     */
    async categorizeTransaction(transaction, accounts) {
        if (!openaiClient) {
            return {
                accountName: null,
                category: 'Uncategorized',
                memo: transaction.description?.substring(0, 100) || '',
                confidence: 0,
            };
        }

        try {
            const expenseAccounts = accounts
                .filter(a => a.Type === 'Expense' || a.Type === 'Income')
                .map(a => a.Name)
                .slice(0, 30);

            const prompt = `Categorize this bank transaction for a small business.

Transaction:
- Description: ${transaction.description}
- Amount: $${Math.abs(transaction.amount).toFixed(2)} ${transaction.amount < 0 ? '(expense)' : '(income)'}
- Merchant: ${transaction.merchant || 'Unknown'}
- Bank Category: ${transaction.category || 'Unknown'}

Available accounts: ${expenseAccounts.join(', ')}

Respond in JSON format:
{
  "accountName": "exact account name from list or null",
  "category": "short category name",
  "memo": "brief description for bookkeeping",
  "confidence": 0-100
}`;

            const response = await openaiClient.chat.completions.create({
                messages: [
                    { role: 'system', content: 'You are a bookkeeping assistant. Respond only with valid JSON.' },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 200,
            });

            const content = response.choices[0]?.message?.content?.trim() || '{}';
            return JSON.parse(content);
        } catch (error) {
            console.error('AI categorization error:', error.message);
            return {
                accountName: null,
                category: 'Uncategorized',
                memo: transaction.description?.substring(0, 100) || '',
                confidence: 0,
            };
        }
    }

    /**
     * Find or create a source account in chart of accounts
     */
    async findOrCreateSourceAccount(institutionName, accountName, accountType, existingAccounts) {
        const fullName = `${institutionName} - ${accountName}`;

        // Check if account exists
        const existing = existingAccounts.find(a => a.Name === fullName);
        if (existing) {
            return existing.Id;
        }

        // Determine account type
        const type = accountType === 'credit' ? 'Credit Card' : 'Bank';
        const code = `PLAID-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`.toUpperCase();

        // Create new account
        const newId = crypto.randomUUID();
        await axios.post(
            `${DAB_API_URL}/accounts`,
            {
                Id: newId,
                Code: code,
                Name: fullName,
                Type: type,
                Description: `Auto-created from Plaid bank feed`,
                IsActive: true,
            },
            { headers: { 'Content-Type': 'application/json' } }
        );

        console.log(`Created source account: ${fullName} (${type})`);
        return newId;
    }

    /**
     * Get transaction by Plaid transaction ID
     */
    async getTransactionByPlaidId(plaidTransactionId) {
        try {
            const response = await axios.get(`${DAB_API_URL}/banktransactions`);
            const transactions = response.data?.value || [];
            return transactions.find(t => t.PlaidTransactionId === plaidTransactionId) || null;
        } catch (error) {
            console.error('Failed to get transaction:', error.message);
            return null;
        }
    }

    /**
     * Save bank transaction to database
     */
    async saveBankTransaction(transaction) {
        await axios.post(
            `${DAB_API_URL}/banktransactions`,
            transaction,
            { headers: { 'Content-Type': 'application/json' } }
        );
    }

    /**
     * Update bank transaction
     */
    async updateBankTransaction(id, updates) {
        await axios.patch(
            `${DAB_API_URL}/banktransactions/Id/${id}`,
            updates,
            { headers: { 'Content-Type': 'application/json' } }
        );
    }

    /**
     * Update connection status
     */
    async updateConnectionStatus(connectionId, status, errorMessage = null) {
        await axios.patch(
            `${DAB_API_URL}/plaidconnections/Id/${connectionId}`,
            {
                SyncStatus: status,
                SyncErrorMessage: errorMessage,
                UpdatedAt: new Date().toISOString(),
            },
            { headers: { 'Content-Type': 'application/json' } }
        );
    }

    /**
     * Update connection after successful sync
     */
    async updateConnectionAfterSync(connectionId, cursor, status) {
        await axios.patch(
            `${DAB_API_URL}/plaidconnections/Id/${connectionId}`,
            {
                LastSyncCursor: cursor,
                LastSyncAt: new Date().toISOString(),
                SyncStatus: status,
                SyncErrorMessage: null,
                UpdatedAt: new Date().toISOString(),
            },
            { headers: { 'Content-Type': 'application/json' } }
        );
    }

    /**
     * Sync all active connections
     */
    async syncAllConnections() {
        const connections = await plaidService.getActiveConnections();
        const results = [];

        for (const connection of connections) {
            try {
                const result = await this.syncConnection(connection.ItemId);
                results.push(result);
            } catch (error) {
                results.push({
                    success: false,
                    itemId: connection.ItemId,
                    error: error.message,
                });
            }
        }

        return results;
    }

    /**
     * Update account balances from Plaid
     */
    async updateBalances(itemId) {
        if (!this.plaidClient) {
            throw new Error('Plaid client not initialized');
        }

        try {
            const accessToken = await plaidService.getAccessToken(itemId);

            const response = await this.plaidClient.accountsGet({
                access_token: accessToken,
            });

            const accounts = response.data.accounts;

            for (const account of accounts) {
                const plaidAccounts = await plaidService.getAllAccounts();
                const plaidAccount = plaidAccounts.find(a => a.PlaidAccountId === account.account_id);

                if (plaidAccount) {
                    await axios.patch(
                        `${DAB_API_URL}/plaidaccounts/Id/${plaidAccount.Id}`,
                        {
                            CurrentBalance: account.balances?.current,
                            AvailableBalance: account.balances?.available,
                            UpdatedAt: new Date().toISOString(),
                        },
                        { headers: { 'Content-Type': 'application/json' } }
                    );
                }
            }

            console.log(`Updated balances for ${accounts.length} accounts`);
            return { success: true, accountCount: accounts.length };
        } catch (error) {
            console.error('Failed to update balances:', error.message);
            throw error;
        }
    }
}

export const plaidSync = new PlaidSync();
export default plaidSync;
