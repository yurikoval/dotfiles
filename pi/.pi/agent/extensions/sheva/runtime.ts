import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

export const ONE_MINUTE_MS = 60_000;
export const COPILOT_MAX_WAIT_MS = 10 * ONE_MINUTE_MS;
const DECISION_WAIT_MARKER = "SHEVA_WAITING_FOR_DECISIONS";
const DECISION_ID_RE = /^(?:cm|cmt)_[A-Za-z0-9]+$/;
export const SHEVA_PR_CHECKS_SCRIPT = join(homedir(), ".pi", "agent", "bin", "sheva-pr-checks");

export type ShevaReasoningLevel = "fast" | "standard" | "high";
export type ShevaRiskClass = "routine" | "ordinary" | "high";
export type ShevaStep =
	| "plan"
	| "decision"
	| "implementation"
	| "review"
	| "verification"
	| "pr"
	| "comments"
	| "merge-repair";

export type ShevaReasoningPolicy = {
	level: ShevaReasoningLevel;
	risk: ShevaRiskClass;
	reason: string;
	escalated: boolean;
};

export type ShevaStepMetric = {
	label: string;
	level: ShevaReasoningLevel;
	risk: ShevaRiskClass;
	escalated: boolean;
	reason: string;
	elapsedMs: number;
	success: boolean;
	routingApplied: boolean;
	model?: string;
};

const RISK_LEVELS: Record<ShevaRiskClass, ShevaReasoningLevel> = {
	routine: "fast",
	ordinary: "standard",
	high: "high",
};
const STEP_RISKS: Record<ShevaStep, ShevaRiskClass> = {
	plan: "ordinary",
	decision: "high",
	implementation: "ordinary",
	review: "ordinary",
	verification: "routine",
	pr: "routine",
	comments: "ordinary",
	"merge-repair": "ordinary",
};
const HIGH_RISK_HINT =
	/\b(auth(?:entication|orization)?|tenants?|tenancy|secrets?|billing|credits?|money|payments?|subscriptions?|webhooks?|schemas?|migrations?|destructive|concurren(?:cy|t)|idempoten(?:cy|t)|races?|queues?|leases?|retr(?:y|ies)|production|deploy(?:ment)?s?|data loss|merge conflicts?|unexplained (?:failure|ci))\b/i;
const THINKING_LEVELS: Record<ShevaReasoningLevel, "low" | "medium" | "high"> = {
	fast: "low",
	standard: "medium",
	high: "high",
};
const stepMetrics = new WeakMap<object, ShevaStepMetric[]>();

export function reasoningPolicyForRisk(
	risk: ShevaRiskClass | string | undefined,
	reason: string,
	details = "",
): ShevaReasoningPolicy {
	if (risk !== "routine" && risk !== "ordinary" && risk !== "high") {
		return { level: "high", risk: "high", reason: `${reason}; unknown risk defaults high`, escalated: true };
	}

	const match = details.match(HIGH_RISK_HINT)?.[0];
	if (risk !== "high" && match) {
		return { level: "high", risk: "high", reason: `${reason}; high-risk signal: ${match}`, escalated: true };
	}
	return { level: RISK_LEVELS[risk], risk, reason, escalated: false };
}

export function reasoningPolicyForStep(step: ShevaStep, details = ""): ShevaReasoningPolicy {
	const policy = reasoningPolicyForRisk(STEP_RISKS[step], `${step} default`, details);
	return process.env.SHEVA_REASONING_LEVEL === "high"
		? escalateReasoningPolicy(policy, "SHEVA_REASONING_LEVEL=high")
		: policy;
}

export function escalateReasoningPolicy(
	policy: ShevaReasoningPolicy,
	reason: string,
): ShevaReasoningPolicy {
	if (policy.level === "high") return policy;
	return { level: "high", risk: "high", reason, escalated: true };
}

export function formatReasoningBudget(policy: ShevaReasoningPolicy): string {
	return `## Reasoning budget

Current stage risk: ${policy.risk}; preferred reasoning: ${policy.level}.
Use fast reasoning for mechanical inspection, edits, tests, and Git operations. Reserve deep reasoning for decisions in the current risk class. Escalate to high reasoning before changing authentication, authorization, tenancy, secrets, money, billing, schema/migrations, destructive behavior, concurrency/idempotency, production configuration, or an unclear failure. Do not downgrade within a stage after escalation. Record the reasoning level, escalation reason (${policy.escalated ? policy.reason : "none"}), and stage boundary in the execution ledger.`;
}

function reasoningRoutingEnabled(): boolean {
	return process.env.SHEVA_REASONING_ROUTING === "1" || process.env.SHEVA_REASONING_LEVEL === "high";
}

function getThinkingLevel(pi: ExtensionAPI): ReturnType<ExtensionAPI["getThinkingLevel"]> | undefined {
	try {
		return typeof pi.getThinkingLevel === "function" ? pi.getThinkingLevel() : undefined;
	} catch {
		return undefined;
	}
}

function applyReasoningPolicy(pi: ExtensionAPI, policy: ShevaReasoningPolicy): boolean {
	if (!reasoningRoutingEnabled() || typeof pi.setThinkingLevel !== "function") return false;
	try {
		pi.setThinkingLevel(THINKING_LEVELS[policy.level]);
		return true;
	} catch {
		return false;
	}
}

function restoreThinkingLevel(
	pi: ExtensionAPI,
	level: ReturnType<ExtensionAPI["getThinkingLevel"]> | undefined,
): void {
	if (level === undefined || typeof pi.setThinkingLevel !== "function") return;
	try {
		pi.setThinkingLevel(level);
	} catch {
		// Routing is optional; preserve the completed step when restoration is unsupported.
	}
}

function formatStepMetric(metric: ShevaStepMetric): string {
	return `${metric.label}: ${metric.level}/${metric.risk}, ${metric.elapsedMs}ms, ${metric.success ? "ok" : "failed"}${metric.escalated ? `, escalated (${metric.reason})` : ""}${metric.model ? `, ${metric.model}` : ""}`;
}

export function reportShevaMetricsSummary(ctx: ExtensionCommandContext): void {
	const metrics = stepMetrics.get(ctx) ?? [];
	stepMetrics.delete(ctx);
	if (process.env.SHEVA_DEBUG_METRICS !== "1" || metrics.length === 0) return;
	const elapsedMs = metrics.reduce((total, metric) => total + metric.elapsedMs, 0);
	const failures = metrics.filter((metric) => !metric.success).length;
	const escalations = metrics.filter((metric) => metric.escalated).length;
	ctx.ui.notify(
		`Sheva metrics: ${metrics.length} step(s), ${elapsedMs}ms, ${escalations} escalation(s), ${failures} failure(s)`,
		failures > 0 ? "warning" : "info",
	);
}

export type ShevaDependency = {
	name: string;
	check: (pi: ExtensionAPI) => Promise<string | undefined>;
};

export const SHEVA_PROMPT_SKILLS = [
	"ponytail",
	"address-pr-comments",
	"grill-me-once",
	"frontend-design",
] as const;
export const SHEVA_PROMPT_TOOLS = [
	"bash",
	"read",
	"edit",
	"write",
	"index_repository",
	"index_status",
	"search_graph",
	"subagent",
	"questionnaire",
] as const;
export const SHEVA_PROMPT_COMMANDS = ["find", "ls", "rg", "pi-quiet-run"] as const;

async function executableOnPath(command: string): Promise<boolean> {
	for (const directory of (process.env.PATH ?? "").split(delimiter)) {
		try {
			await access(join(directory, command), constants.X_OK);
			return true;
		} catch {
			// Keep looking through PATH.
		}
	}
	return false;
}

async function missingExecutables(commands: readonly string[]): Promise<string[]> {
	const checks = await Promise.all(commands.map(async (command) => [command, await executableOnPath(command)] as const));
	return checks.filter(([, found]) => !found).map(([command]) => command);
}

async function execRequirement(
	pi: ExtensionAPI,
	command: string,
	args: string[],
	failureMessage: string,
): Promise<string | undefined> {
	try {
		const result = await pi.exec(command, args, { timeout: 15_000 });
		if (result.code === 0) return undefined;
		const detail = result.stderr.trim() || result.stdout.trim();
		return `${failureMessage}${detail ? ` (${detail})` : ""}`;
	} catch (error) {
		return `${failureMessage} (${error instanceof Error ? error.message : String(error)})`;
	}
}

export const SHEVA_PROMPT_DEPENDENCIES: readonly ShevaDependency[] = [
	{
		name: "Prompt skills",
		check: async (pi) => {
			const loaded = new Set(
				pi.getCommands()
					.filter((command) => command.source === "skill")
					.map((command) => command.name.replace(/^skill:/, "")),
			);
			const missing = SHEVA_PROMPT_SKILLS.filter((skill) => !loaded.has(skill));
			return missing.length > 0 ? `load required skills: ${missing.join(", ")}` : undefined;
		},
	},
	{
		name: "Prompt extensions/tools",
		check: async (pi) => {
			const configured = new Set(pi.getAllTools().map((tool) => tool.name));
			const active = new Set(pi.getActiveTools());
			const missing = SHEVA_PROMPT_TOOLS.filter((tool) => !configured.has(tool));
			const inactive = SHEVA_PROMPT_TOOLS.filter((tool) => configured.has(tool) && !active.has(tool));
			const failures = [
				missing.length > 0 ? `install/load extensions providing: ${missing.join(", ")}` : "",
				inactive.length > 0 ? `enable tools: ${inactive.join(", ")}` : "",
			].filter(Boolean);
			return failures.length > 0 ? failures.join("; ") : undefined;
		},
	},
	{
		name: "Prompt commands",
		check: async () => {
			const missing = await missingExecutables(SHEVA_PROMPT_COMMANDS);
			return missing.length > 0 ? `install commands on PATH: ${missing.join(", ")}` : undefined;
		},
	},
	{
		name: "Track CLI",
		check: async () => {
			if (!process.env.SHEVA_TRACK_ITEM_ID || (await executableOnPath("track-cli"))) return undefined;
			return "install track-cli on PATH when SHEVA_TRACK_ITEM_ID is set";
		},
	},
];

export const SHEVA_DEPENDENCIES: readonly ShevaDependency[] = [
	{
		name: "Git",
		check: async (pi) =>
			(await execRequirement(pi, "git", ["--version"], "install Git and make it available on PATH")) ??
			(await execRequirement(pi, "git", ["rev-parse", "--is-inside-work-tree"], "run Sheva inside a Git repository")) ??
			(await execRequirement(pi, "git", ["var", "GIT_AUTHOR_IDENT"], "configure Git user.name and user.email")),
	},
	{
		name: "GitHub CLI",
		check: async (pi) =>
			(await execRequirement(pi, "gh", ["--version"], "install gh and make it available on PATH")) ??
			(await execRequirement(pi, "gh", ["auth", "status"], "authenticate gh with `gh auth login`")) ??
			(await execRequirement(
				pi,
				"gh",
				["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"],
				"configure a GitHub remote that gh can resolve",
			)),
	},
	{
		name: "jq",
		check: (pi) => execRequirement(pi, "jq", ["--version"], "install jq and make it available on PATH"),
	},
	{
		name: "merge-check script",
		check: async () => {
			try {
				await access(SHEVA_PR_CHECKS_SCRIPT, constants.X_OK);
				return undefined;
			} catch {
				return `install an executable sheva-pr-checks at ${SHEVA_PR_CHECKS_SCRIPT}`;
			}
		},
	},
	...SHEVA_PROMPT_DEPENDENCIES,
];

export async function checkShevaDependencies(
	pi: ExtensionAPI,
	dependencies: readonly ShevaDependency[] = SHEVA_DEPENDENCIES,
): Promise<string[]> {
	const results = await Promise.all(
		dependencies.map(async (dependency) => {
			try {
				const failure = await dependency.check(pi);
				return failure ? `${dependency.name}: ${failure}` : undefined;
			} catch (error) {
				return `${dependency.name}: ${error instanceof Error ? error.message : String(error)}`;
			}
		}),
	);
	return results.filter((result): result is string => Boolean(result));
}

export async function preflightSheva(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	dependencies: readonly ShevaDependency[] = SHEVA_DEPENDENCIES,
): Promise<boolean> {
	const failures = await checkShevaDependencies(pi, dependencies);
	if (failures.length === 0) return true;
	ctx.ui.notify(`Sheva pre-check failed:\n- ${failures.join("\n- ")}`, "error");
	return false;
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function notify(ctx: ExtensionCommandContext, message: string, level: "info" | "warning" | "error" = "info"): void {
	ctx.ui.notify(message, level);
	ctx.ui.setStatus("sheva", message);
}

function extractText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";

	return content
		.map((part) => {
			if (part && typeof part === "object" && "text" in part) {
				const text = (part as { text?: unknown }).text;
				return typeof text === "string" ? text : "";
			}
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

export function lastAssistantText(ctx: ExtensionCommandContext): string {
	const branch = ctx.sessionManager.getBranch();
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i] as any;
		if (entry?.type === "message" && entry.message?.role === "assistant") {
			return extractText(entry.message.content);
		}
	}
	return "";
}

export function shevaNextCommand(text: string): string | undefined {
	const match = text.match(/^SHEVA_NEXT_COMMAND:\s*(.+)$/im);
	if (!match) return undefined;
	const value = match[1]?.trim();
	if (!value || value.toLowerCase() === "none") return undefined;
	return value.startsWith("/") ? value : undefined;
}

function shevaDecisionRequestIds(text: string): string[] {
	const match = text.match(new RegExp(`^\\s*${DECISION_WAIT_MARKER}:\\s*(.+)$`, "im"));
	if (!match) return [];
	const ids: string[] = [];
	for (const token of match[1].split(/[\s,]+/).map((entry) => entry.trim()).filter(Boolean)) {
		if (DECISION_ID_RE.test(token) && !ids.includes(token)) ids.push(token);
	}
	return ids;
}

export function stopForShevaDecisionWait(ctx: ExtensionCommandContext): boolean {
	const ids = shevaDecisionRequestIds(lastAssistantText(ctx));
	if (ids.length === 0) return false;
	notify(ctx, `Sheva: waiting for Track decision(s): ${ids.join(", ")}`, "warning");
	return true;
}

export function extractPlanLocation(text: string): string {
	const matches = [...text.matchAll(/docs\/implementation-plans\/[A-Za-z0-9._/-]+\.md/g)];
	const last = matches.at(-1)?.[0] ?? "";
	return last.replace(/[.,;:)}\]]+$/, "");
}

export async function runAgentStep(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	label: string,
	prompt: string,
	options?: {
		expandPromptTemplates?: boolean;
		policy?: ShevaReasoningPolicy;
		now?: () => number;
		settle?: () => Promise<void>;
		debugMetrics?: boolean;
	},
): Promise<ShevaStepMetric> {
	const policy = options?.policy ?? reasoningPolicyForRisk(undefined, `${label} was not classified`);
	const now = options?.now ?? Date.now;
	const started = now();
	const previousThinkingLevel = reasoningRoutingEnabled() ? getThinkingLevel(pi) : undefined;
	const routingApplied = applyReasoningPolicy(pi, policy);
	let success = false;

	try {
		notify(ctx, label);
		pi.sendUserMessage(prompt, { expandPromptTemplates: options?.expandPromptTemplates ?? false });
		// sendUserMessage is fire-and-forget from ExtensionAPI; give the prompt loop a tick
		// to mark the agent busy before waitForIdle checks idle state.
		await (options?.settle?.() ?? sleep(500));
		await ctx.waitForIdle();
		success = true;
	} finally {
		if (routingApplied) restoreThinkingLevel(pi, previousThinkingLevel);
		const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
		const metric: ShevaStepMetric = {
			label,
			level: policy.level,
			risk: policy.risk,
			escalated: policy.escalated,
			reason: policy.reason,
			elapsedMs: Math.max(0, now() - started),
			success,
			routingApplied,
			model,
		};
		const metrics = stepMetrics.get(ctx) ?? [];
		metrics.push(metric);
		stepMetrics.set(ctx, metrics);
		if (options?.debugMetrics ?? process.env.SHEVA_DEBUG_METRICS === "1") {
			ctx.ui.notify(`Sheva metric: ${formatStepMetric(metric)}`, success ? "info" : "warning");
		}
	}

	return stepMetrics.get(ctx)!.at(-1)!;
}
