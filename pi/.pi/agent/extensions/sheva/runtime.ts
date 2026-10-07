import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

export const ONE_MINUTE_MS = 60_000;
export const COPILOT_MAX_WAIT_MS = 10 * ONE_MINUTE_MS;
const DECISION_WAIT_MARKER = "SHEVA_WAITING_FOR_DECISIONS";
const DECISION_ID_RE = /^(?:cm|cmt)_[A-Za-z0-9]+$/;
export const SHEVA_PR_CHECKS_SCRIPT = join(homedir(), ".pi", "agent", "bin", "sheva-pr-checks");

export type ShevaDependency = {
	name: string;
	check: (pi: ExtensionAPI) => Promise<string | undefined>;
};

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
	options?: { expandPromptTemplates?: boolean },
): Promise<void> {
	notify(ctx, label);
	pi.sendUserMessage(prompt, { expandPromptTemplates: options?.expandPromptTemplates ?? false });
	// sendUserMessage is fire-and-forget from ExtensionAPI; give the prompt loop a tick
	// to mark the agent busy before waitForIdle checks idle state.
	await sleep(500);
	await ctx.waitForIdle();
}
