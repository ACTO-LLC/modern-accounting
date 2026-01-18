/**
 * Journal Entry Service Tests
 * Tests for automatic journal entry creation (Issue #131)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JournalEntryService, ACCOUNT_TYPES } from '../journal-entry-service.js';

// Mock axios
vi.mock('axios', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        patch: vi.fn()
    }
}));

import axios from 'axios';

describe('JournalEntryService', () => {
    let service;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new JournalEntryService();
        // Clear the cache
        service.accountDefaultsCache = null;
        service.cacheExpiry = null;
    });

    describe('ACCOUNT_TYPES', () => {
        it('should have all required account types', () => {
            expect(ACCOUNT_TYPES.ACCOUNTS_RECEIVABLE).toBe('AccountsReceivable');
            expect(ACCOUNT_TYPES.ACCOUNTS_PAYABLE).toBe('AccountsPayable');
            expect(ACCOUNT_TYPES.DEFAULT_REVENUE).toBe('DefaultRevenue');
            expect(ACCOUNT_TYPES.DEFAULT_CASH).toBe('DefaultCash');
        });
    });

    describe('getAccountDefaults', () => {
        it('should fetch and cache account defaults', async () => {
            axios.get.mockResolvedValueOnce({
                data: {
                    value: [
                        { AccountType: 'AccountsReceivable', AccountId: 'ar-123', IsActive: true },
                        { AccountType: 'AccountsPayable', AccountId: 'ap-456', IsActive: true }
                    ]
                }
            });

            const defaults = await service.getAccountDefaults();

            expect(defaults.AccountsReceivable.accountId).toBe('ar-123');
            expect(defaults.AccountsPayable.accountId).toBe('ap-456');
            expect(axios.get).toHaveBeenCalledTimes(1);
        });

        it('should use cached values on subsequent calls', async () => {
            axios.get.mockResolvedValueOnce({
                data: {
                    value: [
                        { AccountType: 'AccountsReceivable', AccountId: 'ar-123', IsActive: true }
                    ]
                }
            });

            await service.getAccountDefaults();
            await service.getAccountDefaults();

            // Should only call API once due to caching
            expect(axios.get).toHaveBeenCalledTimes(1);
        });

        it('should filter out inactive defaults', async () => {
            axios.get.mockResolvedValueOnce({
                data: {
                    value: [
                        { AccountType: 'AccountsReceivable', AccountId: 'ar-123', IsActive: true },
                        { AccountType: 'AccountsPayable', AccountId: 'ap-456', IsActive: false }
                    ]
                }
            });

            const defaults = await service.getAccountDefaults();

            expect(defaults.AccountsReceivable).toBeDefined();
            expect(defaults.AccountsPayable).toBeUndefined();
        });
    });

    describe('postInvoice', () => {
        it('should throw error if invoice not found', async () => {
            axios.get.mockResolvedValueOnce({ data: null });

            await expect(service.postInvoice('invalid-id'))
                .rejects.toThrow('Invoice invalid-id not found');
        });

        it('should throw error if invoice already posted', async () => {
            axios.get.mockResolvedValueOnce({
                data: { Id: 'inv-1', JournalEntryId: 'existing-je' }
            });

            await expect(service.postInvoice('inv-1'))
                .rejects.toThrow('Invoice inv-1 is already posted');
        });

        it('should throw error if invoice has no lines', async () => {
            axios.get
                .mockResolvedValueOnce({
                    data: { Id: 'inv-1', JournalEntryId: null, InvoiceNumber: 'INV-001' }
                })
                .mockResolvedValueOnce({ data: { value: [] } });

            await expect(service.postInvoice('inv-1'))
                .rejects.toThrow('Invoice inv-1 has no lines');
        });

        it('should throw error if AR default not configured', async () => {
            axios.get
                .mockResolvedValueOnce({
                    data: { Id: 'inv-1', JournalEntryId: null, InvoiceNumber: 'INV-001' }
                })
                .mockResolvedValueOnce({ data: { value: [{ Amount: 100 }] } })
                .mockResolvedValueOnce({ data: { value: [] } }); // No defaults

            await expect(service.postInvoice('inv-1'))
                .rejects.toThrow('Accounts Receivable default account not configured');
        });

        it('should create journal entry for valid invoice', async () => {
            // Mock invoice fetch
            axios.get
                .mockResolvedValueOnce({
                    data: {
                        Id: 'inv-1',
                        JournalEntryId: null,
                        InvoiceNumber: 'INV-001',
                        IssueDate: '2024-01-15',
                        TotalAmount: 1000,
                        CustomerName: 'Test Customer'
                    }
                })
                // Mock invoice lines
                .mockResolvedValueOnce({
                    data: {
                        value: [
                            { Id: 'line-1', Amount: 600, Description: 'Service A' },
                            { Id: 'line-2', Amount: 400, Description: 'Service B' }
                        ]
                    }
                })
                // Mock account defaults
                .mockResolvedValueOnce({
                    data: {
                        value: [
                            { AccountType: 'AccountsReceivable', AccountId: 'ar-123', IsActive: true },
                            { AccountType: 'DefaultRevenue', AccountId: 'rev-456', IsActive: true }
                        ]
                    }
                });

            axios.post.mockResolvedValue({ data: { Id: 'new-je' } });
            axios.patch.mockResolvedValue({ data: {} });

            const result = await service.postInvoice('inv-1', 'test-user');

            expect(result.invoiceId).toBe('inv-1');
            expect(result.journalEntryId).toBeDefined();
            expect(result.totalAmount).toBe(1000);
            expect(result.linesCount).toBe(2);

            // Verify journal entry created
            expect(axios.post).toHaveBeenCalledWith(
                expect.stringContaining('/journalentries'),
                expect.objectContaining({
                    Description: expect.stringContaining('Invoice INV-001'),
                    Status: 'Posted'
                })
            );

            // Verify invoice updated
            expect(axios.patch).toHaveBeenCalledWith(
                expect.stringContaining('/invoices_write/Id/inv-1'),
                expect.objectContaining({
                    Status: 'Posted',
                    PostedBy: 'test-user'
                })
            );
        });
    });

    describe('postBill', () => {
        it('should throw error if bill not found', async () => {
            axios.get.mockResolvedValueOnce({ data: null });

            await expect(service.postBill('invalid-id'))
                .rejects.toThrow('Bill invalid-id not found');
        });

        it('should throw error if bill already posted', async () => {
            axios.get.mockResolvedValueOnce({
                data: { Id: 'bill-1', JournalEntryId: 'existing-je' }
            });

            await expect(service.postBill('bill-1'))
                .rejects.toThrow('Bill bill-1 is already posted');
        });

        it('should throw error if bill line missing account', async () => {
            axios.get
                .mockResolvedValueOnce({
                    data: { Id: 'bill-1', JournalEntryId: null, BillNumber: 'BILL-001', TotalAmount: 500 }
                })
                .mockResolvedValueOnce({
                    data: { value: [{ Id: 'line-1', Amount: 500, AccountId: null }] }
                })
                .mockResolvedValueOnce({
                    data: {
                        value: [{ AccountType: 'AccountsPayable', AccountId: 'ap-123', IsActive: true }]
                    }
                });

            await expect(service.postBill('bill-1'))
                .rejects.toThrow('Bill line line-1 is missing an expense account');
        });
    });

    describe('voidInvoice', () => {
        it('should throw error if invoice not posted', async () => {
            axios.get.mockResolvedValueOnce({
                data: { Id: 'inv-1', JournalEntryId: null }
            });

            await expect(service.voidInvoice('inv-1'))
                .rejects.toThrow('Invoice inv-1 is not posted');
        });

        it('should throw error if invoice already voided', async () => {
            axios.get.mockResolvedValueOnce({
                data: { Id: 'inv-1', JournalEntryId: 'je-1', Status: 'Voided' }
            });

            await expect(service.voidInvoice('inv-1'))
                .rejects.toThrow('Invoice inv-1 is already voided');
        });

        it('should create reversing journal entry', async () => {
            axios.get
                .mockResolvedValueOnce({
                    data: {
                        Id: 'inv-1',
                        JournalEntryId: 'je-1',
                        InvoiceNumber: 'INV-001',
                        Status: 'Posted'
                    }
                })
                .mockResolvedValueOnce({
                    data: {
                        value: [
                            { AccountId: 'ar-123', Debit: 1000, Credit: 0, Description: 'AR' },
                            { AccountId: 'rev-456', Debit: 0, Credit: 1000, Description: 'Revenue' }
                        ]
                    }
                });

            axios.post.mockResolvedValue({ data: {} });
            axios.patch.mockResolvedValue({ data: {} });

            const result = await service.voidInvoice('inv-1', 'test-user');

            expect(result.invoiceId).toBe('inv-1');
            expect(result.originalJournalEntryId).toBe('je-1');
            expect(result.reversingJournalEntryId).toBeDefined();

            // Verify reversing entries swap debits/credits
            const postCalls = axios.post.mock.calls;
            const reversedLines = postCalls.filter(c => c[0].includes('/journalentrylines'));

            // First line should have Credit where original had Debit
            expect(reversedLines[0][1]).toMatchObject({
                Debit: 0,
                Credit: 1000
            });
            // Second line should have Debit where original had Credit
            expect(reversedLines[1][1]).toMatchObject({
                Debit: 1000,
                Credit: 0
            });
        });
    });

    describe('recordInvoicePayment', () => {
        it('should throw error if required fields missing', async () => {
            await expect(service.recordInvoicePayment({}))
                .rejects.toThrow('Missing required payment fields');
        });

        it('should throw error if AR default not configured', async () => {
            axios.get.mockResolvedValueOnce({ data: { value: [] } });

            await expect(service.recordInvoicePayment({
                customerId: 'cust-1',
                paymentDate: '2024-01-15',
                totalAmount: 500
            })).rejects.toThrow('Accounts Receivable default account not configured');
        });

        it('should create payment with journal entry', async () => {
            axios.get
                .mockResolvedValueOnce({
                    data: {
                        value: [
                            { AccountType: 'AccountsReceivable', AccountId: 'ar-123', IsActive: true },
                            { AccountType: 'DefaultCash', AccountId: 'cash-789', IsActive: true }
                        ]
                    }
                })
                .mockResolvedValueOnce({ data: { Name: 'Test Customer' } });

            axios.post.mockResolvedValue({ data: { Id: 'new-payment' } });
            axios.patch.mockResolvedValue({ data: {} });

            const result = await service.recordInvoicePayment({
                customerId: 'cust-1',
                paymentDate: '2024-01-15',
                totalAmount: 500,
                paymentMethod: 'Check',
                applications: [{ invoiceId: 'inv-1', amountApplied: 500 }]
            }, 'test-user');

            expect(result.paymentId).toBeDefined();
            expect(result.paymentNumber).toMatch(/^PMT-/);
            expect(result.journalEntryId).toBeDefined();
            expect(result.totalAmount).toBe(500);
            expect(result.applicationsCount).toBe(1);

            // Verify payment created
            expect(axios.post).toHaveBeenCalledWith(
                expect.stringContaining('/payments'),
                expect.objectContaining({
                    CustomerId: 'cust-1',
                    TotalAmount: 500
                })
            );

            // Verify journal entry created with DR Cash, CR AR
            const jeCalls = axios.post.mock.calls.filter(c => c[0].includes('/journalentrylines'));
            expect(jeCalls.length).toBe(2);
        });
    });

    describe('recordBillPayment', () => {
        it('should throw error if required fields missing', async () => {
            await expect(service.recordBillPayment({}))
                .rejects.toThrow('Missing required payment fields');
        });

        it('should create bill payment with journal entry', async () => {
            axios.get
                .mockResolvedValueOnce({
                    data: {
                        value: [
                            { AccountType: 'AccountsPayable', AccountId: 'ap-456', IsActive: true },
                            { AccountType: 'DefaultCash', AccountId: 'cash-789', IsActive: true }
                        ]
                    }
                })
                .mockResolvedValueOnce({ data: { Name: 'Test Vendor' } });

            axios.post.mockResolvedValue({ data: { Id: 'new-bp' } });
            axios.patch.mockResolvedValue({ data: {} });

            const result = await service.recordBillPayment({
                vendorId: 'vendor-1',
                paymentDate: '2024-01-15',
                totalAmount: 300,
                paymentMethod: 'ACH',
                applications: [{ billId: 'bill-1', amountApplied: 300 }]
            }, 'test-user');

            expect(result.billPaymentId).toBeDefined();
            expect(result.paymentNumber).toMatch(/^BP-/);
            expect(result.journalEntryId).toBeDefined();
            expect(result.totalAmount).toBe(300);
        });
    });
});
