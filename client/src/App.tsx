import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PublicClientApplication } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { useEffect } from 'react';
import { ToastProvider } from './hooks/useToast';
import { msalConfig } from './lib/authConfig';
import { initializeApiAuth } from './lib/api';
import { AuthProvider } from './contexts/AuthContext';
import { CompanySettingsProvider } from './contexts/CompanySettingsContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ChatProvider } from './contexts/ChatContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Invoices from './pages/Invoices';
import NewInvoice from './pages/NewInvoice';
import EditInvoice from './pages/EditInvoice';
import InvoiceView from './pages/InvoiceView';
import CompanySettings from './pages/CompanySettings';
import Estimates from './pages/Estimates';
import NewEstimate from './pages/NewEstimate';
import EditEstimate from './pages/EditEstimate';
import Banking from './pages/Banking';
import JournalEntries from './pages/JournalEntries';
import NewJournalEntry from './pages/NewJournalEntry';
import ImportTransactions from './pages/ImportTransactions';
import ReviewTransactions from './pages/ReviewTransactions';
import BankTransactions from './pages/BankTransactions';
import Customers from './pages/Customers';
import NewCustomer from './pages/NewCustomer';
import EditCustomer from './pages/EditCustomer';
import BankReconciliations from './pages/BankReconciliations';
import NewReconciliation from './pages/NewReconciliation';
import ProductsServices from './pages/ProductsServices';
import NewProductService from './pages/NewProductService';
import EditProductService from './pages/EditProductService';
import Vendors from './pages/Vendors';
import NewVendor from './pages/NewVendor';
import EditVendor from './pages/EditVendor';
import ChartOfAccounts from './pages/ChartOfAccounts';
import NewAccount from './pages/NewAccount';
import EditAccount from './pages/EditAccount';
import Reports from './pages/Reports';
import ProfitAndLoss from './pages/reports/ProfitAndLoss';
import BalanceSheet from './pages/reports/BalanceSheet';
import TrialBalance from './pages/reports/TrialBalance';
import ARAgingSummary from './pages/reports/ARAgingSummary';
import Projects from './pages/Projects';
import NewProject from './pages/NewProject';
import EditProject from './pages/EditProject';
import TimeEntries from './pages/TimeEntries';
import NewTimeEntry from './pages/NewTimeEntry';
import Classes from './pages/Classes';
import Locations from './pages/Locations';
import Inventory from './pages/Inventory';
import Bills from './pages/Bills';
import NewBill from './pages/NewBill';
import EditBill from './pages/EditBill';
import RecurringTransactions from './pages/RecurringTransactions';
import Submissions from './pages/Submissions';
import NewSubmission from './pages/NewSubmission';
import EditSubmission from './pages/EditSubmission';
import ChatInterface from './components/ChatInterface';

const queryClient = new QueryClient();

// Only initialize MSAL if not bypassing auth (for Puppeteer PDF generation compatibility)
const bypassAuth = import.meta.env.VITE_BYPASS_AUTH === 'true';
const msalInstance = bypassAuth ? null : new PublicClientApplication(msalConfig);

function AppContent() {
  useEffect(() => {
    // Initialize API auth interceptor with MSAL instance (only if not bypassing)
    if (msalInstance) {
      initializeApiAuth(msalInstance);
    }
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public route */}
        <Route path="/login" element={<Login />} />

        {/* Protected routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="invoices/new" element={<NewInvoice />} />
            <Route path="invoices/:id" element={<InvoiceView />} />
            <Route path="invoices/:id/edit" element={<EditInvoice />} />
            <Route path="estimates" element={<Estimates />} />
            <Route path="estimates/new" element={<NewEstimate />} />
            <Route path="estimates/:id/edit" element={<EditEstimate />} />
            <Route path="banking" element={<Banking />} />
            <Route path="journal-entries" element={<JournalEntries />} />
            <Route path="journal-entries/new" element={<NewJournalEntry />} />
            <Route path="import" element={<ImportTransactions />} />
            <Route path="review" element={<ReviewTransactions />} />
            <Route path="customers" element={<Customers />} />
            <Route path="customers/new" element={<NewCustomer />} />
            <Route path="customers/:id/edit" element={<EditCustomer />} />
            <Route path="products-services" element={<ProductsServices />} />
            <Route path="products-services/new" element={<NewProductService />} />
            <Route path="products-services/:id/edit" element={<EditProductService />} />
            <Route path="vendors" element={<Vendors />} />
            <Route path="vendors/new" element={<NewVendor />} />
            <Route path="vendors/:id/edit" element={<EditVendor />} />
            <Route path="accounts" element={<ChartOfAccounts />} />
            <Route path="accounts/new" element={<NewAccount />} />
            <Route path="accounts/:id/edit" element={<EditAccount />} />
            <Route path="bills" element={<Bills />} />
            <Route path="bills/new" element={<NewBill />} />
            <Route path="bills/:id/edit" element={<EditBill />} />
            <Route path="projects" element={<Projects />} />
            <Route path="projects/new" element={<NewProject />} />
            <Route path="projects/:id/edit" element={<EditProject />} />
            <Route path="time-entries" element={<TimeEntries />} />
            <Route path="time-entries/new" element={<NewTimeEntry />} />
            <Route path="classes" element={<Classes />} />
            <Route path="locations" element={<Locations />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="recurring" element={<RecurringTransactions />} />
            <Route path="transactions" element={<BankTransactions />} />
            <Route path="reconciliations" element={<BankReconciliations />} />
            <Route path="reconciliations/new" element={<NewReconciliation />} />
            <Route path="reconciliations/:id" element={<NewReconciliation />} />
            <Route path="reports" element={<Reports />} />
            <Route path="reports/profit-loss" element={<ProfitAndLoss />} />
            <Route path="reports/balance-sheet" element={<BalanceSheet />} />
            <Route path="reports/trial-balance" element={<TrialBalance />} />
            <Route path="reports/ar-aging" element={<ARAgingSummary />} />
            <Route path="submissions" element={<Submissions />} />
            <Route path="submissions/new" element={<NewSubmission />} />
            <Route path="submissions/:id/edit" element={<EditSubmission />} />
            <Route path="settings" element={<CompanySettings />} />
          </Route>
        </Route>
      </Routes>
      <ChatInterface />
    </BrowserRouter>
  );
}

function App() {
  const content = (
    <AuthProvider>
      <CompanySettingsProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <ToastProvider>
              <ChatProvider>
                <AppContent />
              </ChatProvider>
            </ToastProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </CompanySettingsProvider>
    </AuthProvider>
  );

  // Skip MsalProvider when bypassing auth (for Puppeteer compatibility)
  if (bypassAuth || !msalInstance) {
    return content;
  }

  return (
    <MsalProvider instance={msalInstance}>
      {content}
    </MsalProvider>
  );
}

export default App;
