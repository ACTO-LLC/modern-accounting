# Job Costing Guide

A walkthrough of the Job Costing module in Modern Accounting: tracking labor, materials, subcontractors, and committed costs against jobs (projects) and reading the resulting reports — profitability, budget vs. actual, work-in-progress, and unbilled costs.

> **Opt-in module.** Job Costing is off by default at the company level. An admin enables it from Settings; once on, the cost-code surfaces appear across project, transaction, and report pages. Companies that don't use project-based billing can leave it off and see no change.

---

## 1. Enabling Job Costing

1. In the sidebar, click **Settings**.
2. Scroll to the **Feature Visibility** section.
3. Toggle **Job Costing** on.
4. Click **Save Settings**. A confirmation toast appears.

When the toggle is on, Modern Accounting exposes:

- A **Cost Codes** section and two cost-side budget fields on the Project edit page.
- A **Cost Code** picker next to the existing Project picker on the Bill, Expense, Purchase Order, Vendor Credit, and Time Entry forms.
- A **Job Costing Reports** section on the Reports page.

Turning Job Costing off later hides those surfaces without deleting cost codes, budgets, or posted job-cost data. Flipping the toggle back on restores everything as it was.

[Screenshot: Settings > Feature Visibility section with the Job Costing toggle in the on position]

---

## 2. Setting Up Cost Codes on a Project

Cost codes are line-item buckets under a project — typical examples: `01-100 Site Work`, `02-200 Framing`, `03-300 Electrical`. Each code can carry an optional budgeted amount and budgeted hours so reports compare actuals to plan.

### Project-level budget fields

1. In the sidebar, click **Projects**.
2. Click an existing project (or **New Project** to create one).
3. On the Edit Project form, two cost-side fields sit below Budgeted Hours / Budgeted Amount:
   - **Estimated Cost** — your internal cost estimate (what the job will cost you to deliver).
   - **Contract Amount** — the explicit contract value with the customer.
4. Fill these in so WIP and Profitability reports can compute % complete and margin.
5. Click **Update Project**.

[Screenshot: Edit Project form showing Estimated Cost and Contract Amount fields with values entered]

### Adding cost codes

Cost codes live in a section below the Project form on existing projects (save the project first):

1. On the Edit Project page, scroll to the **Cost Codes** card.
2. Click **Add Cost Code**. A modal opens.
3. Fill in:
   - **Code** — short identifier, e.g. `01-100`.
   - **Description** — human-readable label, e.g. `Site Work`.
   - **Budgeted Amount** (optional) — dollar budget for this code.
   - **Budgeted Hours** (optional) — hour budget.
   - **Sort Order** (optional) — lower numbers appear first; defaults to 0.
4. Click **Add**. The modal closes and the code appears in the grid.
5. The totals card at the top of the section updates with the sum of all budgeted amounts and hours.

To edit or delete a code, use the pencil or trash icons in the actions column. Deletion is permanent and only allowed if no transactions reference the code.

[Screenshot: Cost Codes section on the Edit Project page showing a totals card and a DataGrid with three codes]

---

## 3. Tagging Transactions with a Cost Code

With Job Costing on, the Cost Code picker appears next to the existing Project picker on every form that captures cost. The picker is **disabled** ("Pick a project first") until a project is selected, and the available codes are scoped to that project. Changing the project clears any previously-selected cost code.

| Form | Where the picker lives |
|---|---|
| **Bill** (`/bills/new`, `/bills/:id/edit`) | One picker per line item |
| **Expense** (`/expenses/new`, `/expenses/:id/edit`) | One picker at the header (expenses don't have line items in MA) |
| **Purchase Order** (`/purchase-orders/new`, `/purchase-orders/:id/edit`) | Header default *and* one per line (line wins when both set) |
| **Vendor Credit** (`/vendor-credits/new`, `/vendor-credits/:id/edit`) | One picker per line item |
| **Time Entry** (`/time-entries/new`) | One picker at the header, plus a **Cost Rate** input (employer's cost per hour, separate from the billable rate) |

### What happens after you save

When a tagged transaction posts (a Time Entry is approved, a Bill or Expense is saved, a PO is moved out of Draft), a corresponding row is recorded in the underlying JobCosts ledger:

- **Time Entries** post `Hours × CostRate` when status flips to `Approved`. Un-approving removes the row.
- **Bill lines, Expenses, Vendor Credit lines** post immediately on save. Vendor Credits post a **negative** amount (a credit reduces job cost).
- **PO lines** post with a `committed` flag so reports can show them separately. When the PO converts to a Bill or moves to `Received` / `Cancelled`, the committed entry drops off and the Bill's lines take over as actuals.

You don't interact with the ledger directly. You see its effects in the reports below.

[Screenshot: Bill form line item showing Project picker on the left and Cost Code picker enabled to the right]

---

## 4. The Four Job Costing Reports

All four live in a **Job Costing Reports** section on the main Reports page (visible when Job Costing is on). Each report supports CSV export and renders a disabled-state card if a user navigates directly to its URL with Job Costing turned off.

### 4.1 Job Profitability

**`/reports/job-profitability`** — Per-job revenue vs. cost vs. gross margin.

- **Revenue to Date** — sum of posted invoice lines tagged to the project, minus non-voided credit memos tagged to it.
- **Cost to Date** — sum of actuals (labor, bills, expenses, overhead) tagged to the project.
- **Committed Cost** — sum of open POs tagged to the project (shown separately).
- **Gross Margin** — Revenue − Cost.
- **GM %** — margin as a percentage of revenue.

Filters: Customer, Status (Active / Completed / OnHold / All), and an **Include committed costs** toggle that folds open POs into the cost column and recomputes margin on the fly.

Use this report to answer "which jobs are making money?"

[Screenshot: Job Profitability report showing a table of jobs with the Include Committed toggle off]

### 4.2 Budget vs. Actual by Cost Code

**`/reports/job-budget-actual`** — Per-job drill-in at the cost-code level.

For each cost code on the selected project: Budget, Committed (open POs), Actual, Total, Variance, % Used.

A synthetic **"(Uncoded)"** row appears at the bottom of the table if the project has any costs tagged to the project but not to a specific cost code — so nothing slips through unaccounted.

Filters: required Job selector, and an **Include committed** toggle that adds a Committed column and folds committed amounts into the effective actual / variance.

Use this report to answer "are we on budget on this job?"

[Screenshot: Budget vs. Actual report for one job showing several cost-code rows, the Uncoded bucket at the bottom, and the totals row]

### 4.3 Work in Progress (WIP)

**`/reports/wip`** — Earned-vs-billed revenue using the **cost-to-cost** percent-complete method.

- **% Complete** = Cost to Date / Estimated Cost.
- **Earned Revenue** = % Complete × Contract Amount.
- **Billed to Date** = same definition as Job Profitability's revenue.
- **Over / (Under) Billing** = Billed − Earned.
  - **Positive (amber)** = over-billed; a liability (work owed to customer).
  - **Negative (blue)** = under-billed; an asset (work earned but not yet invoiced).

> **Review with your accountant.** Percent-complete accounting affects revenue recognition, and this report uses the cost-to-cost method (no manual % override). The report is reporting-only — it does not write GL journal entries for earned revenue. Confirm the method matches your firm's policy before relying on the numbers for external financial reporting. The report renders an amber reminder banner at the top to that effect.

[Screenshot: WIP report showing the amber accountant-review banner above the table]

### 4.4 Unbilled Costs

**`/reports/unbilled-costs`** — Billable costs that haven't been pulled onto a customer invoice. Drives the "go invoice this" workflow.

Rows are grouped by job with a chevron to expand into per-source detail (Time entry, Bill line, or Expense). Source-specific gating:

- **Time entries** — included when `IsBillable = 1` and the entry has no invoice linkage. The strictest gate (Time Entries carry full invoice-linkage data).
- **Bill lines** — every project-tagged line appears. (Bill lines don't carry an invoice-linkage column, so the report can't tell which lines have already been invoiced; treat the list as a working set rather than an exact ledger.)
- **Expenses** — every project-tagged, non-voided expense with a customer appears. (Same linkage caveat as Bill lines.)
- **Vendor credits** — excluded. Credits reduce cost, not work to invoice.
- **Overhead allocations** — excluded. Not directly invoiceable.

Filter: Customer.

The report is read-only: use it to identify what needs to be invoiced, then create the invoice from the Invoices page.

[Screenshot: Unbilled Costs report showing one project expanded to reveal Time and Bill rows underneath]

---

## 5. Tips and Common Mistakes

- **Job Costing is per-company.** If you don't see the surfaces above, check Settings > Feature Visibility. Other users won't see any of it until an admin turns it on.
- **Cost codes are per-project.** Each project has its own set. There's no shared library that propagates across projects — define cost codes on each job that needs them.
- **Cost Rate vs. Hourly Rate on Time Entries.** Hourly Rate is what the customer pays; Cost Rate is what the employee costs the company. They're separate fields. Job Profitability and WIP only see Cost Rate, so leave both populated to keep margin numbers honest.
- **PO commitments don't double-count when invoiced.** Once a PO converts to a Bill (`ConvertedToBillId` set) or moves to `Received`, the committed entry drops off and the Bill's lines post as actuals. The cost appears only once.
- **`(Uncoded)` rows in Budget vs. Actual.** These represent transactions tagged to the project but not to a cost code. If you want everything attributed, edit the source transactions and pick a cost code.
- **Reports aggregate all-time.** The four reports show cumulative numbers across all dates; use them as point-in-time snapshots.
- **Turning Job Costing off doesn't delete data.** The cost-code columns on saved transactions stay populated and the cost codes themselves remain on the projects — flipping the flag back on restores the full UI exactly as it was.

---

## Appendix: Quick Reference

| Task | Navigation Path |
|---|---|
| Enable Job Costing | Sidebar > **Settings** > Feature Visibility > **Job Costing** toggle |
| Add cost codes to a project | Sidebar > **Projects** > select project > Cost Codes section > **Add Cost Code** |
| Set project budget fields | Sidebar > **Projects** > select project > **Estimated Cost** + **Contract Amount** |
| Tag a Time Entry with a cost code | Sidebar > **Time Tracking** > **Log Time** > select Project, then Cost Code |
| Tag a Bill line with a cost code | Sidebar > Purchasing > **Bills** > **New Bill** > on each line item, select Project + Cost Code |
| Tag a PO with a cost code | Sidebar > Purchasing > **Purchase Orders** > **New Purchase Order** > set header default *or* per-line |
| Job Profitability report | Sidebar > **Reports** > **Job Profitability** |
| Budget vs. Actual report | Sidebar > **Reports** > **Budget vs. Actual by Cost Code** |
| WIP report | Sidebar > **Reports** > **Work in Progress** |
| Unbilled Costs report | Sidebar > **Reports** > **Unbilled Costs** |
