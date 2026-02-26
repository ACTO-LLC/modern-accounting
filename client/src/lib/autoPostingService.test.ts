/**
 * Auto-Posting Service Tests - ProjectId/ClassId propagation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the api module
vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

import api from './api';
import {
  createInvoiceJournalEntry,
  createBillJournalEntry,
  clearAccountDefaultsCache,
} from './autoPostingService';

describe('autoPostingService - ProjectId/ClassId propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAccountDefaultsCache();
  });

  function mockAccountDefaults() {
    // Mock account defaults fetch
    (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/accountdefaults')) {
        return Promise.resolve({
          data: {
            value: [
              { AccountType: 'AccountsReceivable', AccountId: 'ar-acct-id', IsActive: true },
              { AccountType: 'DefaultRevenue', AccountId: 'rev-acct-id', IsActive: true },
              { AccountType: 'AccountsPayable', AccountId: 'ap-acct-id', IsActive: true },
            ],
          },
        });
      }
      if (url.includes('/journalentries')) {
        return Promise.resolve({ data: { value: [] } });
      }
      return Promise.resolve({ data: { value: [] } });
    });
  }

  describe('createInvoiceJournalEntry', () => {
    it('should pass ProjectId and ClassId to journal entry lines', async () => {
      mockAccountDefaults();

      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { Id: 'je-123', EntryNumber: 'JE-00001' },
      });
      (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

      await createInvoiceJournalEntry(
        'inv-1',
        1000,
        0,
        'INV-001',
        'Test Customer',
        '2026-03-01',
        'test-user',
        'proj-abc',
        'cls-xyz'
      );

      // Find calls to post journal entry lines
      const postCalls = (api.post as ReturnType<typeof vi.fn>).mock.calls;
      const jeCalls = postCalls.filter(
        (c: unknown[]) => c[0] === '/journalentrylines'
      );

      expect(jeCalls.length).toBeGreaterThanOrEqual(2);

      // AR line
      expect(jeCalls[0][1]).toMatchObject({
        ProjectId: 'proj-abc',
        ClassId: 'cls-xyz',
      });

      // Revenue line
      expect(jeCalls[1][1]).toMatchObject({
        ProjectId: 'proj-abc',
        ClassId: 'cls-xyz',
      });
    });

    it('should pass null ProjectId/ClassId when not provided', async () => {
      mockAccountDefaults();

      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { Id: 'je-456', EntryNumber: 'JE-00002' },
      });
      (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

      await createInvoiceJournalEntry(
        'inv-2',
        500,
        0,
        'INV-002',
        'Customer',
        '2026-03-01',
        'test-user'
        // No projectId, no classId
      );

      const postCalls = (api.post as ReturnType<typeof vi.fn>).mock.calls;
      const jeCalls = postCalls.filter(
        (c: unknown[]) => c[0] === '/journalentrylines'
      );

      expect(jeCalls.length).toBeGreaterThanOrEqual(2);
      expect(jeCalls[0][1].ProjectId).toBeNull();
      expect(jeCalls[0][1].ClassId).toBeNull();
      expect(jeCalls[1][1].ProjectId).toBeNull();
      expect(jeCalls[1][1].ClassId).toBeNull();
    });
  });

  describe('createBillJournalEntry', () => {
    it('should propagate line-level ProjectId/ClassId to expense JE lines', async () => {
      mockAccountDefaults();

      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { Id: 'je-789', EntryNumber: 'JE-00003' },
      });
      (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

      const lineItems = [
        { AccountId: 'exp-1', Amount: 300, Description: 'Part A', ProjectId: 'proj-lineA', ClassId: 'cls-lineA' },
        { AccountId: 'exp-2', Amount: 200, Description: 'Part B', ProjectId: null, ClassId: null },
      ];

      await createBillJournalEntry(
        'bill-1',
        500,
        'BILL-001',
        'Test Vendor',
        '2026-03-01',
        lineItems,
        'test-user',
        'proj-header',
        'cls-header'
      );

      const postCalls = (api.post as ReturnType<typeof vi.fn>).mock.calls;
      const jeCalls = postCalls.filter(
        (c: unknown[]) => c[0] === '/journalentrylines'
      );

      expect(jeCalls.length).toBeGreaterThanOrEqual(3); // 2 expense + 1 AP

      // Expense line 1: uses its own project/class
      expect(jeCalls[0][1]).toMatchObject({
        ProjectId: 'proj-lineA',
        ClassId: 'cls-lineA',
      });

      // Expense line 2: falls back to header
      expect(jeCalls[1][1]).toMatchObject({
        ProjectId: 'proj-header',
        ClassId: 'cls-header',
      });

      // AP line: uses header
      expect(jeCalls[2][1]).toMatchObject({
        ProjectId: 'proj-header',
        ClassId: 'cls-header',
      });
    });

    it('should pass null when no project/class at header or line level', async () => {
      mockAccountDefaults();

      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { Id: 'je-000', EntryNumber: 'JE-00004' },
      });
      (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

      const lineItems = [
        { AccountId: 'exp-1', Amount: 100, Description: 'Item' },
      ];

      await createBillJournalEntry(
        'bill-2',
        100,
        'BILL-002',
        'Vendor',
        '2026-03-01',
        lineItems,
        'test-user'
        // No header projectId/classId
      );

      const postCalls = (api.post as ReturnType<typeof vi.fn>).mock.calls;
      const jeCalls = postCalls.filter(
        (c: unknown[]) => c[0] === '/journalentrylines'
      );

      for (const call of jeCalls) {
        expect(call[1].ProjectId).toBeNull();
        expect(call[1].ClassId).toBeNull();
      }
    });
  });
});
