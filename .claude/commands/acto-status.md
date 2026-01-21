# ACTO Status - Check Loop Progress

Display the current status of any active ACTO loop or recent results.

## Usage
`/acto-status`

## Actions

1. Check for any recent `<acto-complete>` or `<acto-escape>` markers in conversation
2. Summarize:
   - Issue being worked on
   - Current iteration count
   - Errors encountered
   - Approaches tried
   - Time elapsed
   - Current state (running/complete/escaped)

## Output Format

```
ACTO Loop Status
================
Issue: #142 - Estimates convert button not working
State: Running | Complete | Escaped
Iterations: 3/20
Time: 2m 30s
Last Error: TS2322 (attempts: 2/3)
Approaches Tried:
  1. Changed onClick handler
  2. Checking Zod schema types
```
