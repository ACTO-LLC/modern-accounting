import { test, expect } from '../coverage.fixture';

/**
 * Demo: Job Costing
 *
 * Walks through the Job Costing module end to end: a project's cost-code
 * budget, adding a cost code live, and the Budget vs. Actual and Job
 * Profitability reports — all driven against the seeded demo job
 * "Riverside Office Buildout".
 *
 * Run with: npx playwright test --config=playwright.demo.config.ts job-costing-demo
 *
 * Prereqs (set up by the demo environment, not by this spec):
 *   - Job Costing feature flag ON for the company
 *   - Seeded project "Riverside Office Buildout" with cost codes + posted
 *     JobCosts (labor/material actuals + open-PO commitments) — run
 *     job-costing-demo.seed.sql before recording. Re-run it before each
 *     recording so the live "add cost code 05-500" step starts from a clean
 *     state (the seed deletes and recreates the job).
 *
 * Deliberate pauses (demoPause) keep each step viewable in the recording.
 */

const JOB_NAME = 'Riverside Office Buildout';

// Demo pauses — make actions viewable in the recorded video.
const demoPause = (ms = 1200) => new Promise((resolve) => setTimeout(resolve, ms));

test.describe('Job Costing Demo', () => {
  test('track a job from cost-code budget to budget-vs-actual reporting', async ({ page }) => {
    // Cap action waits so a mis-targeted selector fails fast instead of
    // stalling on the 5-minute test timeout. Assertions keep the config's
    // own (longer) expect timeout.
    page.setDefaultTimeout(20000);

    // ── Scene 1: Projects list ──────────────────────────────────────────────
    await page.goto('/projects');
    await expect(page.getByRole('heading', { name: /Projects/i })).toBeVisible();
    await demoPause(2000);

    // ── Scene 2: Open the job — show budget progress + cost-side fields ──────
    await page.getByText(JOB_NAME, { exact: false }).first().click();
    await expect(page.getByRole('heading', { name: /Edit Project/i })).toBeVisible();
    await demoPause(1500);

    // The Cost Codes section only renders when Job Costing is on.
    const costCodesHeading = page.getByRole('heading', { name: 'Cost Codes' });
    await costCodesHeading.scrollIntoViewIfNeeded();
    await expect(costCodesHeading).toBeVisible();
    await demoPause(1500);

    // Show the existing seeded cost codes in the grid.
    await expect(page.getByText('01-100')).toBeVisible();
    await expect(page.getByText('Site Work')).toBeVisible();
    await demoPause(2000);

    // ── Scene 3: Add a cost code live ───────────────────────────────────────
    await page.getByRole('button', { name: /Add Cost Code/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await demoPause(1000);

    // MUI appends a required asterisk to the accessible name (e.g. "Code *"),
    // so match with a leading-anchored regex rather than an exact string.
    await dialog.getByLabel(/^Code/).fill('05-500');
    await demoPause(500);
    await dialog.getByLabel(/^Description/).fill('Landscaping');
    await demoPause(500);
    await dialog.getByLabel(/^Budgeted Amount/).fill('15000');
    await demoPause(500);
    await dialog.getByLabel(/^Budgeted Hours/).fill('60');
    await demoPause(800);

    await dialog.getByRole('button', { name: /^Add$/ }).click();
    // New code lands in the grid and the totals card recomputes.
    await expect(page.getByText('05-500')).toBeVisible();
    await expect(page.getByText('Landscaping')).toBeVisible();
    await demoPause(2500);

    // ── Scene 4: Budget vs. Actual by Cost Code report ──────────────────────
    await page.goto('/reports/job-budget-actual');
    await expect(
      page.getByRole('heading', { name: /Budget vs\. Actual by Cost Code/i })
    ).toBeVisible();
    await demoPause(1500);

    // Pick the job — the report is keyed off a required Job selector.
    await page.selectOption('#bva-job-select', { label: JOB_NAME });
    await demoPause(1500);

    // The table populates: Budget / Committed / Actual / Total / Variance / % Used.
    await expect(page.getByRole('cell', { name: '01-100' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Variance' })).toBeVisible();
    // The (Uncoded) bucket proves no project cost slips through unattributed.
    await expect(page.getByRole('cell', { name: '(Uncoded)' })).toBeVisible();
    await demoPause(2500);

    // Toggle committed costs off, then back on, to show the effect on
    // effective actual / variance — the report's headline interaction.
    const committedToggle = page.locator('#include-committed');
    await committedToggle.uncheck();
    await demoPause(1800);
    await committedToggle.check();
    await demoPause(1500);

    // Closing beat: rest on the populated report. The (Uncoded) bucket proves
    // no project cost slips through unattributed.
    await expect(page.getByRole('cell', { name: '(Uncoded)' })).toBeVisible();
    await demoPause(2500);
  });
});
