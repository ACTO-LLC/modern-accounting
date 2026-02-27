/**
 * Plaid Service Tests
 * Tests for PlaidService class (plaid-service.js)
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
    })),
    PlaidEnvironments: { sandbox: 'https://sandbox.plaid.com', production: 'https://production.plaid.com' },
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

import axios from 'axios';

// Set env vars before importing the module
process.env.PLAID_CLIENT_ID = 'test-client-id';
process.env.PLAID_SECRET = 'test-secret';
process.env.PLAID_ENV = 'sandbox';

// Dynamic import to ensure mocks are in place
const { plaidService } = await import('../plaid-service.js');

describe('PlaidService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('encryptToken / decryptToken', () => {
        it('should round-trip encrypt and decrypt a token', () => {
            const originalToken = 'access-sandbox-abc123def456';
            const encrypted = plaidService.encryptToken(originalToken);
            const decrypted = plaidService.decryptToken(encrypted);

            expect(decrypted).toBe(originalToken);
        });

        it('should produce different ciphertexts for the same token (random IV)', () => {
            const token = 'access-sandbox-xyz789';
            const encrypted1 = plaidService.encryptToken(token);
            const encrypted2 = plaidService.encryptToken(token);

            expect(encrypted1).not.toBe(encrypted2);
            // Both should decrypt to the same value
            expect(plaidService.decryptToken(encrypted1)).toBe(token);
            expect(plaidService.decryptToken(encrypted2)).toBe(token);
        });

        it('should produce encrypted format with IV:ciphertext', () => {
            const encrypted = plaidService.encryptToken('test-token');
            const parts = encrypted.split(':');

            expect(parts.length).toBe(2);
            // IV should be 32 hex chars (16 bytes)
            expect(parts[0]).toMatch(/^[a-f0-9]{32}$/);
            // Ciphertext should be hex
            expect(parts[1]).toMatch(/^[a-f0-9]+$/);
        });
    });

    describe('createLinkToken', () => {
        it('should return link token on success', async () => {
            plaidService.client.linkTokenCreate.mockResolvedValueOnce({
                data: {
                    link_token: 'link-sandbox-token-123',
                    expiration: '2026-03-01T00:00:00Z',
                },
            });

            const result = await plaidService.createLinkToken('user-123');

            expect(result.success).toBe(true);
            expect(result.linkToken).toBe('link-sandbox-token-123');
            expect(result.expiration).toBe('2026-03-01T00:00:00Z');
            expect(plaidService.client.linkTokenCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    user: { client_user_id: 'user-123' },
                    client_name: 'Modern Accounting',
                })
            );
        });

        it('should use default-user when no userId provided', async () => {
            plaidService.client.linkTokenCreate.mockResolvedValueOnce({
                data: { link_token: 'link-token', expiration: '2026-03-01T00:00:00Z' },
            });

            await plaidService.createLinkToken();

            expect(plaidService.client.linkTokenCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    user: { client_user_id: 'default-user' },
                })
            );
        });

        it('should throw on Plaid API error', async () => {
            plaidService.client.linkTokenCreate.mockRejectedValueOnce({
                response: { data: { error_message: 'INVALID_CLIENT_ID' } },
                message: 'Request failed',
            });

            await expect(plaidService.createLinkToken('user-1'))
                .rejects.toThrow('Failed to create link token');
        });

        it('should throw when client is not initialized', async () => {
            const savedClient = plaidService.client;
            plaidService.client = null;

            await expect(plaidService.createLinkToken('user-1'))
                .rejects.toThrow('Plaid client not initialized');

            plaidService.client = savedClient;
        });
    });

    describe('getActiveConnections', () => {
        it('should return only active connections', async () => {
            axios.get.mockResolvedValueOnce({
                data: {
                    value: [
                        { Id: 'conn-1', ItemId: 'item-1', IsActive: true, InstitutionName: 'Chase' },
                        { Id: 'conn-2', ItemId: 'item-2', IsActive: false, InstitutionName: 'Wells Fargo' },
                        { Id: 'conn-3', ItemId: 'item-3', IsActive: true, InstitutionName: 'BofA' },
                    ],
                },
            });

            const result = await plaidService.getActiveConnections();

            expect(result).toHaveLength(2);
            expect(result[0].InstitutionName).toBe('Chase');
            expect(result[1].InstitutionName).toBe('BofA');
        });

        it('should return empty array on API failure', async () => {
            axios.get.mockRejectedValueOnce(new Error('Network error'));

            const result = await plaidService.getActiveConnections();

            expect(result).toEqual([]);
        });

        it('should return empty array when no connections exist', async () => {
            axios.get.mockResolvedValueOnce({ data: { value: [] } });

            const result = await plaidService.getActiveConnections();

            expect(result).toEqual([]);
        });
    });

    describe('getConnectionByItemId', () => {
        it('should return connection matching itemId', async () => {
            axios.get.mockResolvedValueOnce({
                data: {
                    value: [
                        { Id: 'conn-1', ItemId: 'item-abc', InstitutionName: 'Chase' },
                        { Id: 'conn-2', ItemId: 'item-xyz', InstitutionName: 'BofA' },
                    ],
                },
            });

            const result = await plaidService.getConnectionByItemId('item-abc');

            expect(result).toBeTruthy();
            expect(result.Id).toBe('conn-1');
            expect(result.InstitutionName).toBe('Chase');
        });

        it('should return null when itemId not found', async () => {
            axios.get.mockResolvedValueOnce({
                data: { value: [{ Id: 'conn-1', ItemId: 'item-other' }] },
            });

            const result = await plaidService.getConnectionByItemId('item-missing');

            expect(result).toBeNull();
        });

        it('should return null on API error', async () => {
            axios.get.mockRejectedValueOnce(new Error('Connection refused'));

            const result = await plaidService.getConnectionByItemId('item-1');

            expect(result).toBeNull();
        });
    });

    describe('disconnect', () => {
        it('should disconnect and mark connection inactive', async () => {
            // getConnectionByItemId call
            axios.get.mockResolvedValueOnce({
                data: {
                    value: [{
                        Id: 'conn-1',
                        ItemId: 'item-disconnect',
                        AccessToken: plaidService.encryptToken('access-test'),
                        IsActive: true,
                    }],
                },
            });

            plaidService.client.itemRemove.mockResolvedValueOnce({ data: {} });

            // Patch connection inactive
            axios.patch.mockResolvedValueOnce({ data: {} });

            // getAccountsByConnectionId call
            axios.get.mockResolvedValueOnce({
                data: {
                    value: [
                        { Id: 'acct-1', PlaidConnectionId: 'conn-1', IsActive: true },
                    ],
                },
            });

            // Patch account inactive
            axios.patch.mockResolvedValueOnce({ data: {} });

            const result = await plaidService.disconnect('item-disconnect');

            expect(result.success).toBe(true);
            expect(plaidService.client.itemRemove).toHaveBeenCalled();
            // Should patch connection to IsActive: false
            expect(axios.patch).toHaveBeenCalledWith(
                expect.stringContaining('/plaidconnections/Id/conn-1'),
                expect.objectContaining({ IsActive: false }),
                expect.any(Object)
            );
        });

        it('should return error when connection not found', async () => {
            axios.get.mockResolvedValueOnce({ data: { value: [] } });

            const result = await plaidService.disconnect('item-missing');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Connection not found');
        });

        it('should still deactivate locally even if Plaid removal fails', async () => {
            axios.get.mockResolvedValueOnce({
                data: {
                    value: [{
                        Id: 'conn-1',
                        ItemId: 'item-fail',
                        AccessToken: plaidService.encryptToken('access-test'),
                        IsActive: true,
                    }],
                },
            });

            plaidService.client.itemRemove.mockRejectedValueOnce(new Error('Plaid error'));
            axios.patch.mockResolvedValue({ data: {} });
            // getAccountsByConnectionId
            axios.get.mockResolvedValueOnce({ data: { value: [] } });

            const result = await plaidService.disconnect('item-fail');

            expect(result.success).toBe(true);
            // Connection should still be marked inactive
            expect(axios.patch).toHaveBeenCalledWith(
                expect.stringContaining('/plaidconnections/Id/conn-1'),
                expect.objectContaining({ IsActive: false }),
                expect.any(Object)
            );
        });
    });

    describe('validateConnection', () => {
        it('should return valid when Plaid itemGet succeeds', async () => {
            // getConnectionByItemId
            axios.get.mockResolvedValueOnce({
                data: {
                    value: [{
                        Id: 'conn-1',
                        ItemId: 'item-valid',
                        AccessToken: plaidService.encryptToken('access-valid'),
                        IsActive: true,
                        InstitutionName: 'Chase',
                    }],
                },
            });

            plaidService.client.itemGet.mockResolvedValueOnce({
                data: { item: { item_id: 'item-valid' } },
            });

            const result = await plaidService.validateConnection('item-valid');

            expect(result.valid).toBe(true);
            expect(result.institutionName).toBe('Chase');
        });

        it('should return invalid when connection not found', async () => {
            axios.get.mockResolvedValueOnce({ data: { value: [] } });

            const result = await plaidService.validateConnection('item-missing');

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Connection not found or inactive');
        });

        it('should return invalid with needsReauth on ITEM_LOGIN_REQUIRED', async () => {
            // getConnectionByItemId (first call in validateConnection)
            axios.get.mockResolvedValueOnce({
                data: {
                    value: [{
                        Id: 'conn-1',
                        ItemId: 'item-reauth',
                        AccessToken: plaidService.encryptToken('access-expired'),
                        IsActive: true,
                        InstitutionName: 'Chase',
                    }],
                },
            });

            plaidService.client.itemGet.mockRejectedValueOnce({
                response: {
                    data: {
                        error_code: 'ITEM_LOGIN_REQUIRED',
                        error_message: 'the login details have changed',
                    },
                },
                message: 'Request failed',
            });

            // getConnectionByItemId (second call in error handler)
            axios.get.mockResolvedValueOnce({
                data: {
                    value: [{
                        Id: 'conn-1',
                        ItemId: 'item-reauth',
                        AccessToken: plaidService.encryptToken('access-expired'),
                        IsActive: true,
                    }],
                },
            });

            // patch to update status
            axios.patch.mockResolvedValueOnce({ data: {} });

            const result = await plaidService.validateConnection('item-reauth');

            expect(result.valid).toBe(false);
            expect(result.needsReauth).toBe(true);
        });

        it('should return invalid when client is not initialized', async () => {
            const savedClient = plaidService.client;
            plaidService.client = null;

            const result = await plaidService.validateConnection('item-1');

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Plaid client not initialized');

            plaidService.client = savedClient;
        });
    });
});
