import { useState, useCallback, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DataGrid,
  GridColDef,
  GridRowSelectionModel,
  GridRenderCellParams,
} from '@mui/x-data-grid';
import { RefreshCw, Upload, Settings, CheckCircle, XCircle, Edit2, MinusCircle, FileText, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import api, { customersApi, Customer, BankTransaction } from '../lib/api';
import { formatDate } from '../lib/dateUtils';
import { formatCurrencyStandalone } from '../contexts/CurrencyContext';
import useGridHeight from '../hooks/useGridHeight';
import useDataGridState from '../hooks/useDataGridState';
import TransactionFilters, { TransactionFiltersState } from '../components/transactions/TransactionFilters';
import BulkActionsBar, { BULK_ACTIONS_BAR_HEIGHT } from '../components/transactions/BulkActionsBar';
import PlaidLinkButton from '../components/PlaidLinkButton';
import ConfirmModal from '../components/ConfirmModal';
import MatchToInvoiceDialog from '../components/MatchToInvoiceDialog';
import TransactionEditDrawer, { TransactionEditFormData } from '../components/transactions/TransactionEditDrawer';

interface Account {
  Id: string;
  Name: string;
  Type: string;
}

const EMPTY_ACCOUNTS: Account[] = [];

function resolveCategory(txn: BankTransaction, accountMap: Map<string, Account>): string | undefined {
  if (txn.SuggestedAccountId) {
    const account = accountMap.get(txn.SuggestedAccountId);
    if (account) return account.Name;
  }
  return txn.SuggestedCategory || txn.Category || undefined;
}

const initialFilters: TransactionFiltersState = {
  status: 'Pending',
  confidence: 'all',
  account: 'all',
  source: 'all',
  dateFrom: '',
  dateTo: '',
  search: '',
};

export default function UnifiedTransactions() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const gridRef = useRef<HTMLDivElement>(null);

  // Initialize filters based on URL params
  const [filters, setFilters] = useState<TransactionFiltersState>(() => {
    const view = searchParams.get('view');
    return {
      ...initialFilters,
      status: view === 'review' ? 'Pending' : 'all',
    };
  });

  const [selectedIds, setSelectedIds] = useState<GridRowSelectionModel>({ type: 'include', ids: new Set() });
  const [drawerTransaction, setDrawerTransaction] = useState<BankTransaction | null>(null);

  // Persisted grid state
  const gridState = useDataGridState({
    gridKey: 'unified-transactions-grid',
    defaultSortModel: [{ field: 'TransactionDate', sort: 'desc' }],
  });
  const [showPostConfirm, setShowPostConfirm] = useState(false);
  const [matchingTransaction, setMatchingTransaction] = useState<BankTransaction | null>(null);

  // Fetch transactions
  const { data: transactionsData, isLoading: transactionsLoading } = useQuery({
    queryKey: ['unified-transactions', filters],
    queryFn: async () => {
      const filterParts: string[] = [];

      if (filters.status !== 'all') {
        filterParts.push(`Status eq '${filters.status}'`);
      }
      if (filters.account !== 'all') {
        filterParts.push(`SourceAccountId eq '${filters.account}'`);
      }
      if (filters.source !== 'all') {
        filterParts.push(`SourceType eq '${filters.source}'`);
      }
      if (filters.dateFrom) {
        filterParts.push(`TransactionDate ge ${filters.dateFrom}`);
      }
      if (filters.dateTo) {
        filterParts.push(`TransactionDate le ${filters.dateTo}`);
      }

      const filterExpression = filterParts.join(' and ');
      const queryParams = filterExpression ? `?$filter=${encodeURIComponent(filterExpression)}` : '';
      const response = await api.get<{ value: BankTransaction[] }>(`/banktransactions${queryParams}`);
      return response.data.value;
    },
  });

  // Fetch accounts for dropdowns
  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await api.get<{ value: Account[] }>('/accounts');
      return response.data.value;
    },
  });

  const accounts = accountsData ?? EMPTY_ACCOUNTS;
  const accountMap = useMemo(() => {
    const map = new Map<string, Account>();
    for (const acc of (accountsData ?? EMPTY_ACCOUNTS)) {
      map.set(acc.Id, acc);
    }
    return map;
  }, [accountsData]);

  // Fetch vendors, customers, classes for name resolution in grid
  const { data: vendorsData } = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const response = await api.get<{ value: { Id: string; Name: string }[] }>("/vendors?$filter=Status eq 'Active'&$orderby=Name");
      return response.data.value;
    },
  });
  const { data: customersData } = useQuery({
    queryKey: ['customers'],
    queryFn: customersApi.getAll,
  });
  const { data: classesData } = useQuery({
    queryKey: ['classes'],
    queryFn: async () => {
      const response = await api.get<{ value: { Id: string; Name: string }[] }>("/classes?$filter=Status eq 'Active'&$orderby=Name");
      return response.data.value;
    },
  });

  const vendorMap = useMemo(() => new Map((vendorsData ?? []).map(v => [v.Id, v.Name])), [vendorsData]);
  const customerMap = useMemo(() => new Map((customersData ?? []).map((c: Customer) => [c.Id, c.Name])), [customersData]);
  const classMap = useMemo(() => new Map((classesData ?? []).map(c => [c.Id, c.Name])), [classesData]);

  const transactions = useMemo(() => {
    let data = transactionsData || [];

    // Apply confidence filter client-side
    if (filters.confidence !== 'all') {
      data = data.filter(txn => {
        if (filters.confidence === 'high') return txn.ConfidenceScore >= 80;
        if (filters.confidence === 'medium') return txn.ConfidenceScore >= 60 && txn.ConfidenceScore < 80;
        if (filters.confidence === 'low') return txn.ConfidenceScore < 60;
        return true;
      });
    }

    // Apply search filter client-side
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      data = data.filter(txn => {
        // Resolve category to account name for search
        const resolvedCategory = resolveCategory(txn, accountMap);
        return (
          txn.Description?.toLowerCase().includes(searchLower) ||
          txn.Merchant?.toLowerCase().includes(searchLower) ||
          resolvedCategory?.toLowerCase().includes(searchLower)
        );
      });
    }

    return data;
  }, [transactionsData, filters.confidence, filters.search, accountMap]);

  // Sync bank feed mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      const dummyTransactions = [
        {
          TransactionDate: new Date().toISOString().split('T')[0],
          Description: 'Starbucks',
          Amount: -5.40,
          Category: 'Meals & Entertainment',
          BankName: 'Chase',
          Status: 'Pending',
          ConfidenceScore: 85,
          SuggestedCategory: 'Meals & Entertainment',
          SuggestedMemo: 'Coffee - business meeting',
        },
        {
          TransactionDate: new Date().toISOString().split('T')[0],
          Description: 'Office Depot',
          Amount: -124.99,
          Category: 'Office Supplies',
          BankName: 'Wells Fargo',
          Status: 'Pending',
          ConfidenceScore: 92,
          SuggestedCategory: 'Office Supplies',
          SuggestedMemo: 'Office supplies',
        },
      ];
      for (const tx of dummyTransactions) {
        await api.post('/banktransactions', tx);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unified-transactions'] });
    },
  });

  // Update transaction mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      await api.patch(`/banktransactions/Id/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unified-transactions'] });
      setDrawerTransaction(null);
      setSelectedIds({ type: 'include', ids: new Set() });
    },
  });

  // Bulk actions - uses chat-api batch-approve endpoint for proper DAB auth
  const bulkApproveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      // Build transaction list with suggested values
      const txnList = ids.map(id => {
        const txn = transactions.find(t => t.Id === id);
        return {
          id,
          accountId: txn?.SuggestedAccountId || '',
          category: txn?.SuggestedCategory || '',
        };
      });

      // Use chat-api batch-approve endpoint which has proper X-MS-API-ROLE headers
      const response = await api.post('/transactions/batch-approve', {
        transactions: txnList,
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['unified-transactions'] });
      setSelectedIds({ type: 'include', ids: new Set() });
      if (data?.approved > 0) {
        toast.success(`Approved ${data.approved} transactions`);
      }
      if (data?.failed > 0) {
        // Check if failures are due to missing categorization
        const needsCategorization = data.results?.filter(
          (r: { success: boolean; error?: string }) => !r.success && r.error?.includes('manual categorization')
        ).length || 0;
        if (needsCategorization > 0) {
          toast.warning(`${needsCategorization} transactions need manual categorization (no AI suggestion)`);
        } else {
          toast.error(`Failed to approve ${data.failed} transactions`);
        }
      }
    },
    onError: (error: Error) => {
      toast.error(`Error approving transactions: ${error.message}`);
    },
  });

  const bulkRejectMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(
        ids.map(id => api.patch(`/banktransactions/Id/${id}`, { Status: 'Rejected' }))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unified-transactions'] });
      setSelectedIds({ type: 'include', ids: new Set() });
    },
  });

  // Post transactions to journal
  const postMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await api.post('/post-transactions', {
        transactionIds: ids,
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['unified-transactions'] });
      toast.success(`Successfully posted ${data.count} transactions to the journal!`);
      setShowPostConfirm(false);
    },
    onError: (error: Error) => {
      toast.error(`Error posting transactions: ${error.message}`);
    },
  });

  // Resolve category display: prefer account name from SuggestedAccountId, fall back to SuggestedCategory
  const getCategoryDisplay = useCallback((txn: BankTransaction): string => {
    return resolveCategory(txn, accountMap) ?? '-';
  }, [accountMap]);

  // Action handlers
  const handleApprove = useCallback((id: string) => {
    const txn = transactions.find(t => t.Id === id);
    if (!txn) return;
    // Resolve category to account name for consistency with display
    const resolvedCategory = resolveCategory(txn, accountMap);
    updateMutation.mutate({
      id,
      data: {
        Status: 'Approved',
        ApprovedAccountId: txn.SuggestedAccountId,
        ApprovedCategory: resolvedCategory ?? txn.SuggestedCategory,
        ApprovedMemo: txn.SuggestedMemo,
        VendorId: txn.VendorId || null,
        CustomerId: txn.CustomerId || null,
        ClassId: txn.ClassId || null,
        ProjectId: txn.ProjectId || null,
        Payee: txn.Payee || null,
      },
    });
  }, [transactions, updateMutation, accountMap]);

  const handleReject = useCallback((id: string) => {
    updateMutation.mutate({ id, data: { Status: 'Rejected' } });
  }, [updateMutation]);

  const handleExclude = useCallback((id: string) => {
    updateMutation.mutate({ id, data: { Status: 'Excluded' } });
  }, [updateMutation]);

  const handleEdit = useCallback((txn: BankTransaction) => {
    setDrawerTransaction(txn);
  }, []);

  const handleSaveEdit = useCallback((id: string, formData: TransactionEditFormData) => {
    const selectedAccount = accounts.find(a => a.Id === formData.accountId);
    updateMutation.mutate({
      id,
      data: {
        SuggestedAccountId: formData.accountId || null,
        SuggestedCategory: selectedAccount?.Name || null,
        SuggestedMemo: formData.memo || null,
        IsPersonal: formData.isPersonal,
        VendorId: formData.vendorId || null,
        CustomerId: formData.customerId || null,
        ClassId: formData.classId || null,
        ProjectId: formData.projectId || null,
        Payee: formData.payee || null,
      },
    }, {
      onSuccess: () => {
        toast.success('Transaction updated');
      },
    });
  }, [accounts, updateMutation]);

  const handleBulkApprove = useCallback(() => {
    bulkApproveMutation.mutate(Array.from(selectedIds.ids) as string[]);
  }, [selectedIds, bulkApproveMutation]);

  const handleBulkReject = useCallback(() => {
    bulkRejectMutation.mutate(Array.from(selectedIds.ids) as string[]);
  }, [selectedIds, bulkRejectMutation]);

  const handleApproveHighConfidence = useCallback(() => {
    const highConfidenceIds = transactions
      .filter(t => t.ConfidenceScore >= 80 && t.Status === 'Pending')
      .map(t => t.Id);
    bulkApproveMutation.mutate(highConfidenceIds);
  }, [transactions, bulkApproveMutation]);

  const handlePostApproved = useCallback(() => {
    const approvedIds = transactions.filter(t => t.Status === 'Approved').map(t => t.Id);
    if (approvedIds.length === 0) {
      toast.error('No approved transactions to post');
      return;
    }
    setShowPostConfirm(true);
  }, [transactions]);

  const confirmPostApproved = useCallback(() => {
    const approvedIds = transactions.filter(t => t.Status === 'Approved').map(t => t.Id);
    postMutation.mutate(approvedIds);
  }, [transactions, postMutation]);

  // Helper functions
  const getConfidenceColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50 dark:bg-green-900/30';
    if (score >= 60) return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/30';
    return 'text-red-600 bg-red-50 dark:bg-red-900/30';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Approved': return 'text-blue-600 bg-blue-50 dark:bg-blue-900/30';
      case 'Posted': return 'text-green-600 bg-green-50 dark:bg-green-900/30';
      case 'Matched': return 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30';
      case 'Rejected': return 'text-red-600 bg-red-50 dark:bg-red-900/30';
      case 'Excluded': return 'text-gray-500 bg-gray-100 dark:bg-gray-700';
      default: return 'text-gray-600 bg-gray-50 dark:bg-gray-700';
    }
  };

  // Counts
  const highConfidenceCount = transactions.filter(t => t.ConfidenceScore >= 80 && t.Status === 'Pending').length;
  const approvedCount = transactions.filter(t => t.Status === 'Approved').length;
  const isLoading = bulkApproveMutation.isPending || bulkRejectMutation.isPending || updateMutation.isPending;

  // Calculate grid height, reserving space for the fixed bottom bulk-actions bar when visible
  const bulkBarVisible = selectedIds.ids.size > 0 || highConfidenceCount > 0;
  const gridHeight = useGridHeight(gridRef, 80, bulkBarVisible ? BULK_ACTIONS_BAR_HEIGHT : 0);

  // DataGrid columns
  const columns: GridColDef[] = [
    {
      field: 'TransactionDate',
      headerName: 'Date',
      width: 110,
      valueFormatter: (value: string) => formatDate(value),
    },
    {
      field: 'SourceName',
      headerName: 'Source',
      width: 120,
      renderCell: (params: GridRenderCellParams) => (
        <span className="text-gray-600 dark:text-gray-400">
          {params.value || params.row.BankName || '-'}
        </span>
      ),
    },
    {
      field: 'Description',
      headerName: 'Description',
      flex: 1,
      minWidth: 250,
      renderCell: (params: GridRenderCellParams) => {
        const txn = params.row as BankTransaction;
        const vendorName = txn.VendorId ? vendorMap.get(txn.VendorId) : null;
        const customerName = txn.CustomerId ? customerMap.get(txn.CustomerId) : null;
        const className = txn.ClassId ? classMap.get(txn.ClassId) : null;
        const hasDetails = vendorName || customerName || className || txn.Payee;
        return (
          <div className="py-1">
            <div className="font-medium truncate">{params.value}</div>
            {txn.OriginalCategory && (
              <div className="text-xs text-gray-500 truncate">Bank: {txn.OriginalCategory}</div>
            )}
            {hasDetails && (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {vendorName && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                    {vendorName}
                  </span>
                )}
                {customerName && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    {customerName}
                  </span>
                )}
                {className && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">
                    {className}
                  </span>
                )}
                {txn.Payee && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                    {txn.Payee}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      },
    },
    {
      field: 'Amount',
      headerName: 'Amount',
      width: 110,
      align: 'right',
      headerAlign: 'right',
      renderCell: (params: GridRenderCellParams) => {
        const amount = params.value as number;
        return (
          <div className="flex flex-col items-end">
            <span className={amount < 0 ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
              {formatCurrencyStandalone(amount)}
            </span>
            {params.row.IsPersonal && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                Personal
              </span>
            )}
          </div>
        );
      },
    },
    {
      field: 'SuggestedCategory',
      headerName: 'Category',
      width: 150,
      renderCell: (params: GridRenderCellParams) => {
        const categoryDisplay = getCategoryDisplay(params.row as BankTransaction);
        return (
          <div>
            <div className="font-medium truncate">{categoryDisplay}</div>
            {params.row.SuggestedMemo && (
              <div className="text-xs text-gray-500 truncate">{params.row.SuggestedMemo}</div>
            )}
          </div>
        );
      },
    },
    {
      field: 'ConfidenceScore',
      headerName: 'Confidence',
      width: 100,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params: GridRenderCellParams) => {
        const score = params.value as number;
        if (!score && score !== 0) return '-';
        return (
          <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${getConfidenceColor(score)}`}>
            {score}%
          </span>
        );
      },
    },
    {
      field: 'Status',
      headerName: 'Status',
      width: 100,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params: GridRenderCellParams) => (
        <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusColor(params.value as string)}`}>
          {params.value}
        </span>
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 160,
      sortable: false,
      filterable: false,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params: GridRenderCellParams) => {
        const txn = params.row as BankTransaction;

        if (txn.Status === 'Pending') {
          return (
            <div className="flex justify-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); handleEdit(txn); }}
                className="p-1 text-blue-600 hover:text-blue-800"
                title="Edit"
              >
                <Edit2 className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleApprove(txn.Id); }}
                className="p-1 text-green-600 hover:text-green-800"
                title="Approve"
              >
                <CheckCircle className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleReject(txn.Id); }}
                className="p-1 text-red-600 hover:text-red-800"
                title="Reject"
              >
                <XCircle className="h-4 w-4" />
              </button>
              {txn.Amount > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setMatchingTransaction(txn); }}
                  className="p-1 text-indigo-600 hover:text-indigo-800"
                  title="Match to Invoice"
                >
                  <Link2 className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); handleExclude(txn.Id); }}
                className="p-1 text-gray-500 hover:text-gray-700"
                title="Exclude"
              >
                <MinusCircle className="h-4 w-4" />
              </button>
            </div>
          );
        }

        if (txn.Status === 'Matched' && txn.MatchedPaymentId) {
          return (
            <Link
              to="/payments"
              className="inline-flex items-center gap-1 p-1 text-indigo-600 hover:text-indigo-800"
              title="View Payment"
              onClick={(e) => e.stopPropagation()}
            >
              <Link2 className="h-4 w-4" />
              <span className="text-xs">View Payment</span>
            </Link>
          );
        }

        if (txn.JournalEntryId) {
          return (
            <Link
              to="/journal-entries"
              className="p-1 text-indigo-600 hover:text-indigo-800"
              title="View Journal Entry"
              onClick={(e) => e.stopPropagation()}
            >
              <FileText className="h-4 w-4" />
            </Link>
          );
        }

        return null;
      },
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Transactions</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Review, categorize, and approve bank transactions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/plaid-connections"
            className="flex items-center px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
          >
            <Settings className="w-4 h-4 mr-1" />
            Manage Connections
          </Link>
          <PlaidLinkButton compact />
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="flex items-center px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            {syncMutation.isPending ? 'Syncing...' : 'Sync Bank Feed'}
          </button>
          <Link
            to="/import"
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            <Upload className="w-4 h-4 mr-2" />
            Import CSV
          </Link>
        </div>
      </div>

      {/* Filters */}
      <TransactionFilters
        filters={filters}
        accounts={accounts}
        onFilterChange={setFilters}
      />

      {/* Post Approved Button */}
      {approvedCount > 0 && (
        <div className="mb-4 flex justify-end">
          <button
            onClick={handlePostApproved}
            disabled={postMutation.isPending}
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400"
          >
            <FileText className="h-4 w-4 mr-2" />
            Post {approvedCount} Approved to Journal
          </button>
        </div>
      )}

      {/* DataGrid */}
      <div ref={gridRef} className="bg-white dark:bg-gray-800 rounded-lg shadow" style={{ height: gridHeight, width: '100%' }}>
        <DataGrid
          rows={transactions}
          columns={columns}
          getRowId={(row) => row.Id}
          loading={transactionsLoading}
          getRowHeight={(params) => {
            const row = params.model;
            const hasDetails = row.VendorId || row.CustomerId || row.ClassId || row.Payee;
            const hasMemo = row.SuggestedMemo || row.OriginalCategory;
            return hasDetails ? 72 : hasMemo ? 58 : 44;
          }}
          checkboxSelection
          disableRowSelectionOnClick
          onRowDoubleClick={(params) => {
            const txn = params.row as BankTransaction;
            if (txn.Status === 'Pending') setDrawerTransaction(txn);
          }}
          rowSelectionModel={selectedIds}
          onRowSelectionModelChange={setSelectedIds}
          pageSizeOptions={[10, 25, 50, 100]}
          paginationModel={gridState.paginationModel}
          onPaginationModelChange={gridState.onPaginationModelChange}
          sortModel={gridState.sortModel}
          onSortModelChange={gridState.onSortModelChange}
          filterModel={gridState.filterModel}
          onFilterModelChange={gridState.onFilterModelChange}
          localeText={{
            noRowsLabel: 'No transactions found. Sync your bank feed or import a CSV to get started.',
          }}
        />
      </div>

      {/* Transaction Edit Drawer */}
      <TransactionEditDrawer
        transaction={drawerTransaction}
        accounts={accounts}
        onSave={handleSaveEdit}
        onClose={() => setDrawerTransaction(null)}
        isSaving={updateMutation.isPending}
      />

      {/* Post Confirmation Modal */}
      <ConfirmModal
        isOpen={showPostConfirm}
        onClose={() => setShowPostConfirm(false)}
        onConfirm={confirmPostApproved}
        title="Post Transactions to General Ledger"
        message={`Are you sure you want to post ${transactions.filter(t => t.Status === 'Approved').length} approved transactions to the General Ledger? This action cannot be undone.`}
        confirmText="Post Transactions"
        cancelText="Cancel"
        isLoading={postMutation.isPending}
        variant="default"
      />

      {/* Match to Invoice Dialog */}
      {matchingTransaction && (
        <MatchToInvoiceDialog
          isOpen={!!matchingTransaction}
          onClose={() => setMatchingTransaction(null)}
          bankTransaction={matchingTransaction}
          onMatched={() => {
            queryClient.invalidateQueries({ queryKey: ['unified-transactions'] });
            setMatchingTransaction(null);
          }}
        />
      )}

      {/* Fixed bottom bulk actions bar - visible when rows are selected */}
      <BulkActionsBar
        selectedCount={selectedIds.ids.size}
        highConfidenceCount={highConfidenceCount}
        onApproveSelected={handleBulkApprove}
        onRejectSelected={handleBulkReject}
        onApproveHighConfidence={handleApproveHighConfidence}
        onCategorizeSelected={() => {/* TODO: Open categorize modal */}}
        onClearSelection={() => setSelectedIds({ type: 'include', ids: new Set() })}
        isLoading={isLoading}
      />
    </div>
  );
}
