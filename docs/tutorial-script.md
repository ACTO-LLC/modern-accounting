# Modern Accounting Tutorial Script

A step-by-step walkthrough of core workflows in Modern Accounting (MA), covering daily accounting tasks from login through reporting.

---

## 1. Getting Started

### Overview

Modern Accounting is a web-based accounting application secured by Azure Active Directory. After signing in, you land on the Dashboard, which provides a financial overview and quick access to pending actions.

### Prerequisites

- A Microsoft account provisioned by your organization (Azure AD)
- A modern web browser (Chrome, Edge, Firefox, or Safari)

### Signing In

1. Open your Modern Accounting URL in a web browser.
2. You will see the **Modern Accounting** login page with the message "Sign in to access your accounting dashboard."
3. Click the **"Sign in with Microsoft"** button.
4. Complete the Microsoft authentication flow using your organization credentials.
5. After successful authentication, you are redirected to the **Dashboard**.

[Screenshot: Login page showing the "Sign in with Microsoft" button and "Secured by Azure AD" footer]

### Navigating the Application

The application layout consists of two areas:

- **Sidebar (left):** The main navigation panel. It displays your company name or logo at the top, followed by navigation groups and items. On desktop, you can collapse the sidebar using the chevron toggle at the bottom. On mobile, tap the hamburger menu icon in the top-right header.
- **Main content area (right):** Displays the current page.

#### Sidebar Navigation Groups

The sidebar organizes features into collapsible groups:

| Group | Items |
|-------|-------|
| **Sales** | Invoices, Receive Payment, Sales Receipts, Estimates, Customer Deposits, Credit Memos |
| **Purchasing** | Purchase Orders, Bills, Vendor Credits, Expenses, Mileage |
| **People** | Customers, Vendors, Employees |
| **Products** | Products & Services, Inventory |
| **Payroll** | Run Payroll, Time Tracking |
| **Import & Sync** | Bank Connections, Import, Bank Rules |
| **Accounting** | Chart of Accounts, Journal Entries, Tax Rates, Tax Settings, Payment Terms, Classes, Locations, Recurring, Closing Books |

Standalone items include: **Dashboard**, **Projects**, **Transactions**, **Reconciliation**, **Reports**, **Feedback**, **AI Enhancements**, **Email Reminders**, **Audit Log**, and **Settings**.

Click a group name to expand or collapse it. Click an item to navigate to that page.

[Screenshot: Sidebar fully expanded showing the navigation groups and items]

### Understanding the Dashboard

The Dashboard page displays:

- **Summary Cards** across the top showing four key metrics:
  - **Total Revenue** -- cumulative revenue from your books
  - **Total Expenses** -- cumulative expenses
  - **Net Income** -- revenue minus expenses (green if positive, red if negative)
  - **Cash on Hand** -- balance of cash/bank asset accounts
- **Cash Flow chart** (left, large) -- A bar chart showing Income vs. Expenses for the last 6 months.
- **Pending Actions** (right) -- Shows the count of "Unreviewed Transactions" with a **"Review Now"** link that navigates to the Transactions review page.
- **Recent Activity** (right, below Pending Actions) -- Lists the 5 most recent journal entries with a **"View All Activity"** link to the Journal Entries page.

[Screenshot: Dashboard showing summary cards, Cash Flow chart, Pending Actions callout, and Recent Activity list]

#### User Menu

Click the **user icon** (person silhouette) in the sidebar header to open the user menu. This shows your name, email, and role. Click **"Sign out"** to log out of the application.

---

## 2. Expensing Transactions

### Overview

Bank transactions flow into Modern Accounting either through Plaid bank connections (automatic) or CSV import (manual). The system uses AI to suggest categories for each transaction. You then review, adjust if needed, and approve them. Approved transactions are posted to the General Ledger.

### Prerequisites

- At least one bank account connected via Plaid, or transactions imported via CSV
- Chart of Accounts set up with appropriate expense/income categories

### Connecting a Bank Account

1. In the sidebar, expand **Import & Sync** and click **"Bank Connections"**.
2. On the Bank Connections page, click the **"Connect Bank"** button (uses Plaid Link).
3. Follow the Plaid flow to select your bank and authenticate.
4. Once connected, the page shows your institution name, number of accounts, sync status, and last sync time.

[Screenshot: Bank Connections page showing a connected bank with sync status "Ready"]

### Importing Transactions via CSV

1. In the sidebar, expand **Import & Sync** and click **"Import"**.
2. On the Import page, you will see three tabs: **"Bank Import"**, **"CSV Import"**, and **"Review Matches"**.
3. Click the **"CSV Import"** tab.
4. Upload your CSV file following the on-screen instructions.
5. After import, transactions appear in the Transactions page with "Pending" status.

Alternatively, from the Transactions page, click the **"Import CSV"** button in the top-right corner.

[Screenshot: Import page showing the three tabs with the CSV Import tab active]

### Reviewing and Approving Transactions

The main workflow for expensing happens on the **Transactions** page.

1. In the sidebar, click **"Transactions"** (or click **"Review Now"** from the Dashboard's Pending Actions).
2. The page title is **"Transactions"** with the subtitle "Review, categorize, and approve bank transactions."

#### Understanding the Transactions Page Layout

- **Header buttons** (top-right):
  - **"Manage Connections"** -- links to Bank Connections page
  - **"Connect Bank"** -- Plaid Link button for quick bank connection
  - **"Sync Bank Feed"** -- manually triggers a bank feed sync
  - **"Import CSV"** -- navigates to the Import page

- **Filters bar** -- A panel with filters for:
  - **Search** -- text search on description, merchant, or category
  - **Status** -- dropdown: All, Pending, Approved, Rejected, Posted, Excluded
  - **Confidence** -- dropdown: All, High, Medium, Low
  - **Account** -- filter by bank/source account
  - **Source** -- filter by source type
  - **Date From / Date To** -- date range filters

- **DataGrid** -- A sortable, pageable table with columns:
  - **Date** -- transaction date
  - **Source** -- bank name or source account
  - **Description** -- transaction description, with merchant name, vendor/customer tags, and bank category shown below
  - **Amount** -- negative amounts in red (expenses), positive in green (income); a "Personal" badge appears if flagged
  - **Category** -- the AI-suggested category (account name) with a suggested memo below
  - **Confidence** -- AI confidence score as a colored badge (green 80%+, yellow 60-79%, red below 60%)
  - **Status** -- Pending, Approved, Posted, Matched, Rejected, or Excluded
  - **Actions** -- action buttons (see below)

[Screenshot: Transactions page showing the filter bar and DataGrid with Pending transactions, including Confidence scores and AI-suggested categories]

#### Action Buttons for Pending Transactions

Each Pending transaction row shows these action icons (left to right):

1. **Edit** (pencil icon) -- Opens the Transaction Edit Drawer on the right side of the screen
2. **Approve** (green checkmark) -- Approves the transaction with the current suggested category and posts to GL. Disabled (grayed out) if no account is assigned.
3. **Reject** (red X circle) -- Rejects the transaction
4. **Match to Invoice** (link icon) -- Only appears for positive-amount transactions. Opens a dialog to match the bank deposit to an existing invoice.
5. **Exclude** (minus circle) -- Excludes the transaction from accounting (e.g., personal transactions, transfers)

#### Editing a Transaction Before Approval

If the AI suggestion is wrong or you need to add details:

1. Click the **Edit** (pencil) icon on a Pending transaction, or **double-click** the row.
2. The **Transaction Edit Drawer** slides in from the right.
3. The drawer shows read-only context at the top: Date, Amount, Description, and Source.
4. Below that, editable fields:
   - **Account** -- Autocomplete dropdown to select the GL account (expense category)
   - **Memo** -- free-text memo
   - **Vendor** -- link to a vendor record
   - **Customer** -- link to a customer record
   - **Class** -- classification tag
   - **Project** -- project assignment
   - **Payee** -- free-text payee name
   - **Personal** -- checkbox to flag as a personal (non-business) transaction
5. After making changes, click **"Save"** at the bottom of the drawer.
6. The drawer closes and the transaction updates in the grid.

[Screenshot: Transaction Edit Drawer open on the right side, showing the Account autocomplete, Vendor selector, and Personal checkbox]

#### Approving a Single Transaction

1. Ensure the transaction has an account assigned (the Category column shows an account name, not just "Uncategorized").
2. Click the **Approve** (green checkmark) icon.
3. A success toast appears: "Transaction approved and posted to GL".
4. The transaction status changes from "Pending" to "Posted".

#### Bulk Actions

When you select transactions using the checkboxes in the grid, a **Bulk Actions Bar** appears fixed at the bottom of the screen:

- **"Approve High Confidence (N)"** -- Approves all Pending transactions with a confidence score of 80% or higher. This button is always visible when high-confidence pending transactions exist.
- **"Approve Selected"** -- Approves all selected transactions.
- **"Reject Selected"** -- Rejects all selected transactions.
- The bar also shows a count of selected items with an **"X"** button to clear the selection.

[Screenshot: Bulk Actions Bar at the bottom of the screen showing "5 selected" with Approve High Confidence, Approve Selected, and Reject Selected buttons]

#### Posting Approved Transactions

If you have approved transactions that have not yet been posted (this happens when using the batch-approve flow):

1. A blue button appears above the grid: **"Post N Approved to Journal"**.
2. Click it to open a confirmation dialog: "Are you sure you want to post N approved transactions to the General Ledger? This action cannot be undone."
3. Click **"Post Transactions"** to confirm, or **"Cancel"** to go back.
4. A success toast appears: "Successfully posted N transactions to the journal!"

#### Matching a Bank Deposit to an Invoice

For incoming payments (positive amounts) that correspond to customer payments:

1. Click the **Match to Invoice** (link icon) on the transaction row.
2. A dialog opens showing outstanding invoices you can match to.
3. Select the matching invoice and confirm.
4. The transaction status changes to "Matched" and a link appears to view the associated payment.

### Tips and Common Mistakes

- **Always review low-confidence transactions** (red badges below 60%) -- the AI suggestion is less reliable and likely needs manual categorization.
- **Use "Approve High Confidence"** for efficiency -- it batch-approves well-categorized transactions in one click.
- **If the Approve button is grayed out**, click Edit first to assign an account. A transaction cannot be approved without a GL account.
- **Personal transactions** should be flagged using the "Personal" checkbox in the edit drawer, then either excluded or categorized appropriately. This affects the Personal/Business filter on reports.
- **Excluded transactions** are ignored in accounting. Use this for bank transfers, duplicates, or non-business items.

---

## 3. Creating and Sending Invoices

### Overview

Invoices are created from the Sales section. You add line items, set terms and tax, then save. Depending on your posting mode (Simple or Advanced), the invoice may immediately post to your General Ledger. You can email invoices directly from the application or print them.

### Prerequisites

- At least one **Customer** record created (under People > Customers)
- Optionally, **Products & Services** set up for quick line item entry
- Optionally, **Payment Terms** and **Tax Rates** configured

### Creating a New Invoice

1. In the sidebar, expand **Sales** and click **"Invoices"**.
2. The Invoices page shows a data grid with columns: Invoice #, Customer, Date, Due Date, Amount, Status, and Actions.
3. Click the **"New Invoice"** button in the top-right corner.
4. You are navigated to the **New Invoice** form page.

[Screenshot: Invoices list page showing the data grid with Draft, Sent, and Paid invoices, and the "New Invoice" button]

#### Filling Out the Invoice Form

The form has two sections: header fields and line items.

**Header Fields** (in a two-column grid):

| Field | Description |
|-------|-------------|
| **Invoice Number** | Auto-generated (e.g., "INV-0001"). Clear to enter your own. |
| **Customer** | Searchable dropdown. Start typing to find a customer. A **"+ Add Customer"** quick-add link is available. |
| **Issue Date** | Date picker, defaults to today. |
| **Due Date** | Date picker, defaults to 30 days from today. Auto-calculates when Payment Terms are selected. |
| **Status** | Dropdown: Draft, Sent, Paid, Overdue. Defaults to "Sent" in Simple Mode, "Draft" in Advanced Mode. |
| **Payment Terms** | Dropdown of active terms (e.g., "Net 30 (30 days)", "Due on Receipt (Immediate)"). Selecting a term auto-calculates the Due Date from Issue Date + term days. |
| **Tax Rate** | Dropdown of active tax rates (e.g., "Standard Tax (8.25%)"). Select "No Tax" to skip tax. |
| **Project** | Optional. Searchable dropdown to link the invoice to a project. |
| **Class** | Optional. Searchable dropdown for classification tagging. |

**Line Items Section:**

1. One blank line item row appears by default.
2. For each line item:
   - **Product/Service** -- Searchable dropdown. Selecting a product auto-fills Description and Unit Price.
   - **Taxable** -- Checkbox (checked by default). Uncheck to exclude this line from tax calculation.
   - **Description** -- Free text describing the item or service.
   - **Qty** -- Quantity (supports decimals).
   - **Unit Price** -- Price per unit.
   - The **line total** displays automatically on the right.
   - **Project** and **Class** selectors appear below each line for per-line tracking.
3. Click **"Add Item"** to add another line.
4. Click the **trash icon** to remove a line.

**Totals Section** (bottom-right):

- **Subtotal** -- Sum of all line amounts.
- **Tax** -- Shows the tax rate name, percentage, and calculated tax amount. If some lines are non-taxable, a "Taxable amount" note appears.
- **Total** -- Subtotal plus tax.

**Auto-Posting Indicator** (if Simple Mode is enabled):

- A yellow banner appears: "This invoice will post to your books when saved (AR + Revenue entries)."
- If status is Draft, a gray banner says: "Draft invoices don't affect your books until the status is changed."

5. Click **"Save Invoice"** to create the invoice.
6. You are returned to the Invoices list.

[Screenshot: New Invoice form showing the header fields, two line items with Product/Service selectors, and the Totals section with tax calculation]

### Viewing an Invoice

1. From the Invoices list, click the **eye icon** in the Actions column, or click anywhere on the row.
2. The Invoice View page shows a print-ready document layout with:
   - Company information (name, address, logo) on the left
   - Invoice details (number, date, due date, status badge) on the right
   - Customer billing information
   - Line items table with Description, Quantity, Unit Price, and Amount columns
   - Subtotal, Tax, and Total at the bottom

[Screenshot: Invoice View page showing the print-ready invoice document with company logo and line items]

### Sending an Invoice by Email

1. From the Invoice View page, click the **"Email"** button in the top-right action bar.
2. The **Email Invoice** modal opens with:
   - Pre-filled recipient email (from the customer record)
   - Subject line
   - Email body with invoice details
3. Review and modify as needed, then click **"Send"**.
4. An email history section below the invoice shows sent emails with timestamps and status.

### Printing an Invoice

1. From the Invoice View page, click the **"Print"** button.
2. The browser's print dialog opens. The invoice renders in a clean print layout with no navigation or action buttons.

### Editing an Existing Invoice

1. From the Invoices list, click **"Edit"** in the Actions column for the desired invoice.
2. The Edit Invoice form opens pre-filled with all existing data.
3. Make your changes and click **"Save Invoice"**.

### Duplicating an Invoice

1. From the Invoices list, click the **copy icon** in the Actions column.
2. A new invoice is created with the same customer, line items, and tax settings, but a new invoice number and today's date.
3. You are navigated to the Edit form for the new invoice.

### Tips and Common Mistakes

- **Simple Mode vs. Advanced Mode:** In Simple Mode (the default, recommended), saving an invoice with status "Sent" immediately creates journal entries (debit Accounts Receivable, credit Revenue). In Advanced Mode, invoices stay as drafts until posted. Check your posting mode in Settings > Transaction Posting.
- **Payment Terms auto-calculate the Due Date.** If you change the Issue Date after selecting terms, the Due Date recalculates automatically.
- **Line-item taxability matters.** If a product/service is non-taxable, the checkbox unchecks automatically when selected. Verify before saving.
- **The invoice number prefix** can be customized in Settings > Invoice Numbering.

---

## 4. Receiving Payments

### Overview

When a customer pays an invoice, you record the payment by selecting the customer, choosing the payment method and deposit account, and applying the payment to one or more outstanding invoices. This updates the invoice status and records the cash receipt.

### Prerequisites

- At least one outstanding invoice (status "Sent" or "Overdue") for a customer
- A deposit account (bank/asset account) set up in Chart of Accounts

### Recording a Payment

1. In the sidebar, expand **Sales** and click **"Receive Payment"**.
2. The **Received Payments** page displays a data grid with columns: Payment #, Reference #, Customer, Date, Amount, Method, Deposit Account, and Status.
3. Click the **"Receive Payment"** button in the top-right corner.
4. You are navigated to the **Receive Payment** form.

[Screenshot: Received Payments list page showing existing payments with Completed status and the "Receive Payment" button]

#### Filling Out the Payment Form

**Header Fields** (two-column grid):

| Field | Description |
|-------|-------------|
| **Payment Number** | Enter a payment reference (e.g., "PMT-001"). |
| **Customer** | Searchable dropdown. Once selected, the system loads that customer's unpaid invoices below. |
| **Payment Date** | Date picker, defaults to today. |
| **Reference Number** | Optional. Enter a check number, transaction ID, or other reference. |
| **Payment Method** | Required dropdown: Cash, Check, Credit Card, Debit Card, ACH/Bank Transfer, Wire Transfer, or Other. Defaults to "Check". |
| **Deposit To Account** | Required dropdown of active asset accounts (bank accounts). |
| **Total Amount** | Read-only. Auto-calculated from the sum of applied invoice amounts. |
| **Memo** | Optional multi-line text field for notes about this payment. |

[Screenshot: Receive Payment form showing the header fields with Customer selected and Payment Method set to "Check"]

#### Applying Payment to Invoices

After selecting a customer:

1. An **"Available Invoices"** table appears showing the customer's unpaid invoices with columns:
   - **Invoice #** -- the invoice number
   - **Due Date** -- the invoice due date
   - **Aging** -- a color-coded badge: "Current" (green), "Xd overdue" (yellow for 1-30 days, orange for 31-60, red for 61+)
   - **Total** -- the original invoice total
   - **Balance Due** -- the remaining unpaid amount
   - **Apply** button

2. Click the **"Apply"** button next to each invoice you want to apply the payment to.

3. The invoice moves to the **"Payment Applied To"** section below, showing:
   - The invoice number and balance due
   - An **"Amount to Apply"** text field pre-filled with the full balance due
   - A **trash icon** to remove the application

4. **For partial payments:** Edit the "Amount to Apply" field to enter a partial amount. The system validates that the applied amount does not exceed the balance due -- if it does, an error message appears: "Amount exceeds balance due ($X.XX)".

5. The **Total Payment** at the bottom updates automatically as you add or modify applications.

6. Click **"Receive Payment"** to save. The button is disabled until at least one invoice application is added and no overpayment errors exist.

[Screenshot: Receive Payment form with two invoices applied -- one for the full balance and one as a partial payment, showing the calculated Total Payment]

### Editing an Existing Payment

1. From the Received Payments list, click on a payment row to navigate to its edit page.
2. Modify the fields as needed and click **"Receive Payment"** to save.

### Tips and Common Mistakes

- **Select the customer first.** The invoice list only appears after choosing a customer. If "No unpaid invoices found for this customer" appears, verify the customer has Sent/Overdue invoices (not Drafts or already-Paid).
- **Partial payments are supported.** You can apply less than the full balance. The invoice status will update to "Partial" rather than "Paid."
- **The Total Amount is calculated, not entered.** It sums up all the "Amount to Apply" values from the invoice applications.
- **Watch for aging badges.** The red "Xd overdue" badges help prioritize which invoices to apply payments to first.
- **Overpayment prevention.** You cannot apply more than the invoice balance due. If you enter a higher amount, the field shows an error and the "Receive Payment" button disables.

---

## 5. Reviewing Reports

### Overview

Modern Accounting provides a suite of financial reports accessible from the Reports page. Key reports include Profit & Loss, Balance Sheet, AR Aging Summary, and many more. All reports support a Personal/Business filter and CSV export.

### Prerequisites

- Transactions posted to the General Ledger (via approved bank transactions or invoices)
- For AR/AP Aging: Outstanding invoices or bills in the system

### Accessing Reports

1. In the sidebar, click **"Reports"**.
2. The **Financial Reports** page displays a grid of report cards organized into sections:

**Financial Reports** (main section):
- **Profit & Loss** -- "Income statement showing revenues, expenses, and net income over a period"
- **Balance Sheet** -- "Statement of financial position showing assets, liabilities, and equity"
- **Statement of Cash Flows** -- "Cash inflows and outflows from operating, investing, and financing activities"
- **Trial Balance** -- "List of all accounts with their debit and credit balances"
- **General Ledger** -- "All transactions by account with running balances and beginning/ending balances"
- **Transaction Detail by Account** -- "All transactions affecting specific accounts with full details"
- **AR Aging Summary** -- "Outstanding customer invoices organized by age"
- **AP Aging Summary** -- "Outstanding vendor bills organized by age"
- **Customer Statement** -- "Account activity and outstanding balances for a customer"
- **Sales Tax Liability** -- "Tax collected on invoices by tax rate and period"
- **Expense Report** -- "Expenses grouped by category, vendor, or project"

**Sales Reports** section:
- **Sales by Customer** -- "Sales breakdown showing customer, invoice count, amount, and percentage of total sales"
- **Sales by Product/Service** -- "Sales breakdown showing product/service, quantity sold, amount, and percentage of sales"

**Inventory Reports** section (only visible if Inventory feature is enabled):
- Inventory Valuation Summary, Inventory Stock Status, Physical Inventory Worksheet

3. Click any report card to navigate to that report.

[Screenshot: Financial Reports page showing the grid of report cards with icons and descriptions]

### Profit & Loss Report

1. Click **"Profit & Loss"** on the Reports page.
2. The report page shows:
   - A **"Back to Reports"** link at the top
   - The **report header** with title "Profit & Loss Statement", subtitle "Income Statement", date range, and an **"Export CSV"** button
   - **Date Range Picker** with **Start Date** and **End Date** fields (defaults to the first of the current month through today)
   - **Personal/Business Filter** toggle with options: **Business**, **Personal**, **All**

3. The report table displays:
   - **Revenue** section header
   - Individual revenue accounts with their amounts (indented)
   - **Total Revenue** subtotal row
   - **Expenses** section header
   - Individual expense accounts with their amounts (indented)
   - **Total Expenses** subtotal row
   - **Net Income** total row (Revenue minus Expenses)

4. To change the date range, adjust the Start Date and End Date fields. The report refreshes automatically.
5. To filter by Personal/Business, click the corresponding option. "Business" (default) shows only business transactions, "Personal" shows only personal, "All" shows everything.
6. Click **"Export CSV"** to download the report data.

[Screenshot: Profit & Loss report showing Revenue and Expense sections with account-level detail, date range picker, and Personal/Business filter set to "Business"]

### Balance Sheet

1. Click **"Balance Sheet"** on the Reports page.
2. The report page shows:
   - **"Back to Reports"** link
   - Report header: "Balance Sheet" / "Statement of Financial Position"
   - **As of Date** field (defaults to today)
   - **Personal/Business Filter** toggle

3. The report table displays:
   - **ASSETS** section with individual asset accounts and **Total Assets** subtotal
   - **LIABILITIES** section with individual liability accounts and **Total Liabilities** subtotal
   - **EQUITY** section with equity accounts, **Retained Earnings** (calculated from Revenue - Expenses), and **Total Equity** subtotal
   - **Total Liabilities & Equity** grand total

4. A **balance check** runs automatically. If Assets do not equal Liabilities + Equity, a yellow warning banner appears: "Warning: The balance sheet is out of balance."

5. Change the **As of Date** to see the balance sheet as of any historical date.

[Screenshot: Balance Sheet report showing Assets, Liabilities, and Equity sections with the "As of Date" picker]

### AR Aging Summary

1. Click **"AR Aging Summary"** on the Reports page.
2. The report page shows:
   - **"Back to Reports"** link
   - Report header: "Accounts Receivable Aging Summary" / "Outstanding invoices by age"
   - **Personal/Business Filter** toggle

3. **Summary cards** appear across the top showing totals for each aging bucket:
   - **Current** (gray)
   - **1-30 Days** (yellow)
   - **31-60 Days** (orange)
   - **61-90 Days** (red)
   - **90+ Days** (dark red)
   - **Total AR** (indigo, highlighted)

4. Below the summary cards, the **report table** shows one row per customer with columns:
   - **Customer** name
   - **Current** -- invoices not yet past due
   - **1-30 Days** -- invoices 1-30 days past due
   - **31-60 Days** -- invoices 31-60 days past due
   - **61-90 Days** -- invoices 61-90 days past due
   - **90+ Days** -- invoices more than 90 days past due
   - **Total** -- total outstanding for that customer

5. A **Total** row at the bottom sums all customers.

6. If no outstanding invoices exist, a message displays: "No outstanding invoices found."

[Screenshot: AR Aging Summary showing summary cards at the top and the customer-by-aging-bucket table below, with a Total row]

### Exporting and Printing Reports

All reports support:

- **Export CSV** -- Click the "Export CSV" button in the report header to download the data.
- **Print** -- Use your browser's print function (Ctrl+P / Cmd+P). Reports render in a clean print layout with non-essential UI elements hidden.

### Tips and Common Mistakes

- **Reports pull from journal entries**, not raw transactions. If data seems missing, check that transactions have been approved and posted to the General Ledger.
- **The Personal/Business filter** defaults to "Business." If you see unexpectedly low numbers, check whether some transactions were flagged as personal.
- **The P&L date range defaults to the current month.** To see year-to-date, change the Start Date to January 1.
- **The Balance Sheet is cumulative** -- it shows all transactions from the beginning of time through the As of Date.
- **The Payroll Summary report** and **Tax Forms** only appear if the Payroll feature is enabled in Settings > Feature Visibility.

---

## 6. Company Settings

### Overview

The Settings page lets you configure company-wide preferences that affect how the application behaves, including appearance, invoicing behavior, company information, email, and feature visibility.

### Accessing Settings

1. In the sidebar, click **"Settings"** (near the bottom).
2. The page title is "Company Settings" and it is organized into collapsible sections with a sidebar navigation for quick access.

### Key Settings Sections

#### Appearance

- **Theme** -- Choose between **Light**, **Dark**, or **System** (follows your device setting).

[Screenshot: Settings page Appearance section showing the three theme buttons]

#### Currency Format

- **Locale / Currency** -- Select your preferred currency display format (e.g., "US Dollar ($1,234.56)", "Euro", "British Pound"). A preview shows how values will display.

#### Transaction Posting (Posting Mode)

This is one of the most important settings. It controls how invoices and bills affect your General Ledger.

- **Simple Mode** (Recommended) -- Like QuickBooks Online. Invoices and bills immediately create journal entries when saved with a non-Draft status. A lightning bolt icon indicates this mode.
- **Advanced Mode** -- Documents remain as drafts until explicitly posted. Ideal for organizations with approval workflows.

**Note:** Changing this setting only affects new transactions. Existing posted entries are not affected.

[Screenshot: Transaction Posting section showing Simple Mode selected with the "Recommended" badge]

#### Invoice Numbering

- **Invoice Number Prefix** -- Set a custom prefix for auto-generated invoice numbers (e.g., "INV-", "ACTO-").

#### Payment Terms

- **Default Payment Term** -- Select the default term applied to new invoices (e.g., "Net 30"). Customers can have their own default term that overrides this.

#### Account Defaults

- Configure default accounts for Accounts Receivable, Accounts Payable, and Revenue. These are used when auto-posting invoices and bills.

#### Company Logo

- Upload your company logo (image files, max 2MB). The logo appears in the sidebar header, on printed invoices, and in emailed invoices.

#### Company Information

- **Company Name** -- displayed in the sidebar and on documents
- Address, phone, email, and website fields

#### Tax Information

- **Employer Identification Number (EIN)** -- used for W-2 and 1099 tax form generation

#### Email Settings

- Configure email delivery via SMTP or Microsoft Graph for sending invoices and reminders.

#### Feature Visibility

- Toggle features on or off: **Sales Receipts**, **Mileage**, **Payroll**, **Inventory**. Disabling a feature hides it from the sidebar and all related pages.

#### Onboarding

- Configure the guided learning experience for new users.

### Saving Settings

After making changes to any section, scroll to the bottom and click the **"Save Settings"** button. A success message appears: "Settings saved successfully!"

[Screenshot: Settings page showing the Save button at the bottom with a success message]

### Tips and Common Mistakes

- **Posting Mode is the most impactful setting.** If invoices are not appearing in reports, check whether you are in Advanced Mode and invoices are stuck as Drafts.
- **Feature Visibility is admin-only.** Hiding a feature removes it from all users' navigation. Use this to simplify the interface if your business does not use certain features.
- **The company logo should be under 2MB.** Larger files are rejected.
- **Email settings must be configured** before you can email invoices or send payment reminders.

---

## Appendix: Quick Reference

| Task | Navigation Path |
|------|----------------|
| Review bank transactions | Sidebar > **Transactions** |
| Import bank CSV | Sidebar > Import & Sync > **Import** > CSV Import tab |
| Connect bank (Plaid) | Sidebar > Import & Sync > **Bank Connections** |
| Create invoice | Sidebar > Sales > **Invoices** > **New Invoice** |
| View/email/print invoice | Sidebar > Sales > **Invoices** > click row > View page |
| Receive payment | Sidebar > Sales > **Receive Payment** > **Receive Payment** |
| Profit & Loss report | Sidebar > **Reports** > **Profit & Loss** |
| Balance Sheet | Sidebar > **Reports** > **Balance Sheet** |
| AR Aging | Sidebar > **Reports** > **AR Aging Summary** |
| Company settings | Sidebar > **Settings** |
| Chart of Accounts | Sidebar > Accounting > **Chart of Accounts** |
