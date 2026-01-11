import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle, AlertTriangle } from 'lucide-react';
import { ReportHeader, ReportTable, formatCurrency, exportToCSV } from '../../components/reports';
import type { ReportColumn, ReportRow } from '../../components/reports';

interface Account { Id: string; Name: string; Type: string; Subtype: string | null; }
interface JournalEntry { Id: string; TransactionDate: string; }
interface JournalEntryLine { Id: string; JournalEntryId: string; AccountId: string; Debit: number; Credit: number; }

export default function TrialBalance() {
  const today = new Date();
  const [asOfDate, setAsOfDate] = useState(today.toISOString().split('T')[0]);

  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: async () => { const r = await fetch('/api/accounts'); const d = await r.json(); return d.value as Account[]; } });
  const { data: journalEntries } = useQuery({ queryKey: ['journal-entries'], queryFn: async () => { const r = await fetch('/api/journalentries'); const d = await r.json(); return d.value as JournalEntry[]; } });
  const { data: lines } = useQuery({ queryKey: ['journal-entry-lines'], queryFn: async () => { const r = await fetch('/api/journalentrylines'); const d = await r.json(); return d.value as JournalEntryLine[]; } });

  const reportData = useMemo(() => {
    if (!accounts || !journalEntries || !lines) return { accountBalances: [], totalDebits: 0, totalCredits: 0 };
    const accountMap = new Map(accounts.map(a => [a.Id, a]));
    const entryDateMap = new Map(journalEntries.map(e => [e.Id, new Date(e.TransactionDate)]));
    const end = new Date(asOfDate); end.setHours(23, 59, 59, 999);
    const filteredLines = lines.filter(line => { const date = entryDateMap.get(line.JournalEntryId); return date && date <= end; });
    const accountTotals = new Map<string, { debits: number; credits: number }>();
    filteredLines.forEach(line => { const current = accountTotals.get(line.AccountId) || { debits: 0, credits: 0 }; accountTotals.set(line.AccountId, { debits: current.debits + line.Debit, credits: current.credits + line.Credit }); });
    const accountBalances: { account: Account; debit: number; credit: number }[] = [];
    accountTotals.forEach(({ debits, credits }, accountId) => { const account = accountMap.get(accountId); if (!account) return; const netBalance = debits - credits; const isNormallyDebit = ['Asset', 'Expense'].includes(account.Type); let debit = 0, credit = 0; if (isNormallyDebit) { if (netBalance >= 0) debit = netBalance; else credit = -netBalance; } else { if (netBalance <= 0) credit = -netBalance; else debit = netBalance; } if (debit !== 0 || credit !== 0) accountBalances.push({ account, debit, credit }); });
    const typeOrder = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
    accountBalances.sort((a, b) => { const typeCompare = typeOrder.indexOf(a.account.Type) - typeOrder.indexOf(b.account.Type); if (typeCompare !== 0) return typeCompare; return a.account.Name.localeCompare(b.account.Name); });
    return { accountBalances, totalDebits: accountBalances.reduce((sum, a) => sum + a.debit, 0), totalCredits: accountBalances.reduce((sum, a) => sum + a.credit, 0) };
  }, [accounts, journalEntries, lines, asOfDate]);

  const columns: ReportColumn[] = [{ key: 'accountNumber', header: 'Account #', align: 'left' }, { key: 'name', header: 'Account Name', align: 'left' }, { key: 'type', header: 'Type', align: 'left' }, { key: 'debit', header: 'Debit', align: 'right', format: (value) => value ? formatCurrency(value) : '' }, { key: 'credit', header: 'Credit', align: 'right', format: (value) => value ? formatCurrency(value) : '' }];
  const tableData: ReportRow[] = useMemo(() => {
    const rows: ReportRow[] = reportData.accountBalances.map(({ account, debit, credit }) => ({ accountNumber: account.Id.slice(0, 8), name: account.Name, type: account.Type, debit: debit || undefined, credit: credit || undefined }));
    rows.push({ accountNumber: '', name: 'Totals', type: '', debit: reportData.totalDebits, credit: reportData.totalCredits, isTotal: true });
    return rows;
  }, [reportData]);

  const handleExportCSV = () => exportToCSV(`trial-balance-${asOfDate}`, columns, tableData);
  const formatAsOfDate = () => `As of ${new Date(asOfDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
  const isBalanced = Math.abs(reportData.totalDebits - reportData.totalCredits) < 0.01;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-4 print:hidden"><Link to="/reports" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="h-4 w-4 mr-1" />Back to Reports</Link></div>
      <ReportHeader title="Trial Balance" dateRange={formatAsOfDate()} onExportCSV={handleExportCSV} />
      <div className="mb-6 print:hidden"><div className="flex items-center gap-4"><label className="text-sm font-medium text-gray-700">As of Date:</label><input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm" /></div></div>
      <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${isBalanced ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>{isBalanced ? (<><CheckCircle className="h-5 w-5 text-green-600" /><span className="text-green-800 font-medium">Trial Balance is in balance</span></>) : (<><AlertTriangle className="h-5 w-5 text-red-600" /><span className="text-red-800 font-medium">Trial Balance is OUT OF BALANCE by {formatCurrency(Math.abs(reportData.totalDebits - reportData.totalCredits))}</span></>)}</div>
      <div className="bg-white shadow rounded-lg overflow-hidden"><ReportTable columns={columns} data={tableData} /></div>
      <div className="mt-6 text-center text-sm text-gray-500 print:mt-4 print:text-xs"><p>Generated on {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p></div>
    </div>
  );
}
