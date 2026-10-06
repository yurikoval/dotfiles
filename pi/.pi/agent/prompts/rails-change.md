---
description: Token-lean Rails implementation workflow with focused agents and quality gates
argument-hint: "<task>"
---
Implement this Rails task token-efficiently: $ARGUMENTS

Workflow:
1. Use `rails-reader` for narrow recon if the code location is unclear. If subagents are unavailable, use grep/find/rg and narrow reads yourself.
2. Inspect project test/lint commands once before running them.
3. State the smallest safe implementation stage before editing.
4. Keep architecture, data modelling, security-sensitive choices, and final review in the primary agent.
5. Delegate only file-scoped edits or focused test fixes. Subagents must not commit.
6. Add/update specs with business logic changes.
7. Run focused specs first. Use `pi-quiet-run --tail 120 -- <command>` for noisy commands. Run broader suite/Standard/i18n/Brakeman only at the end or when risk justifies it.
8. Keep a compact ledger of stage, files, tests, commits, risks, and next step.
9. Use `rails-reviewer` after code exists if the change touches jobs, tenancy, callbacks, state machines, cache contracts, or secrets.
10. Commit atomic slices.

Do not overengineer. Prefer existing Rails and project patterns.
