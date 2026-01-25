import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Upload, ArrowLeft, CheckCircle, Clock, AlertCircle, Trash2, Link2 } from 'lucide-react';
import api from '../lib/api';
import { formatDate } from '../lib/dateUtils';

interface Receipt {
  Id: string;
  ExpenseId: string | null;
  ExpenseNumber: string | null;
  ExpenseDate: string | null;
  BankTransactionId: string | null;
  FileName: string;
  FileType: string;
  FileSize: number;
  ExtractedVendor: string | null;
  ExtractedAmount: number | null;
  ExtractedDate: string | null;
  OcrConfidence: number | null;
  OcrStatus: string;
  OcrErrorMessage: string | null;
  UploadedBy: string | null;
  UploadedAt: string;
  IsMatched: number;
}

interface Expense {
  Id: string;
  ExpenseNumber: string;
  ExpenseDate: string;
  VendorName: string;
  Amount: number;
}

const getOcrStatusIcon = (status: string) => {
  switch (status) {
    case 'Completed':
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'Processing':
      return <Clock className="w-4 h-4 text-yellow-500 animate-spin" />;
    case 'Pending':
      return <Clock className="w-4 h-4 text-gray-400" />;
    case 'Failed':
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    default:
      return null;
  }
};

export default function Receipts() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);

  const { data: receipts, isLoading } = useQuery({
    queryKey: ['receipts'],
    queryFn: async () => {
      const response = await api.get<{ value: Receipt[] }>(
        '/receipts?$orderby=UploadedAt desc'
      );
      return response.data.value;
    },
  });

  const { data: unmatchedExpenses } = useQuery({
    queryKey: ['expenses', 'unmatched'],
    queryFn: async () => {
      const response = await api.get<{ value: Expense[] }>(
        '/expenses?$orderby=ExpenseDate desc&$top=50'
      );
      return response.data.value;
    },
    enabled: showLinkModal,
  });

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      await Promise.all(
        files.map(async (file) => {
          const base64Data = await fileToBase64(file);
          await api.post('/receipts_write', {
            FileName: file.name,
            FileType: file.type,
            FileSize: file.size,
            FileData: base64Data,
            OcrStatus: 'Pending',
          });
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
    },
  });

  const linkMutation = useMutation({
    mutationFn: async ({ receiptId, expenseId }: { receiptId: string; expenseId: string }) => {
      await api.patch(`/receipts_write/Id/${receiptId}`, {
        ExpenseId: expenseId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
      setShowLinkModal(false);
      setSelectedReceipt(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (receiptId: string) => {
      await api.delete(`/receipts_write/Id/${receiptId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      uploadMutation.mutate(files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const unmatchedReceipts = receipts?.filter((r) => !r.IsMatched) || [];
  const matchedReceipts = receipts?.filter((r) => r.IsMatched) || [];

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center">
          <Link to="/expenses" className="mr-4 text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Receipt Inbox</h1>
            <p className="mt-1 text-sm text-gray-500">
              Upload receipts and match them to expenses
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
          >
            <Upload className="w-4 h-4 mr-2" />
            {uploadMutation.isPending ? 'Uploading...' : 'Upload Receipts'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      </div>

      {/* Unmatched Receipts Section */}
      <div className="mb-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Unmatched Receipts ({unmatchedReceipts.length})
        </h2>
        {unmatchedReceipts.length === 0 ? (
          <div className="bg-gray-50 rounded-lg p-8 text-center">
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">
              No unmatched receipts. Upload receipts to get started.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {unmatchedReceipts.map((receipt) => (
              <div
                key={receipt.Id}
                className="bg-white rounded-lg shadow border border-gray-200 p-4"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center">
                    {getOcrStatusIcon(receipt.OcrStatus)}
                    <span className="ml-2 text-sm text-gray-600 truncate max-w-[150px]">
                      {receipt.FileName}
                    </span>
                  </div>
                  <button
                    onClick={() => deleteMutation.mutate(receipt.Id)}
                    className="text-gray-400 hover:text-red-500"
                    title="Delete receipt"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {receipt.OcrStatus === 'Completed' && (
                  <div className="text-sm text-gray-600 mb-3 space-y-1">
                    {receipt.ExtractedVendor && (
                      <p>
                        <span className="font-medium">Vendor:</span> {receipt.ExtractedVendor}
                      </p>
                    )}
                    {receipt.ExtractedAmount && (
                      <p>
                        <span className="font-medium">Amount:</span> ${receipt.ExtractedAmount.toFixed(2)}
                      </p>
                    )}
                    {receipt.ExtractedDate && (
                      <p>
                        <span className="font-medium">Date:</span> {formatDate(receipt.ExtractedDate)}
                      </p>
                    )}
                    {receipt.OcrConfidence && (
                      <p className="text-xs text-gray-400">
                        Confidence: {receipt.OcrConfidence.toFixed(0)}%
                      </p>
                    )}
                  </div>
                )}

                {receipt.OcrStatus === 'Failed' && (
                  <p className="text-sm text-red-500 mb-3">
                    OCR Failed: {receipt.OcrErrorMessage}
                  </p>
                )}

                <div className="text-xs text-gray-400 mb-3">
                  Uploaded {formatDate(receipt.UploadedAt)}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedReceipt(receipt);
                      setShowLinkModal(true);
                    }}
                    className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-indigo-300 text-sm font-medium rounded-md text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
                  >
                    <Link2 className="w-4 h-4 mr-1" />
                    Link to Expense
                  </button>
                  <Link
                    to={`/expenses/new?receiptId=${receipt.Id}`}
                    className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Create Expense
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Matched Receipts Section */}
      {matchedReceipts.length > 0 && (
        <div>
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            Matched Receipts ({matchedReceipts.length})
          </h2>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Receipt
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expense
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Uploaded
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {matchedReceipts.map((receipt) => (
                  <tr key={receipt.Id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                        <span className="text-sm text-gray-900">{receipt.FileName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        to={`/expenses/${receipt.ExpenseId}/edit`}
                        className="text-sm text-indigo-600 hover:text-indigo-900"
                      >
                        {receipt.ExpenseNumber || 'View Expense'}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(receipt.UploadedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Link to Expense Modal */}
      {showLinkModal && selectedReceipt && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b">
              <h3 className="text-lg font-medium text-gray-900">
                Link Receipt to Expense
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Select an expense to link with "{selectedReceipt.FileName}"
              </p>
            </div>
            <div className="p-4 overflow-y-auto max-h-[50vh]">
              {unmatchedExpenses?.map((expense) => (
                <button
                  key={expense.Id}
                  onClick={() =>
                    linkMutation.mutate({
                      receiptId: selectedReceipt.Id,
                      expenseId: expense.Id,
                    })
                  }
                  disabled={linkMutation.isPending}
                  className="w-full text-left p-3 hover:bg-gray-50 rounded-lg border border-gray-200 mb-2 disabled:opacity-50"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-900">
                        {expense.VendorName || 'No Vendor'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {formatDate(expense.ExpenseDate)} - {expense.ExpenseNumber}
                      </p>
                    </div>
                    <p className="text-lg font-semibold text-gray-900">
                      ${expense.Amount.toFixed(2)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            <div className="p-4 border-t bg-gray-50">
              <button
                onClick={() => {
                  setShowLinkModal(false);
                  setSelectedReceipt(null);
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function to convert File to base64
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
}
