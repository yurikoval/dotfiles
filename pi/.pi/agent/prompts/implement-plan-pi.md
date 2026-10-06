---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*), Bash(git diff:*), Bash(npm run:*), Bash(npm test:*), Bash(pi-quiet-run:*)
argument-hint: [plan.md]
description: Implement a plan with bounded subagents, quiet verification, atomic commits, PR creation, and Copilot review
---
Implement the plan token-efficiently, with high quality, atomic commits, a GitHub PR, and Copilot review follow-up.

Plan location: $1

## Workflow

1. **Preflight once**
   - Check `git status --short` and current branch.
   - Read the plan file once, then work from a compact task ledger.
   - Inspect project scripts once (`package.json`, `Gemfile`, or repo docs) and reuse the exact commands. Do not guess commands like `npm run lint` or workspace flags.
   - Delegation is optional. Do not run a mandatory preflight agent when the plan already identifies exact files and commands.

2. **Create a compact execution ledger**
   Keep this in the conversation and update after each stage:
   ```md
   Current state:
   - Stage:
   - Files changed:
   - Commits:
   - Tests passing:
   - Reviewer findings:
   - Next step:
   ```

3. **Read narrowly**
   - Prefer codebase-memory, `rg`, `find`, and `git diff` before `read`.
   - Read only exact line ranges needed for the current stage.
   - Do not read large generic docs or full skill files unless they directly govern the edit.

4. **Delegate bounded, file-disjoint work**
   - Use at most two direct, file-disjoint subagents for scoped implementation, search summaries, boilerplate, or focused test fixes.
   - Every delegated prompt must say: "Do not delegate or call another agent; use at most 8 tool calls."
   - Keep architecture, data modelling, security-sensitive choices, and final judgement in the primary agent.
   - Each subagent task must include: owned files, forbidden files, focused tests to run, "do not commit", and this return contract:
     ```md
     Changed files:
     Tests run:
     Risks:
     Follow-up needed:
     ```

5. **Implement in DAG order**
   - Follow dependency order from the plan.
   - Prefer stages: backend/data -> preferences/config -> frontend plumbing -> UI -> review hardening.
   - Make minimal, readable changes. Business logic changes must include focused tests in the same stage.
   - Parallelize only when two tasks are genuinely file-disjoint; parallelism reduces latency, not token usage.

6. **Verify quietly**
   - Run focused tests first.
   - Use `pi-quiet-run` for noisy commands, for example:
     ```bash
     pi-quiet-run --tail 120 -- npm run test:only -- path/to/test.ts
     pi-quiet-run --tail 160 -- npm test
     ```
   - If a quiet run fails, rerun only the failed focused command with enough output to diagnose.
   - Run full gates once near the end unless risk requires earlier.

7. **Review by diff**
   - Use at most one reviewer subagent, and only after implementation and focused tests pass.
   - Ask it to review `git diff` / recent commits, not whole files.
   - Limit reviewer scope to correctness, security/tenancy, performance, persistence races, and test coverage.
   - Fix blockers before final commit.

8. **Commit atomically**
   - Commit each coherent stage separately.
   - Do not mix plan/docs, backend, preferences, frontend, and hardening unless the diff is truly inseparable.

9. **Create a Pull Request**
   - After implementation is complete and commits are ready, run `/create-pr` to create a Pull Request on GitHub.

10. **Request Copilot review**
   - Run `/request-copilot-review` to get the PR reviewed.

11. **Address Copilot feedback**
   - Wait for Copilot to leave a review, then run `/address-pr-comments` with wait interval 1 minute.
   - Fix anything that needs fixing and verify the relevant tests/gates again.

## Final response

Report only:
- commits created;
- Pull Request created;
- Copilot review requested and comments addressed;
- tests/gates run and result;
- notable risks or follow-up, if any;
- changed files summary.
