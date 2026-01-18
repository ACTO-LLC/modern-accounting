/**
 * Journal Entry Integration Tests
 * Tests the automatic journal entry endpoints against the running API
 *
 * Prerequisites:
 * - Docker containers running (accounting-db, accounting-dab)
 * - chat-api server running on port 3001
 *
 * Run with: npm test -- tests/journal-entry-integration.test.js
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const DAB_URL = process.env.DAB_URL || 'http://localhost:5000/api';

// Test data IDs
let testCustomerId = null;
let testVendorId = null;
let testARAccountId = null;
let testAPAccountId = null;
let testRevenueAccountId = null;
let testCashAccountId = null;
let testExpenseAccountId = null;
let testInvoiceId = null;
let testBillId = null;

// Skip integration tests if API is not available
const apiAvailable = async () => {
    try {
        await axios.get(`${API_URL}/api/health`, { timeout: 2000 });
        return true;
    } catch {
        return false;
    }
};

describe.skipIf(!(await apiAvailable()))('Journal Entry Integration Tests', () => {
    beforeAll(async () => {
        // Get or create test accounts
        const accountsResp = await axios.get(`${DAB_URL}/accounts`);
        const accounts = accountsResp.data.value || [];

        // Find accounts by type
        testARAccountId = accounts.find(a => a.AccountType === 'Asset' && a.Name?.includes('Receivable'))?.Id;
        testAPAccountId = accounts.find(a => a.AccountType === 'Liability' && a.Name?.includes('Payable'))?.Id;
        testRevenueAccountId = accounts.find(a => a.AccountType === 'Income' || a.AccountType === 'Revenue')?.Id;
        testCashAccountId = accounts.find(a => a.AccountType === 'Asset' && (a.Name?.includes('Cash') || a.Name?.includes('Bank')))?.Id;
        testExpenseAccountId = accounts.find(a => a.AccountType === 'Expense')?.Id;

        // If we don't have test accounts, skip
        if (!testARAccountId || !testAPAccountId || !testRevenueAccountId || !testCashAccountId) {
            console.warn('Missing required accounts for integration tests');
        }

        // Get or create test customer
        const customersResp = await axios.get(`${DAB_URL}/customers`);
        testCustomerId = customersResp.data.value?.[0]?.Id;

        // Get or create test vendor
        const vendorsResp = await axios.get(`${DAB_URL}/vendors`);
        testVendorId = vendorsResp.data.value?.[0]?.Id;
    });

    describe('Account Defaults API', () => {
        it('should get account defaults (initially empty)', async () => {
            const response = await axios.get(`${API_URL}/api/account-defaults`);

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.defaults).toBeDefined();
            expect(response.data.accountTypes).toBeDefined();
        });

        it('should set AR account default', async () => {
            if (!testARAccountId) {
                console.warn('Skipping: No AR account available');
                return;
            }

            const response = await axios.put(`${API_URL}/api/account-defaults/AccountsReceivable`, {
                accountId: testARAccountId,
                description: 'Test AR Account'
            });

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.accountType).toBe('AccountsReceivable');
        });

        it('should set AP account default', async () => {
            if (!testAPAccountId) {
                console.warn('Skipping: No AP account available');
                return;
            }

            const response = await axios.put(`${API_URL}/api/account-defaults/AccountsPayable`, {
                accountId: testAPAccountId,
                description: 'Test AP Account'
            });

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
        });

        it('should set Revenue account default', async () => {
            if (!testRevenueAccountId) {
                console.warn('Skipping: No Revenue account available');
                return;
            }

            const response = await axios.put(`${API_URL}/api/account-defaults/DefaultRevenue`, {
                accountId: testRevenueAccountId,
                description: 'Test Revenue Account'
            });

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
        });

        it('should set Cash account default', async () => {
            if (!testCashAccountId) {
                console.warn('Skipping: No Cash account available');
                return;
            }

            const response = await axios.put(`${API_URL}/api/account-defaults/DefaultCash`, {
                accountId: testCashAccountId,
                description: 'Test Cash Account'
            });

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
        });

        it('should reject invalid account type', async () => {
            try {
                await axios.put(`${API_URL}/api/account-defaults/InvalidType`, {
                    accountId: '00000000-0000-0000-0000-000000000001'  // Use a dummy UUID
                });
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error.response.status).toBe(400);
                expect(error.response.data.error).toContain('Invalid account type');
            }
        });

        it('should get updated account defaults', async () => {
            const response = await axios.get(`${API_URL}/api/account-defaults`);

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);

            // Should have the defaults we set
            if (testARAccountId) {
                expect(response.data.defaults.AccountsReceivable).toBeDefined();
            }
        });
    });

    describe('Invoice Posting API', () => {
        beforeAll(async () => {
            if (!testCustomerId) {
                console.warn('Skipping invoice tests: No customer available');
                return;
            }

            // Create a test invoice
            const invoiceResp = await axios.post(`${DAB_URL}/invoices_write`, {
                InvoiceNumber: `TEST-${Date.now()}`,
                CustomerId: testCustomerId,
                IssueDate: new Date().toISOString().split('T')[0],
                DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                TotalAmount: 500,
                Status: 'Draft'
            });
            testInvoiceId = invoiceResp.data.Id;

            // Add invoice lines
            if (testInvoiceId) {
                await axios.post(`${DAB_URL}/invoicelines`, {
                    InvoiceId: testInvoiceId,
                    Description: 'Test Service',
                    Quantity: 1,
                    UnitPrice: 500
                });
            }
        });

        afterAll(async () => {
            // Cleanup: delete test invoice
            if (testInvoiceId) {
                try {
                    await axios.delete(`${DAB_URL}/invoices_write/Id/${testInvoiceId}`);
                } catch (e) {
                    // Ignore cleanup errors
                }
            }
        });

        it('should return 404 for non-existent invoice', async () => {
            try {
                await axios.post(`${API_URL}/api/invoices/00000000-0000-0000-0000-000000000000/post`);
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error.response.status).toBe(404);
            }
        });

        it('should post invoice and create journal entry', async () => {
            if (!testInvoiceId || !testARAccountId || !testRevenueAccountId) {
                console.warn('Skipping: Missing test data');
                return;
            }

            const response = await axios.post(`${API_URL}/api/invoices/${testInvoiceId}/post`, {
                userId: 'integration-test'
            });

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.invoiceId).toBe(testInvoiceId);
            expect(response.data.journalEntryId).toBeDefined();
            expect(response.data.totalAmount).toBe(500);

            // Verify journal entry was created
            const jeResp = await axios.get(`${DAB_URL}/journalentries/Id/${response.data.journalEntryId}`);
            expect(jeResp.data.Status).toBe('Posted');

            // Verify invoice was updated
            const invResp = await axios.get(`${DAB_URL}/invoices/Id/${testInvoiceId}`);
            expect(invResp.data.JournalEntryId).toBe(response.data.journalEntryId);
        });

        it('should reject posting already posted invoice', async () => {
            if (!testInvoiceId) {
                console.warn('Skipping: No test invoice');
                return;
            }

            try {
                await axios.post(`${API_URL}/api/invoices/${testInvoiceId}/post`);
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error.response.status).toBe(400);
                expect(error.response.data.error).toContain('already posted');
            }
        });

        it('should void posted invoice', async () => {
            if (!testInvoiceId) {
                console.warn('Skipping: No test invoice');
                return;
            }

            const response = await axios.post(`${API_URL}/api/invoices/${testInvoiceId}/void`, {
                userId: 'integration-test'
            });

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.reversingJournalEntryId).toBeDefined();

            // Verify invoice status
            const invResp = await axios.get(`${DAB_URL}/invoices/Id/${testInvoiceId}`);
            expect(invResp.data.Status).toBe('Voided');
        });
    });

    describe('Bill Posting API', () => {
        beforeAll(async () => {
            if (!testVendorId || !testExpenseAccountId) {
                console.warn('Skipping bill tests: Missing vendor or expense account');
                return;
            }

            // Create a test bill
            const billResp = await axios.post(`${DAB_URL}/bills_write`, {
                VendorId: testVendorId,
                BillNumber: `BILL-${Date.now()}`,
                BillDate: new Date().toISOString().split('T')[0],
                DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                TotalAmount: 300,
                Status: 'Open'
            });
            testBillId = billResp.data.Id;

            // Add bill lines
            if (testBillId && testExpenseAccountId) {
                await axios.post(`${DAB_URL}/billlines`, {
                    BillId: testBillId,
                    AccountId: testExpenseAccountId,
                    Description: 'Test Expense',
                    Amount: 300
                });
            }
        });

        afterAll(async () => {
            // Cleanup: delete test bill
            if (testBillId) {
                try {
                    await axios.delete(`${DAB_URL}/bills_write/Id/${testBillId}`);
                } catch (e) {
                    // Ignore cleanup errors
                }
            }
        });

        it('should post bill and create journal entry', async () => {
            if (!testBillId || !testAPAccountId || !testExpenseAccountId) {
                console.warn('Skipping: Missing test data');
                return;
            }

            const response = await axios.post(`${API_URL}/api/bills/${testBillId}/post`, {
                userId: 'integration-test'
            });

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.billId).toBe(testBillId);
            expect(response.data.journalEntryId).toBeDefined();
        });

        it('should void posted bill', async () => {
            if (!testBillId) {
                console.warn('Skipping: No test bill');
                return;
            }

            const response = await axios.post(`${API_URL}/api/bills/${testBillId}/void`, {
                userId: 'integration-test'
            });

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.reversingJournalEntryId).toBeDefined();
        });
    });

    describe('Payment API', () => {
        it('should reject payment with missing fields', async () => {
            try {
                await axios.post(`${API_URL}/api/payments`, {});
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error.response.status).toBe(400);
                expect(error.response.data.error).toContain('Missing required');
            }
        });

        it('should create payment with journal entry', async () => {
            if (!testCustomerId || !testARAccountId || !testCashAccountId) {
                console.warn('Skipping: Missing test data');
                return;
            }

            const response = await axios.post(`${API_URL}/api/payments`, {
                customerId: testCustomerId,
                paymentDate: new Date().toISOString().split('T')[0],
                totalAmount: 250,
                paymentMethod: 'Check',
                memo: 'Integration test payment',
                userId: 'integration-test'
            });

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.paymentId).toBeDefined();
            expect(response.data.paymentNumber).toMatch(/^PMT-/);
            expect(response.data.journalEntryId).toBeDefined();

            // Cleanup
            if (response.data.paymentId) {
                try {
                    await axios.delete(`${DAB_URL}/payments/Id/${response.data.paymentId}`);
                } catch (e) { /* ignore */ }
            }
        });
    });

    describe('Bill Payment API', () => {
        it('should reject bill payment with missing fields', async () => {
            try {
                await axios.post(`${API_URL}/api/billpayments`, {});
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error.response.status).toBe(400);
                expect(error.response.data.error).toContain('Missing required');
            }
        });

        it('should create bill payment with journal entry', async () => {
            if (!testVendorId || !testAPAccountId || !testCashAccountId) {
                console.warn('Skipping: Missing test data');
                return;
            }

            const response = await axios.post(`${API_URL}/api/billpayments`, {
                vendorId: testVendorId,
                paymentDate: new Date().toISOString().split('T')[0],
                totalAmount: 150,
                paymentMethod: 'ACH',
                memo: 'Integration test bill payment',
                userId: 'integration-test'
            });

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.billPaymentId).toBeDefined();
            expect(response.data.paymentNumber).toMatch(/^BP-/);
            expect(response.data.journalEntryId).toBeDefined();

            // Cleanup
            if (response.data.billPaymentId) {
                try {
                    await axios.delete(`${DAB_URL}/billpayments/Id/${response.data.billPaymentId}`);
                } catch (e) { /* ignore */ }
            }
        });
    });
});
