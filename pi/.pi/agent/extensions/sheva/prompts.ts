import type { MergeCheckReport } from "./github";
import { mergeCheckSummary } from "./github";
import { SHEVA_PR_CHECKS_SCRIPT } from "./runtime";

export function planPrompt(description: string, mode: "initial" | "after-grill" = "initial"): string {
	const grillPolicy =
		mode === "initial"
			? `
Nested command policy for Sheva:
- If SHEVA_TRACK_ITEM_ID is present and unresolved product or architecture decisions block the plan, do not run or request /skill:grill-me-once. Create Track decision comment(s) instead, then end with exactly one marker line using real returned comment ids:
  SHEVA_WAITING_FOR_DECISIONS: <cm_comment_id_1>,<cm_comment_id_2>
- If SHEVA_TRACK_ITEM_ID is present and SHEVA_DECISION_ASSIGNEE_USER_ID is missing, add a normal task comment explaining TRACK_ORCH_DECISION_ASSIGNEE_USER_ID is missing, then stop.
- If SHEVA_TRACK_ITEM_ID is absent and unresolved product or architecture decisions truly require the grill workflow before a plan can be written, stop before writing the plan and end your response with exactly:
  SHEVA_NEXT_COMMAND: /skill:grill-me-once <brief for the grilling session>
- If no grill workflow or Track decision is needed, write the plan file and end with exactly:
  SHEVA_NEXT_COMMAND: none`
			: `
Nested command policy for Sheva:
- /skill:grill-me-once has already run. Use the clarified answers in this conversation.
- Write the plan file now. Do not defer to another slash command.
- End with exactly: SHEVA_NEXT_COMMAND: none`;

	return `Follow the provided \`plan_description\` and \`plan_requirements\` to draft a detailed but token-lean implementation plan.
${grillPolicy}

## Workflow

1. **Index / orient once**
   - Check codebase-memory index status and index only if needed.
   - Inspect repo shape with codebase-memory, \`find\`, \`ls\`, or \`rg\`; avoid broad file reads.
   - If a substantive implementation plan matching this request already exists, validate its path and scope with at most two narrow reads, do not rewrite/research/review it again, and return that path with \`SHEVA_NEXT_COMMAND: none\`.

2. **Classify the request**
   - Decide whether \`plan_description\` is a product request or engineering request.

3. **Clarify assumptions**
   - Ask only decision-changing questions.
   - If SHEVA_TRACK_ITEM_ID is present, do not use Pi's interactive question/questionnaire tools. Instead, create Track decision comment(s) with \`track-cli comments request-decision "$SHEVA_TRACK_ITEM_ID" --body-md <context> --assignee-user-id "$SHEVA_DECISION_ASSIGNEE_USER_ID" [--option <choice> ...] --compact\`.
   - For Track decisions, ask all foreseeable independent decisions up front; include minimal context, clear options, a recommendation when useful, and the impact of each option.
   - If SHEVA_DECISION_ASSIGNEE_USER_ID is missing for a Track task, add a normal task comment explaining TRACK_ORCH_DECISION_ASSIGNEE_USER_ID is missing and stop.
   - If SHEVA_TRACK_ITEM_ID is absent, use the interactive interface when needed, preferably one questionnaire with at most 3-5 questions.
   - If an answer is not necessary for the plan, record it as an implementation decision instead of asking.

4. **Rewrite the request**
   - Rewrite it directly when the supplied description is already concrete.
   - Only for genuinely ambiguous requests, use one direct subagent acting as a Senior Product Manager or Senior Architect; tell it not to delegate and to use at most 6 tool calls.
   - For debugging / fixing requests, replicate the issue, then investigate the cause, and then propose a way to fix the root cause of the problem. Clarify any assumptions about the fix.
   - Keep the rewrite faithful to the original scope. Do not overengineer.

5. **Token-lean code exploration**
   - Prefer direct graph/search inspection. Delegation is optional, not a mandatory preflight.
   - Use at most two direct, file-disjoint read-only subagents, and explicitly forbid further delegation.
   - Each reader must use at most 8 tool calls and return exact files, line ranges, existing patterns, smallest change points, and concrete risks.
   - Do not use web research or bulk page fetching unless an unresolved external API contract changes the implementation.
   - Avoid loading large generic design/skill docs. For user-facing UI, include a design-quality checklist in the plan; load the frontend design skill only when implementation truly needs it.

6. **Write the plan file**
   - Number it under \`docs/implementation-plans\`.
   - Keep it concise enough for implementation agents to consume without rereading broad context.
   - Include:
     - clarified product/engineering description;
     - non-goals;
     - affected files/components;
     - implementation DAG with dependency chart and description;
     - comprehensive todo list grouped by dependency stage;
     - tests to add during implementation, but do not make tests their own plan tasks;
     - rollout/backward-compatibility notes;
     - quality gates.

7. **Review and validate**
   - Use at most one reviewer subagent on the plan diff/file, explicitly forbidding further delegation.
   - Fix blockers once.
   - Use the Sheva nested command policy above for unresolved product/architecture decisions, not for already-decided mechanical details.

## Plan requirements

<plan_requirements>
- must have a comprehensive todo list for implementing this plan;
- do not overengineer; avoid unnecessary code and prefer minimal code changes;
- use readable and performant code;
- do not include tests as standalone implementation tasks, but indicate tests to implement during the implementation phase;
- must not break existing functionality;
- use frontend design guidance when adding or updating user-facing interfaces;
- organize implementation as a DAG-based flow grouped by dependencies.
</plan_requirements>

<plan_description>
${description}
</plan_description>`;
}

export function runImplementationPrompt(planLocation: string): string {
	return `/skill:ponytail full

Implement the plan token-efficiently, with high quality and atomic commits.

Plan location: ${planLocation || "not provided; infer from the current conversation or ask only if necessary"}

Important Sheva orchestration rule:
- Implement, verify, review, and commit the plan only.
- Do NOT create a Pull Request.
- Do NOT request Copilot review.
- Do NOT address PR comments.
- Sheva will run those nested command steps after this implementation turn settles.

## Workflow

1. **Preflight once**
   - Check \`git status --short\` and current branch.
   - Read the plan file once, then work from a compact task ledger.
   - Inspect project scripts once (\`package.json\`, \`Gemfile\`, or repo docs) and reuse the exact commands. Do not guess commands like \`npm run lint\` or workspace flags.
   - If using subagents, run one tiny cheap reader preflight first. If it fails, do not retry delegation.

2. **Create a compact execution ledger**
   Keep this in the conversation and update after each stage:
   \`\`\`md
   Current state:
   - Stage:
   - Files changed:
   - Commits:
   - Tests passing:
   - Reviewer findings:
   - Next step:
   \`\`\`

3. **Read narrowly**
   - Prefer codebase-memory, \`rg\`, \`find\`, and \`git diff\` before \`read\`.
   - Read only exact line ranges needed for the current stage.
   - Do not read large generic docs or full skill files unless they directly govern the edit.

4. **Delegate bounded, file-disjoint work**
   - Delegation is optional. Do not run a mandatory preflight agent when the plan already identifies exact files and commands.
   - Use at most two direct, file-disjoint subagents for scoped implementation, search summaries, boilerplate, or focused test fixes.
   - Every delegated prompt must say: "Do not delegate or call another agent; use at most 8 tool calls."
   - Keep architecture, data modelling, security-sensitive choices, and final judgement in the primary agent.
   - Each subagent task must include: owned files, forbidden files, focused tests to run, "do not commit", and this return contract:
     \`\`\`md
     Changed files:
     Tests run:
     Risks:
     Follow-up needed:
     \`\`\`

5. **Implement in DAG order**
   - Follow dependency order from the plan.
   - Prefer stages: backend/data -> preferences/config -> frontend plumbing -> UI -> review hardening.
   - Make minimal, readable changes. Business logic changes must include focused tests in the same stage.
   - Parallelize only when two tasks are genuinely file-disjoint; parallelism reduces latency, not token usage.

6. **Verify quietly**
   - Run focused tests first.
   - Use \`pi-quiet-run\` for noisy commands, for example:
     \`\`\`bash
     pi-quiet-run --tail 120 -- npm run test:only -- path/to/test.ts
     pi-quiet-run --tail 160 -- npm test
     \`\`\`
   - If a quiet run fails, rerun only the failed focused command with enough output to diagnose.
   - Run full gates once near the end unless risk requires earlier.

7. **Review by diff**
   - Use at most one reviewer subagent, and only after implementation and focused tests pass.
   - Ask it to review \`git diff\` / recent commits, not whole files.
   - Limit reviewer scope to correctness, security/tenancy, performance, persistence races, and test coverage.
   - Fix blockers before final commit.

8. **Commit atomically**
   - Commit each coherent stage separately.
   - Do not mix plan/docs, backend, preferences, frontend, and hardening unless the diff is truly inseparable.

## Response for this implementation phase only

Report only:
- commits created;
- tests/gates run and result;
- notable risks or follow-up, if any;
- changed files summary;
- confirm that PR/Copilot/comment follow-up was left for Sheva.`;
}

export function createPrPrompt(): string {
	return `Create a GitHub Pull Request now. This is Sheva's inlined /create-pr nested step.

1. Analyse and summarise changes made on the current branch for a GitHub Pull Request.
2. Do not check with the user if the summary is correct.
3. If the current branch already has a PR, use the existing PR instead of creating a duplicate.
4. Otherwise create a GitHub Pull Request using the \`gh\` command.
5. Report the PR number and URL.`;
}

export function requestCopilotPrompt(prNumber: string): string {
	return `Request code review from GitHub Copilot now. This is Sheva's inlined /request-copilot-review nested step.

Use this exact command:
\`gh pr edit ${prNumber} --add-reviewer @copilot\`

Do not request review from \`@me\`.`;
}

export function addressPrCommentsPrompt(prNumber: string): string {
	return `Address unresolved GitHub PR review comments for PR #${prNumber}.

Use the \`address-pr-comments\` skill.

Workflow constraints:
- Fetch all unresolved, non-outdated review threads once.
- Group by logical concern and file-disjointness.
- If there is one group, fix it yourself; do not spin up an agent.
- If there are multiple file-disjoint groups and subagent preflight passed, dispatch at most two fix agents in one parallel subagent call.
- Each fix agent gets owned files, forbidden files, exact comments, focused tests, \`do not commit\` unless the skill explicitly handles commits, and: "Do not delegate or call another agent; use at most 8 tool calls."
- Each group must commit separately and resolve only the threads it fixed.
- If subagent preflight fails, fix groups sequentially yourself instead of retrying failed agents.
- Run focused tests after each group when practical, then final tests/linters appropriate to the repo.
- Use \`pi-quiet-run --tail 160 -- <command>\` for noisy test suites.
- Use wait interval 1 minute when polling for Copilot review comments.

Report groups, commits, resolved threads, skipped threads, and verification.`;
}

export function mergeRepairPrompt(report: MergeCheckReport): string {
	return `Sheva merge preflight failed for PR #${report.pr.number}.

The check script is \`${SHEVA_PR_CHECKS_SCRIPT}\` and produced this report:

\`\`\`json
${mergeCheckSummary(report)}
\`\`\`

Fix the blockers that can be fixed from this branch, then push the fixes. Do not merge the PR.

Rules:
- If CI is failing, inspect the failing check logs with \`gh run view\` / \`gh run download\` as needed, reproduce locally, fix, commit, push.
- If there are merge conflicts or stale base issues, update the branch from the base branch safely, resolve conflicts, run the relevant tests, commit, push.
- If the PR is draft/closed or blocked by something that cannot be fixed from code, stop and report clearly.
- Use \`pi-quiet-run --tail 160 -- <command>\` for noisy test suites.

Report the commits pushed and the verification you ran.`;
}
