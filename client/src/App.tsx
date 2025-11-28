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
            <Route path="transactions" element={<BankTransactions />} />
            <Route path="settings" element={<div>Settings Page</div>} />
          </Route>
        </Routes>
        <ChatInterface />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
