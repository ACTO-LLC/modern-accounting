import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Invoices from './pages/Invoices';
import NewInvoice from './pages/NewInvoice';
import EditInvoice from './pages/EditInvoice';
import Banking from './pages/Banking';
import JournalEntries from './pages/JournalEntries';
import NewJournalEntry from './pages/NewJournalEntry';
import ImportTransactions from './pages/ImportTransactions';
import ReviewTransactions from './pages/ReviewTransactions';
import BankTransactions from './pages/BankTransactions';
import Customers from './pages/Customers';
import NewCustomer from './pages/NewCustomer';
import EditCustomer from './pages/EditCustomer';
import Projects from './pages/Projects';
import NewProject from './pages/NewProject';
import EditProject from './pages/EditProject';
import TimeEntries from './pages/TimeEntries';
import NewTimeEntry from './pages/NewTimeEntry';
import Reports from './pages/Reports';
import ProfitAndLoss from './pages/reports/ProfitAndLoss';
import BalanceSheet from './pages/reports/BalanceSheet';
import TrialBalance from './pages/reports/TrialBalance';
import ARAgingSummary from './pages/reports/ARAgingSummary';
import ChatInterface from './components/ChatInterface';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="invoices/new" element={<NewInvoice />} />
            <Route path="invoices/:id/edit" element={<EditInvoice />} />
            <Route path="banking" element={<Banking />} />
            <Route path="journal-entries" element={<JournalEntries />} />
            <Route path="journal-entries/new" element={<NewJournalEntry />} />
            <Route path="import" element={<ImportTransactions />} />
            <Route path="review" element={<ReviewTransactions />} />
            <Route path="customers" element={<Customers />} />
            <Route path="customers/new" element={<NewCustomer />} />
            <Route path="customers/:id/edit" element={<EditCustomer />} />
            <Route path="projects" element={<Projects />} />
            <Route path="projects/new" element={<NewProject />} />
            <Route path="projects/:id/edit" element={<EditProject />} />
            <Route path="time-entries" element={<TimeEntries />} />
            <Route path="time-entries/new" element={<NewTimeEntry />} />
            <Route path="transactions" element={<BankTransactions />} />
            <Route path="reports" element={<Reports />} />
            <Route path="reports/profit-loss" element={<ProfitAndLoss />} />
            <Route path="reports/balance-sheet" element={<BalanceSheet />} />
            <Route path="reports/trial-balance" element={<TrialBalance />} />
            <Route path="reports/ar-aging" element={<ARAgingSummary />} />
            <Route path="settings" element={<div>Settings Page</div>} />
          </Route>
        </Routes>
        <ChatInterface />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
