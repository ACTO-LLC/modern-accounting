/**
 * Plaid Sync Service Tests
 * Tests for PlaidSync class (plaid-sync.js)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock plaid SDK
vi.mock('plaid', () => ({
    Configuration: vi.fn(),
    PlaidApi: vi.fn(() => ({
        linkTokenCreate: vi.fn(),
        itemPublicTokenExchange: vi.fn(),
        accountsGet: vi.fn(),
        itemRemove: vi.fn(),
        itemGet: vi.fn(),
        transactionsSync: vi.fn(),
    })),
    PlaidEnvironments: { sandbox: 'https://sandbox.plaid.com' },
    Products: { Transactions: 'transactions', Auth: 'auth' },
    CountryCode: { Us: 'US' },
}));

// Mock axios
vi.mock('axios', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        patch: vi.fn(),
    }
}));

// Mock @azure/identity
vi.mock('@azure/identity', () => ({
    DefaultAzureCredential: vi.fn(),
}));

// Mock openai (prevent real client initialization)
vi.mock('openai', () => ({
    OpenAI: vi.fn(),
}));

import axios from 'axios';

// Set env vars before importing
process.env.PLAID_CLIENT_ID = 'test-client-id';
process.env.PLAID_SECRET = 'test-secret';
process.env.PLAID_ENV = 'sandbox';

const { plaidSync } = await import('../plaid-sync.js');
const { plaidService } = await import('../plaid-service.js');

describe('PlaidSync', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('normalizeAmount', () => {
        it('should invert positive Plaid amount (debit) to negative', () => {
            expect(plaidSync.normalizeAmount(50.00)).toBe(-50.00);
        });

        it('should invert negative Plaid amount (credit) to positive', () => {
            expect(plaidSync.normalizeAmount(-100.50)).toBe(100.50);
        });

        it('should handle zero', () => {
            expect(plaidSync.normalizeAmount(0)).toBe(-0);
        });

        it('should handle small decimal amounts', () => {
            expect(plaidSync.normalizeAmount(0.01)).toBe(-0.01);
        });
    });

    describe('saveBankTransaction', () => {
        it('should POST transaction to DAB API', async () => {
            axios.post.mockResolvedValueOnce({ data: {} });

            const transaction = {
                Id: 'tx-123',
                SourceType: 'Bank',
                SourceName: 'Chase - Checking',
                Amount: -42.50,
                Description: 'Amazon.com',
                Status: 'Pending',
            };

            await plaidSync.saveBankTransaction(transaction);

            expect(axios.post).toHaveBeenCalledWith(
                expect.stringContaining('/banktransactions'),
                transaction,
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json',
                        'X-MS-API-ROLE': 'Service',
                    }),
                })
            );
        });

        it('should throw on DAB API error', async () => {
            axios.post.mockRejectedValueOnce(new Error('DAB connection refused'));

            await expect(
                plaidSync.saveBankTransaction({ Id: 'tx-fail' })
            ).rejects.toThrow('DAB connection refused');
        });
    });

    describe('updateBankTransaction', () => {
        it('should PATCH transaction updates to DAB API', async () => {
            axios.patch.mockResolvedValueOnce({ data: {} });

            await plaidSync.updateBankTransaction('tx-123', {
                Status: 'Removed',
            });

            expect(axios.patch).toHaveBeenCalledWith(
                expect.stringContaining('/banktransactions/Id/tx-123'),
                { Status: 'Removed' },
                expect.any(Object)
            );
        });
    });

    describe('syncConnection', () => {
        it('should process added, modified, and removed transactions', async () => {
            const encryptedToken = plaidService.encryptToken('access-sync');
            const connData = {
                Id: 'conn-1',
                ItemId: 'item-sync',
                AccessToken: encryptedToken,
                IsActive: true,
                LastSyncCursor: null,
                InstitutionName: 'Chase',
            };

            // Mock getConnectionByItemId (called in syncConnection)
            axios.get.mockResolvedValueOnce({ data: { value: [connData] } });

            // updateConnectionStatus PATCH
            axios.patch.mockResolvedValue({ data: {} });

            // getAccessToken -> getConnectionByItemId (second call)
            axios.get.mockResolvedValueOnce({ data: { value: [connData] } });

            // Mock Plaid transactionsSync
            plaidSync.plaidClient = plaidService.client;
            plaidService.client.transactionsSync = vi.fn().mockResolvedValueOnce({
                data: {
                    added: [
                        {
                            transaction_id: 'plaid-tx-1',
                            account_id: 'plaid-acct-1',
                            date: '2026-02-20',
                            authorized_date: '2026-02-19',
                            amount: 25.00,
                            name: 'Starbucks',
                            merchant_name: 'Starbucks',
                            payment_channel: 'in store',
                            personal_finance_category: { primary: 'FOOD_AND_DRINK' },
                        },
                    ],
                    modified: [],
                    removed: [],
                    next_cursor: 'cursor-abc',
                    has_more: false,
                },
            });

            // Mock processAddedTransactions dependencies
            axios.get
                // processAddedTransactions -> get accounts
                .mockResolvedValueOnce({ data: { value: [{ Id: 'acct-exp', Name: 'Food & Drink', Type: 'Expense' }] } })
                // getAccountsByConnectionId
                .mockResolvedValueOnce({
                    data: {
                        value: [{
                            Id: 'pa-1',
                            PlaidAccountId: 'plaid-acct-1',
                            PlaidConnectionId: 'conn-1',
                            AccountName: 'Checking',
                            AccountType: 'depository',
                            LinkedAccountId: 'ledger-bank-1',
                            IsActive: true,
                        }],
                    },
                })
                // getTransactionByPlaidId (check existing)
                .mockResolvedValueOnce({ data: { value: [] } })
                // checkForDuplicates
                .mockResolvedValueOnce({ data: { value: [] } })
                // checkCategorizationRules
                .mockResolvedValueOnce({ data: { value: [] } });

            // saveBankTransaction POST
            axios.post.mockResolvedValueOnce({ data: {} });

            const result = await plaidSync.syncConnection('item-sync');

            expect(result.success).toBe(true);
            expect(result.added).toBe(1);
            expect(result.modified).toBe(0);
            expect(result.removed).toBe(0);
        });

        it('should throw when connection not found', async () => {
            axios.get.mockResolvedValueOnce({ data: { value: [] } });

            await expect(plaidSync.syncConnection('item-missing'))
                .rejects.toThrow('Connection not found or inactive');
        });

        it('should throw when Plaid client not initialized', async () => {
            const savedClient = plaidSync.plaidClient;
            plaidSync.plaidClient = null;

            await expect(plaidSync.syncConnection('item-1'))
                .rejects.toThrow('Plaid client not initialized');

            plaidSync.plaidClient = savedClient;
        });

        it('should update connection status to Error on sync failure', async () => {
            const encryptedToken = plaidService.encryptToken('access-err');
            const connData = {
                Id: 'conn-err',
                ItemId: 'item-error',
                AccessToken: encryptedToken,
                IsActive: true,
                LastSyncCursor: null,
                InstitutionName: 'BofA',
            };

            // getConnectionByItemId (syncConnection)
            axios.get.mockResolvedValueOnce({ data: { value: [connData] } });

            axios.patch.mockResolvedValue({ data: {} });

            // getAccessToken -> getConnectionByItemId (second call)
            axios.get.mockResolvedValueOnce({ data: { value: [connData] } });

            // Plaid transactionsSync fails
            plaidSync.plaidClient = plaidService.client;
            plaidService.client.transactionsSync = vi.fn().mockRejectedValueOnce(
                new Error('PLAID_API_ERROR')
            );

            await expect(plaidSync.syncConnection('item-error'))
                .rejects.toThrow('PLAID_API_ERROR');

            // Should have called updateConnectionStatus with 'Error'
            expect(axios.patch).toHaveBeenCalledWith(
                expect.stringContaining('/plaidconnections/Id/conn-err'),
                expect.objectContaining({
                    SyncStatus: 'Error',
                    SyncErrorMessage: 'PLAID_API_ERROR',
                }),
                expect.any(Object)
            );
        });
    });

    describe('checkCategorizationRules', () => {
        it('should return matching rule for contains match', async () => {
            axios.get.mockResolvedValueOnce({
                data: {
                    value: [
                        {
                            Id: 'rule-1',
                            MatchField: 'Description',
                            MatchType: 'contains',
                            MatchValue: 'starbucks',
                            AccountId: 'acct-food',
                            Category: 'Food & Drink',
                            IsActive: true,
                            Priority: 1,
                            HitCount: 5,
                        },
                    ],
                },
            });

            // Mock the hit count update (fire and forget)
            axios.patch.mockResolvedValueOnce({ data: {} });

            const result = await plaidSync.checkCategorizationRules('STARBUCKS COFFEE #123', null);

            expect(result).toBeTruthy();
            expect(result.AccountId).toBe('acct-food');
            expect(result.Category).toBe('Food & Drink');
        });

        it('should return null when no rules match', async () => {
            axios.get.mockResolvedValueOnce({
                data: {
                    value: [
                        {
                            Id: 'rule-1',
                            MatchField: 'Description',
                            MatchType: 'exact',
                            MatchValue: 'starbucks',
                            AccountId: 'acct-food',
                            IsActive: true,
                            Priority: 1,
                        },
                    ],
                },
            });

            const result = await plaidSync.checkCategorizationRules('Amazon.com purchase', null);

            expect(result).toBeNull();
        });

        it('should return null on API error (graceful degradation)', async () => {
            axios.get.mockRejectedValueOnce({ response: { status: 500 }, message: 'Server error' });

            const result = await plaidSync.checkCategorizationRules('test', null);

            expect(result).toBeNull();
        });

        it('should return null on 404 (entity not created yet)', async () => {
            axios.get.mockRejectedValueOnce({ response: { status: 404 }, message: 'Not found' });

            const result = await plaidSync.checkCategorizationRules('test', null);

            expect(result).toBeNull();
        });
    });

    describe('getTransactionByPlaidId', () => {
        it('should return existing transaction', async () => {
            axios.get.mockResolvedValueOnce({
                data: {
                    value: [{
                        Id: 'bt-1',
                        PlaidTransactionId: 'plaid-tx-abc',
                        Amount: -25.00,
                    }],
                },
            });

            const result = await plaidSync.getTransactionByPlaidId('plaid-tx-abc');

            expect(result).toBeTruthy();
            expect(result.Id).toBe('bt-1');
            expect(axios.get).toHaveBeenCalledWith(
                expect.stringContaining('/banktransactions'),
                expect.objectContaining({
                    params: expect.objectContaining({
                        $filter: "PlaidTransactionId eq 'plaid-tx-abc'",
                    }),
                })
            );
        });

        it('should return null when not found', async () => {
            axios.get.mockResolvedValueOnce({ data: { value: [] } });

            const result = await plaidSync.getTransactionByPlaidId('plaid-tx-missing');

            expect(result).toBeNull();
        });

        it('should return null on error', async () => {
            axios.get.mockRejectedValueOnce(new Error('Network error'));

            const result = await plaidSync.getTransactionByPlaidId('plaid-tx-err');

            expect(result).toBeNull();
        });
    });

    describe('processRemovedTransactions', () => {
        it('should mark existing transactions as Removed', async () => {
            // getTransactionByPlaidId
            axios.get.mockResolvedValueOnce({
                data: { value: [{ Id: 'bt-remove', PlaidTransactionId: 'plaid-rm-1' }] },
            });

            axios.patch.mockResolvedValueOnce({ data: {} });

            const count = await plaidSync.processRemovedTransactions([
                { transaction_id: 'plaid-rm-1' },
            ]);

            expect(count).toBe(1);
            expect(axios.patch).toHaveBeenCalledWith(
                expect.stringContaining('/banktransactions/Id/bt-remove'),
                { Status: 'Removed' },
                expect.any(Object)
            );
        });

        it('should skip transactions not found in database', async () => {
            axios.get.mockResolvedValueOnce({ data: { value: [] } });

            const count = await plaidSync.processRemovedTransactions([
                { transaction_id: 'plaid-rm-missing' },
            ]);

            expect(count).toBe(0);
            expect(axios.patch).not.toHaveBeenCalled();
        });
    });
});
