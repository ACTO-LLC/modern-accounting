import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PublicClientApplication } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { ToastProvider } from './hooks/useToast';
import { msalConfig } from './lib/authConfig';
import { initializeApiAuth } from './lib/api';
import { AuthProvider } from './contexts/AuthContext';
import { TenantProvider } from './contexts/TenantContext';
import { CompanySettingsProvider } from './contexts/CompanySettingsContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ChatProvider } from './contexts/ChatContext';
import { OnboardingProvider } from './contexts/OnboardingContext';
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
import JournalEntries from './pages/JournalEntries';
import NewJournalEntry from './pages/NewJournalEntry';
import ImportTransactions from './pages/ImportTransactions';
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
import APAgingSummary from './pages/reports/APAgingSummary';
import CustomerStatement from './pages/reports/CustomerStatement';
import TransactionDetail from './pages/reports/TransactionDetail';
import GeneralLedger from './pages/reports/GeneralLedger';
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
import PurchaseOrders from './pages/PurchaseOrders';
import NewPurchaseOrder from './pages/NewPurchaseOrder';
import EditPurchaseOrder from './pages/EditPurchaseOrder';
import RecurringTransactions from './pages/RecurringTransactions';
import Submissions from './pages/Submissions';
import NewSubmission from './pages/NewSubmission';
import EditSubmission from './pages/EditSubmission';
import AdminEnhancements from './pages/AdminEnhancements';
import Employees from './pages/Employees';
import NewEmployee from './pages/NewEmployee';
import EditEmployee from './pages/EditEmployee';
import PayRuns from './pages/PayRuns';
import NewPayRun from './pages/NewPayRun';
import PayRunDetail from './pages/PayRunDetail';
import PayStubView from './pages/PayStubView';
import PayrollSummary from './pages/reports/PayrollSummary';
import SalesTaxLiability from './pages/reports/SalesTaxLiability';
import TaxRates from './pages/TaxRates';
import PlaidConnections from './pages/PlaidConnections';
import UnifiedTransactions from './pages/UnifiedTransactions';
import Expenses from './pages/Expenses';
import NewExpense from './pages/NewExpense';
import EditExpense from './pages/EditExpense';
import Receipts from './pages/Receipts';
import ExpenseReport from './pages/reports/ExpenseReport';
import Mileage from './pages/Mileage';
import NewMileage from './pages/NewMileage';
import EditMileage from './pages/EditMileage';
import Vehicles from './pages/Vehicles';
import MileageReport from './pages/reports/MileageReport';
import InventoryValuation from './pages/reports/InventoryValuation';
import InventoryStockStatus from './pages/reports/InventoryStockStatus';
import PhysicalInventoryWorksheet from './pages/reports/PhysicalInventoryWorksheet';
import SalesByCustomer from './pages/reports/SalesByCustomer';
import SalesByProduct from './pages/reports/SalesByProduct';
import Payments from './pages/Payments';
import NewPayment from './pages/NewPayment';
import BillPayments from './pages/BillPayments';
import NewBillPayment from './pages/NewBillPayment';
import VendorCredits from './pages/VendorCredits';
import NewVendorCredit from './pages/NewVendorCredit';
import EditVendorCredit from './pages/EditVendorCredit';
import TaxForms from './pages/TaxForms';
import W2Forms from './pages/W2Forms';
import Form1099NEC from './pages/Form1099NEC';
import BankImport from './pages/BankImport';
import BankImportMatches from './pages/BankImportMatches';
import BankImportHistory from './pages/BankImportHistory';
import BankRules from './pages/BankRules';
import VendorHierarchy from './pages/VendorHierarchy';
import CustomerHierarchy from './pages/CustomerHierarchy';
import SalesReceipts from './pages/SalesReceipts';
import NewSalesReceipt from './pages/NewSalesReceipt';
import EditSalesReceipt from './pages/EditSalesReceipt';
import EmailReminders from './pages/EmailReminders';
import AuditLog from './pages/AuditLog';
import ChatInterface from './components/ChatInterface';
import OnboardingWelcome from './components/onboarding/OnboardingWelcome';
import FeatureTour from './components/onboarding/FeatureTour';
import OnboardingNotifications from './components/onboarding/OnboardingNotifications';
import MiltonOnboardingHelper from './components/onboarding/MiltonOnboardingHelper';
import SpotlightManager from './components/onboarding/SpotlightManager';

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
            <Route path="sales-receipts" element={<SalesReceipts />} />
            <Route path="sales-receipts/new" element={<NewSalesReceipt />} />
            <Route path="sales-receipts/:id/edit" element={<EditSalesReceipt />} />
            <Route path="estimates" element={<Estimates />} />
            <Route path="estimates/new" element={<NewEstimate />} />
            <Route path="estimates/:id/edit" element={<EditEstimate />} />
            <Route path="banking" element={<Navigate to="/transactions" replace />} />
            <Route path="plaid-connections" element={<PlaidConnections />} />
            <Route path="journal-entries" element={<JournalEntries />} />
            <Route path="journal-entries/new" element={<NewJournalEntry />} />
            <Route path="import" element={<ImportTransactions />} />
            <Route path="review" element={<Navigate to="/transactions?view=review" replace />} />
            <Route path="customers" element={<Customers />} />
            <Route path="customers/new" element={<NewCustomer />} />
            <Route path="customers/:id/edit" element={<EditCustomer />} />
            <Route path="customers/:id/hierarchy" element={<CustomerHierarchy />} />
            <Route path="products-services" element={<ProductsServices />} />
            <Route path="products-services/new" element={<NewProductService />} />
            <Route path="products-services/:id/edit" element={<EditProductService />} />
            <Route path="vendors" element={<Vendors />} />
            <Route path="vendors/new" element={<NewVendor />} />
            <Route path="vendors/:id/edit" element={<EditVendor />} />
            <Route path="vendors/:id/hierarchy" element={<VendorHierarchy />} />
            <Route path="accounts" element={<ChartOfAccounts />} />
            <Route path="accounts/new" element={<NewAccount />} />
            <Route path="accounts/:id/edit" element={<EditAccount />} />
            <Route path="bills" element={<Bills />} />
            <Route path="bills/new" element={<NewBill />} />
            <Route path="bills/:id/edit" element={<EditBill />} />
            <Route path="purchase-orders" element={<PurchaseOrders />} />
            <Route path="purchase-orders/new" element={<NewPurchaseOrder />} />
            <Route path="purchase-orders/:id/edit" element={<EditPurchaseOrder />} />
            <Route path="expenses" element={<Expenses />} />
            <Route path="expenses/new" element={<NewExpense />} />
            <Route path="expenses/:id/edit" element={<EditExpense />} />
            <Route path="receipts" element={<Receipts />} />
            <Route path="mileage" element={<Mileage />} />
            <Route path="mileage/new" element={<NewMileage />} />
            <Route path="mileage/:id/edit" element={<EditMileage />} />
            <Route path="mileage/vehicles" element={<Vehicles />} />
            <Route path="projects" element={<Projects />} />
            <Route path="projects/new" element={<NewProject />} />
            <Route path="projects/:id/edit" element={<EditProject />} />
            <Route path="time-entries" element={<TimeEntries />} />
            <Route path="time-entries/new" element={<NewTimeEntry />} />
            <Route path="classes" element={<Classes />} />
            <Route path="locations" element={<Locations />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="recurring" element={<RecurringTransactions />} />
            <Route path="transactions" element={<UnifiedTransactions />} />
            <Route path="reconciliations" element={<BankReconciliations />} />
            <Route path="reconciliations/new" element={<NewReconciliation />} />
            <Route path="reconciliations/:id" element={<NewReconciliation />} />
            <Route path="reports" element={<Reports />} />
            <Route path="reports/profit-loss" element={<ProfitAndLoss />} />
            <Route path="reports/balance-sheet" element={<BalanceSheet />} />
            <Route path="reports/trial-balance" element={<TrialBalance />} />
            <Route path="reports/ar-aging" element={<ARAgingSummary />} />
            <Route path="reports/ap-aging" element={<APAgingSummary />} />
            <Route path="reports/customer-statement" element={<CustomerStatement />} />
            <Route path="reports/transaction-detail" element={<TransactionDetail />} />
            <Route path="reports/general-ledger" element={<GeneralLedger />} />
            <Route path="submissions" element={<Submissions />} />
            <Route path="submissions/new" element={<NewSubmission />} />
            <Route path="submissions/:id/edit" element={<EditSubmission />} />
            <Route path="employees" element={<Employees />} />
            <Route path="employees/new" element={<NewEmployee />} />
            <Route path="employees/:id/edit" element={<EditEmployee />} />
            <Route path="payruns" element={<PayRuns />} />
            <Route path="payruns/new" element={<NewPayRun />} />
            <Route path="payruns/:id" element={<PayRunDetail />} />
            <Route path="paystubs/:id" element={<PayStubView />} />
            <Route path="reports/payroll-summary" element={<PayrollSummary />} />
            <Route path="reports/sales-tax" element={<SalesTaxLiability />} />
            <Route path="reports/expenses" element={<ExpenseReport />} />
            <Route path="reports/mileage" element={<MileageReport />} />
            <Route path="reports/inventory-valuation" element={<InventoryValuation />} />
            <Route path="reports/inventory-stock-status" element={<InventoryStockStatus />} />
            <Route path="reports/physical-inventory" element={<PhysicalInventoryWorksheet />} />
            <Route path="reports/sales-by-customer" element={<SalesByCustomer />} />
            <Route path="reports/sales-by-product" element={<SalesByProduct />} />
            <Route path="tax-rates" element={<TaxRates />} />
            <Route path="admin/enhancements" element={<AdminEnhancements />} />
            <Route path="settings" element={<CompanySettings />} />
            <Route path="payments" element={<Payments />} />
            <Route path="payments/new" element={<NewPayment />} />
            <Route path="bill-payments" element={<BillPayments />} />
            <Route path="bill-payments/new" element={<NewBillPayment />} />
            <Route path="vendor-credits" element={<VendorCredits />} />
            <Route path="vendor-credits/new" element={<NewVendorCredit />} />
            <Route path="vendor-credits/:id/edit" element={<EditVendorCredit />} />
            <Route path="tax-forms" element={<TaxForms />} />
            <Route path="tax-forms/w2" element={<W2Forms />} />
            <Route path="tax-forms/1099-nec" element={<Form1099NEC />} />
            <Route path="bank-import" element={<BankImport />} />
            <Route path="bank-import/matches" element={<BankImportMatches />} />
            <Route path="bank-import/history" element={<BankImportHistory />} />
            <Route path="bank-rules" element={<BankRules />} />
            <Route path="email-reminders" element={<EmailReminders />} />
            <Route path="admin/audit-log" element={<AuditLog />} />
          </Route>
        </Route>
      </Routes>
      <ChatInterface />
      <OnboardingWelcome />
      <FeatureTour />
      <OnboardingNotifications />
      <MiltonOnboardingHelper />
      <SpotlightManager />
    </BrowserRouter>
  );
}

function App() {
  const content = (
    <AuthProvider>
      <TenantProvider>
        <CompanySettingsProvider>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider>
              <Toaster position="top-right" richColors />
              <ToastProvider>
                <ChatProvider>
                  <OnboardingProvider>
                    <AppContent />
                  </OnboardingProvider>
                </ChatProvider>
              </ToastProvider>
            </ThemeProvider>
          </QueryClientProvider>
        </CompanySettingsProvider>
      </TenantProvider>
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
