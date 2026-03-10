# AI Rules

## General approach
- Prefer minimal diffs.
- Preserve existing behaviour unless a change is explicitly requested.
- Do not refactor unrelated files.
- Explain root cause before proposing major fixes.
- When possible, identify whether a problem is in React, RPC, trigger logic, or RLS.

## UI rules
- Do not redesign layout unless explicitly asked.
- Preserve existing admin/SaaS styling.
- Keep shared layout ownership where it already exists.
- Avoid cosmetic rewrites.

## Supabase rules
- Treat SQL, RLS, RPCs, triggers, and Edge Functions as first-class logic.
- Before changing policies or functions, explain the impact.
- Highlight any security implications.
- Prefer safe, explicit migrations over hand-wavy suggestions.
- Call out mismatches between frontend assumptions and DB enforcement.

## Coding rules
- Keep changes focused and production-friendly.
- Avoid introducing new abstractions unless clearly justified.
- Prefer consistent naming with the existing codebase.
- Preserve current site/branch logic.

## Workflow rules
- When debugging, trace the full path:
  1. UI
  2. Supabase client call
  3. RPC or insert/update
  4. RLS/policy/triggers
  5. notifier or downstream side effects

- For any bug, state:
  - likely root cause
  - affected files
  - safest fix
  - any migration needed