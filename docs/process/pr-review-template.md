# PR Review Summary Template

## Overview

**PR:** #[NUMBER] - [TITLE]
**Date:** [DATE]
**Reviewer:** [Claude / Copilot / Human]

[Brief description of the PR and review outcome]

---

## Review Process

### 1. Request Reviews
- [ ] Request Copilot review: `@Copilot please review this pull request`
- [ ] Review Copilot feedback and suggestions
- [ ] Perform independent code review if needed

### 2. Analyze & Identify Issues
- [ ] Review all changed files
- [ ] Check for consistency with existing patterns (see CLAUDE.md)
- [ ] Identify potential bugs, improvements, or missing functionality
- [ ] Document findings below

### 3. Implement Changes
- [ ] Implement Copilot's suggested changes
- [ ] Implement any additional improvements identified
- [ ] Fix any bugs discovered during review
- [ ] Push changes to PR branch

### 4. Test & Verify
- [ ] Run relevant tests locally: `VITE_BYPASS_AUTH=true npx playwright test [test-file]`
- [ ] Verify all tests pass
- [ ] Re-run full test suite if changes affect shared code

---

## Findings & Implemented Changes

### Issues Identified

| # | Issue | Severity | Source |
|---|-------|----------|--------|
| 1 | [Description] | Low/Med/High | Copilot / Independent Review |

### Changes Implemented on PR Branch

**Files Modified:**
- `[file path]`

| Issue # | Change | Description |
|---------|--------|-------------|
| 1 | [Change name] | [What was changed and why] |

### Additional Fixes (pushed to main)

> Use this section if the review uncovered bugs in existing code outside the PR scope.

**Files Modified:**
- `[file path]`

| Issue | Fix Applied |
|-------|-------------|
| [Description of bug] | [Description of fix] |

---

## Commits

| Commit | Branch | Message |
|--------|--------|---------|
| `[hash]` | [branch] | [message] |

---

## Test Results

```
[Paste test output here]
```

---

## Checklist

- [ ] Copilot suggestions reviewed and implemented
- [ ] Independent review findings addressed
- [ ] All changes pushed to PR branch
- [ ] All tests pass
- [ ] Code follows project patterns (see CLAUDE.md)
- [ ] No security vulnerabilities introduced
- [ ] Any bugs in existing code fixed and pushed to main (if applicable)
- [ ] PR ready for merge

---

## Notes

- [Any additional context, warnings, or follow-up items]

---

## Related Links

- PR: [URL]
- Issue: [URL] (if applicable)
- Related PRs: [URLs] (if applicable)
