import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ReportHeader, ReportTable, formatCurrency, exportToCSV } from '../../components/reports';
import type { ReportColumn, ReportRow } from '../../components/reports';

interface Account { Id: string; Name: string; Type: string; Subtype: string | null; }
interface JournalEntry { Id: string; TransactionDate: string; }
interface JournalEntryLine { Id: string; JournalEntryId: string; AccountId: string; Debit: number; Credit: number; }

export default function BalanceSheet() {
  const today = new Date();
  const [asOfDate, setAsOfDate] = useState(today.toISOString().split('T')[0]);

  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: async () => { const r = await fetch('/api/accounts'); const d = await r.json(); return d.value as Account[]; } });
  const { data: journalEntries } = useQuery({ queryKey: ['journal-entries'], queryFn: async () => { const r = await fetch('/api/journalentries'); const d = await r.json(); return d.value as JournalEntry[]; } });
  const { data: lines } = useQuery({ queryKey: ['journal-entry-lines'], queryFn: async () => { const r = await fetch('/api/journalentrylines'); const d = await r.json(); return d.value as JournalEntryLine[]; } });

  const reportData = useMemo(() => {
    if (!accounts || !journalEntries || !lines) return { assetAccounts: [], liabilityAccounts: [], equityAccounts: [], totalAssets: 0, totalLiabilities: 0, totalEquity: 0, retainedEarnings: 0 };
    const accountMap = new Map(accounts.map(a => [a.Id, a]));
    const entryDateMap = new Map(journalEntries.map(e => [e.Id, new Date(e.TransactionDate)]));
    const end = new Date(asOfDate); end.setHours(23, 59, 59, 999);
    const filteredLines = lines.filter(line => { const date = entryDateMap.get(line.JournalEntryId); return date && date <= end; });
    const accountTotals = new Map<string, number>(); let retainedEarnings = 0;
    filteredLines.forEach(line => { const account = accountMap.get(line.AccountId); if (!account) return; const current = accountTotals.get(line.AccountId) || 0; switch (account.Type) { case 'Asset': accountTotals.set(line.AccountId, current + (line.Debit - line.Credit)); break; case 'Liability': accountTotals.set(line.AccountId, current + (line.Credit - line.Debit)); break; case 'Equity': accountTotals.set(line.AccountId, current + (line.Credit - line.Debit)); break; case 'Revenue': retainedEarnings += line.Credit - line.Debit; break; case 'Expense': retainedEarnings -= line.Debit - line.Credit; break; } });
    const assetAccounts: { account: Account; balance: number }[] = []; const liabilityAccounts: { account: Account; balance: number }[] = []; const equityAccounts: { account: Account; balance: number }[] = [];
    accountTotals.forEach((balance, accountId) => { const account = accountMap.get(accountId); if (!account || balance === 0) return; switch (account.Type) { case 'Asset': assetAccounts.push({ account, balance }); break; case 'Liability': liabilityAccounts.push({ account, balance }); break; case 'Equity': equityAccounts.push({ account, balance }); break; } });
    assetAccounts.sort((a, b) => a.account.Name.localeCompare(b.account.Name)); liabilityAccounts.sort((a, b) => a.account.Name.localeCompare(b.account.Name)); equityAccounts.sort((a, b) => a.account.Name.localeCompare(b.account.Name));
    return { assetAccounts, liabilityAccounts, equityAccounts, totalAssets: assetAccounts.reduce((sum, a) => sum + a.balance, 0), totalLiabilities: liabilityAccounts.reduce((sum, a) => sum + a.balance, 0), totalEquity: equityAccounts.reduce((sum, a) => sum + a.balance, 0) + retainedEarnings, retainedEarnings };
  }, [accounts, journalEntries, lines, asOfDate]);

  const columns: ReportColumn[] = [{ key: 'name', header: 'Account', align: 'left' }, { key: 'amount', header: 'Amount', align: 'right', format: (value) => value !== undefined ? formatCurrency(value) : '' }];
  const tableData: ReportRow[] = useMemo(() => {
    const rows: ReportRow[] = [{ name: 'ASSETS', amount: undefined, isHeader: true }];
    reportData.assetAccounts.forEach(({ account, balance }) => rows.push({ name: account.Name, amount: balance, indent: 1 }));
    rows.push({ name: 'Total Assets', amount: reportData.totalAssets, isSubtotal: true }, { name: '', amount: undefined }, { name: 'LIABILITIES', amount: undefined, isHeader: true });
    reportData.liabilityAccounts.forEach(({ account, balance }) => rows.push({ name: account.Name, amount: balance, indent: 1 }));
    rows.push({ name: 'Total Liabilities', amount: reportData.totalLiabilities, isSubtotal: true }, { name: '', amount: undefined }, { name: 'EQUITY', amount: undefined, isHeader: true });
    reportData.equityAccounts.forEach(({ account, balance }) => rows.push({ name: account.Name, amount: balance, indent: 1 }));
    if (reportData.retainedEarnings !== 0) rows.push({ name: 'Retained Earnings', amount: reportData.retainedEarnings, indent: 1 });
    rows.push({ name: 'Total Equity', amount: reportData.totalEquity, isSubtotal: true }, { name: '', amount: undefined }, { name: 'Total Liabilities & Equity', amount: reportData.totalLiabilities + reportData.totalEquity, isTotal: true });
    return rows;
  }, [reportData]);

  const handleExportCSV = () => exportToCSV(`balance-sheet-${asOfDate}`, columns, tableData.filter(row => row.name));
  const formatAsOfDate = () => `As of ${new Date(asOfDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
  const isBalanced = Math.abs(reportData.totalAssets - (reportData.totalLiabilities + reportData.totalEquity)) < 0.01;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4 print:hidden"><Link to="/reports" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="h-4 w-4 mr-1" />Back to Reports</Link></div>
      <ReportHeader title="Balance Sheet" subtitle="Statement of Financial Position" dateRange={formatAsOfDate()} onExportCSV={handleExportCSV} />
      <div className="mb-6 print:hidden"><div className="flex items-center gap-4"><label className="text-sm font-medium text-gray-700">As of Date:</label><input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm" /></div></div>
      <div className="bg-white shadow rounded-lg overflow-hidden"><ReportTable columns={columns} data={tableData} /></div>
      {!isBalanced && <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md"><p className="text-sm text-yellow-800"><strong>Warning:</strong> The balance sheet is out of balance. Assets ({formatCurrency(reportData.totalAssets)}) do not equal Liabilities + Equity ({formatCurrency(reportData.totalLiabilities + reportData.totalEquity)}).</p></div>}
      <div className="mt-6 text-center text-sm text-gray-500 print:mt-4 print:text-xs"><p>Generated on {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p></div>
    </div>
  );
}
