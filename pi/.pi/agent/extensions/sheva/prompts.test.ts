import { describe, expect, test } from "bun:test";
import type { MergeCheckReport } from "./github";
import {
	addressPrCommentsPrompt,
	createPrPrompt,
	mergeRepairPrompt,
	planPrompt,
	requestCopilotPrompt,
	runImplementationPrompt,
} from "./prompts";

const prompt = runImplementationPrompt("docs/implementation-plans/example.md");
const mergeReport = {
	ok: false,
	pr: {
		number: 42,
		url: "https://example.test/pr/42",
		state: "OPEN",
		isDraft: false,
		mergeStateStatus: "BLOCKED",
		headRefName: "feature",
		baseRefName: "main",
	},
	ci: { pass: false, total: 1, pending: [], failing: ["migration check"], checks: [] },
	comments: { pass: true, unresolved: [] },
	merge: { pass: false, noConflicts: true, stateStatus: "BLOCKED", reasons: ["database migration failure"] },
} satisfies MergeCheckReport;

const contract = {
	"keeps Sheva orchestration boundaries": [
		"Implement, verify, review, and commit the plan only.",
		"Do NOT create a Pull Request.",
		"Do NOT request Copilot review.",
		"Do NOT address PR comments.",
	],
	"tracks stages with a compact file matrix": [
		"| Stage | Inspect | Edit | Create | Test |",
		"Add one matrix row per stage",
	],
	"batches safe reads and edits": [
		"Inspect related files together with parallel tool calls when safe.",
		"Consolidate every currently known change to one file into one edit call",
		"edit independent files in the same assistant turn when safe.",
		"Avoid turns used only for routine progress commentary.",
	],
	"batches coherent verification": [
		"Finish a coherent dependency stage before focused verification.",
		"combining compatible focused tests into one command.",
	],
	"discovers commands without inventing them": [
		"reuse exact commands from the plan or discovered scripts",
		"Do not invent commands or workspace flags.",
	],
	"makes delegation optional and file-disjoint": [
		"Delegation is optional.",
		"When the plan already names exact files and commands, do not run a reader preflight.",
		"only for safe, file-disjoint implementation",
		"Keep architecture, data modelling, security-sensitive choices, and final judgement in the primary agent.",
	],
	"stops batching when safety requires it": [
		"requirements are ambiguous",
		"edits or tasks overlap",
		"a security-sensitive decision appears",
		"or any test fails",
		"These conditions take precedence over reducing turns.",
	],
	"preserves review and commit controls": [
		"Use at most one reviewer subagent, only after implementation and focused tests pass.",
		"Fix blockers before the final commit.",
		"Commit each coherent stage separately.",
	],
	"defers telemetry until a manual comparison": [
		"a future representative Sheva run as the next step for manually comparing turn count",
		"defer telemetry unless manual comparison is insufficient",
	],
} as const;

describe("reasoning budget prompts", () => {
	const generatedPrompts = [
		planPrompt("Document the extension"),
		prompt,
		createPrPrompt(),
		requestCopilotPrompt("42"),
		addressPrCommentsPrompt("42"),
		mergeRepairPrompt(mergeReport),
	];

	test("adds one shared policy with escalation and ledger requirements to every agent prompt", () => {
		for (const generated of generatedPrompts) {
			expect(generated.match(/## Reasoning budget/g)).toHaveLength(1);
			expect(generated).toContain("Escalate to high reasoning before changing authentication");
			expect(generated).toContain("Record the reasoning level, escalation reason");
			expect(generated).toContain("stage boundary in the execution ledger");
		}
	});

	test("selects fast for PR mechanics, standard for implementation, and high for risky repair", () => {
		expect(createPrPrompt()).toContain("Current stage risk: routine; preferred reasoning: fast.");
		expect(prompt).toContain("Current stage risk: ordinary; preferred reasoning: standard.");
		expect(mergeRepairPrompt(mergeReport)).toContain("Current stage risk: high; preferred reasoning: high.");
	});
});

describe("runImplementationPrompt", () => {
	for (const [name, clauses] of Object.entries(contract)) {
		test(name, () => {
			for (const clause of clauses) expect(prompt).toContain(clause);
		});
	}

	test("requires exactly one final repository gate near the end", () => {
		expect(prompt.match(/Run one final repository gate near the end/g)).toHaveLength(1);
	});
});
