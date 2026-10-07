import { describe, expect, test } from "bun:test";
import { runImplementationPrompt } from "./prompts";

const prompt = runImplementationPrompt("docs/implementation-plans/example.md");

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
