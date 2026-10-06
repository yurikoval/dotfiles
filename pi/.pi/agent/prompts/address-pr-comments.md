---
description: Address unresolved GitHub PR review comments with file-disjoint grouping
argument-hint: "[PR number]"
---
Address unresolved GitHub PR review comments for ${1:-the current branch}.

Use the `address-pr-comments` skill.

Workflow constraints:
- Fetch all unresolved, non-outdated review threads once.
- Group by logical concern and file-disjointness.
- If there is one group, fix it yourself; do not spin up an agent.
- If there are multiple file-disjoint groups and subagent preflight passed, dispatch all fix agents in one parallel subagent call.
- Each fix agent gets owned files, forbidden files, exact comments, focused tests, and `do not commit` unless the skill explicitly handles commits.
- Each group must commit separately and resolve only the threads it fixed.
- If subagent preflight fails, fix groups sequentially yourself instead of retrying failed agents.
- Run focused tests after each group when practical, then final tests/linters appropriate to the repo.
- Use `pi-quiet-run --tail 160 -- <command>` for noisy test suites.
- Use wait interval ${2:-1 minute} when polling for Copilot review comments.

Report groups, commits, resolved threads, skipped threads, and verification.
