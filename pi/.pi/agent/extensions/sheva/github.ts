import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	COPILOT_MAX_WAIT_MS,
	ONE_MINUTE_MS,
	SHEVA_PR_CHECKS_SCRIPT,
	notify,
	reasoningPolicyForStep,
	runAgentStep,
	sleep,
	type ShevaReasoningPolicy,
} from "./runtime";
export type RepoInfo = {
	owner: string;
	repo: string;
};

export type CopilotSnapshot = {
	hasCopilotReview: boolean;
	unresolvedThreads: number;
	outdatedThreads: number;
};

export type MergeCheckReport = {
	ok: boolean;
	pr: {
		number: number;
		url: string;
		state: string;
		isDraft: boolean;
		mergeStateStatus: string;
		headRefName: string;
		baseRefName: string;
	};
	ci: {
		pass: boolean;
		total: number;
		pending: unknown[];
		failing: unknown[];
		checks: unknown[];
	};
	comments: {
		pass: boolean;
		unresolved: unknown[];
	};
	merge: {
		pass: boolean;
		noConflicts: boolean;
		stateStatus: string;
		reasons: string[];
	};
	scriptExitCode?: number;
	scriptStderr?: string;
};

export type MergeMethodPolicy = {
	mergeCommitAllowed?: boolean;
	squashMergeAllowed?: boolean;
	rebaseMergeAllowed?: boolean;
};

export type MergeStrategy = {
	flag: "--squash" | "--merge" | "--rebase";
	label: string;
	isAllowed: (policy: MergeMethodPolicy) => boolean | undefined;
};


const MERGE_STRATEGIES: MergeStrategy[] = [
	{
		flag: "--merge",
		label: "merge commit",
		isAllowed: (policy) => policy.mergeCommitAllowed,
	},
	{
		flag: "--squash",
		label: "squash merge",
		isAllowed: (policy) => policy.squashMergeAllowed,
	},
	{
		flag: "--rebase",
		label: "rebase merge",
		isAllowed: (policy) => policy.rebaseMergeAllowed,
	},
];

async function execText(
	pi: ExtensionAPI,
	command: string,
	args: string[],
	timeout = 60_000,
): Promise<string> {
	const result = await pi.exec(command, args, { timeout });
	if (result.code !== 0) {
		const detail = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join("\n");
		throw new Error(`${command} ${args.join(" ")} failed with code ${result.code}${detail ? `:\n${detail}` : ""}`);
	}
	return result.stdout.trim();
}

async function execJson<T>(pi: ExtensionAPI, command: string, args: string[], timeout = 60_000): Promise<T> {
	const stdout = await execText(pi, command, args, timeout);
	return JSON.parse(stdout) as T;
}

export async function currentPrNumber(pi: ExtensionAPI): Promise<string> {
	return execText(pi, "gh", ["pr", "view", "--json", "number", "--jq", ".number"]);
}

async function repoInfo(pi: ExtensionAPI): Promise<RepoInfo> {
	const data = await execJson<{ owner?: { login?: string }; name?: string }>(pi, "gh", [
		"repo",
		"view",
		"--json",
		"owner,name",
	]);
	const owner = data.owner?.login;
	const repo = data.name;
	if (!owner || !repo) throw new Error("Could not determine GitHub owner/repo with gh repo view.");
	return { owner, repo };
}

function isCopilotLogin(login: unknown): boolean {
	return typeof login === "string" && login.toLowerCase().includes("copilot");
}

function isAfter(timestamp: unknown, sinceMs?: number): boolean {
	if (!sinceMs) return true;
	if (typeof timestamp !== "string") return false;
	const parsed = Date.parse(timestamp);
	return Number.isFinite(parsed) && parsed >= sinceMs;
}

async function copilotSnapshot(
	pi: ExtensionAPI,
	repo: RepoInfo,
	prNumber: string,
	sinceMs?: number,
): Promise<CopilotSnapshot> {
	const query = `
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviews(first: 100) {
        nodes { author { login } state body submittedAt }
      }
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          isOutdated
          path
          comments(first: 50) { nodes { author { login } body createdAt } }
        }
      }
    }
  }
}`;

	const data = await execJson<any>(pi, "gh", [
		"api",
		"graphql",
		"-f",
		`query=${query}`,
		"-f",
		`owner=${repo.owner}`,
		"-f",
		`repo=${repo.repo}`,
		"-F",
		`pr=${prNumber}`,
	]);
	const pullRequest = data?.data?.repository?.pullRequest;
	const reviews = pullRequest?.reviews?.nodes ?? [];
	const threads = pullRequest?.reviewThreads?.nodes ?? [];
	const hasCopilotReview =
		reviews.some(
			(review: any) => isCopilotLogin(review?.author?.login) && isAfter(review?.submittedAt, sinceMs),
		) ||
		threads.some((thread: any) =>
			(thread?.comments?.nodes ?? []).some(
				(comment: any) => isCopilotLogin(comment?.author?.login) && isAfter(comment?.createdAt, sinceMs),
			),
		);

	return {
		hasCopilotReview,
		unresolvedThreads: threads.filter((thread: any) => !thread?.isResolved && !thread?.isOutdated).length,
		outdatedThreads: threads.filter((thread: any) => thread?.isOutdated).length,
	};
}

export async function requestCopilotReview(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	prNumber: string,
	fallbackPrompt: string,
	fallbackPolicy: ShevaReasoningPolicy = reasoningPolicyForStep("pr"),
): Promise<number> {
	notify(ctx, `Sheva: requesting Copilot review for PR #${prNumber}`);
	const requestedAt = Date.now() - 10_000;
	const result = await pi.exec("gh", ["pr", "edit", prNumber, "--add-reviewer", "@copilot"], {
		timeout: 60_000,
	});
	if (result.code !== 0) {
		ctx.ui.notify(
			`Sheva: direct Copilot request failed; falling back to agent prompt (${result.stderr.trim() || result.stdout.trim()})`,
			"warning",
		);
		await runAgentStep(pi, ctx, "Sheva: fallback /request-copilot-review step", fallbackPrompt, {
			policy: fallbackPolicy,
		});
	}
	return requestedAt;
}

export async function waitForCopilotReview(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	prNumber: string,
	sinceMs?: number,
	maxWaitMs = COPILOT_MAX_WAIT_MS,
): Promise<CopilotSnapshot | undefined> {
	const repo = await repoInfo(pi);
	const started = Date.now();
	let attempt = 0;
	let lastSnapshot: CopilotSnapshot | undefined;

	while (Date.now() - started <= maxWaitMs) {
		attempt += 1;
		lastSnapshot = await copilotSnapshot(pi, repo, prNumber, sinceMs);
		if (lastSnapshot.hasCopilotReview) {
			notify(
				ctx,
				`Sheva: Copilot review detected (${lastSnapshot.unresolvedThreads} unresolved thread(s))`,
			);
			return lastSnapshot;
		}
		notify(ctx, `Sheva: waiting for Copilot review, poll ${attempt}`);
		await sleep(ONE_MINUTE_MS);
	}

	ctx.ui.notify("Sheva: Copilot review did not appear within 10 minutes; running address step anyway.", "warning");
	return lastSnapshot;
}

export async function runMergeChecks(pi: ExtensionAPI, prArg: string): Promise<MergeCheckReport> {
	const result = await pi.exec(SHEVA_PR_CHECKS_SCRIPT, prArg ? [prArg] : [], { timeout: 120_000 });
	const stdout = result.stdout.trim();
	if (!stdout) {
		throw new Error(
			`sheva-pr-checks produced no JSON output (exit ${result.code}): ${result.stderr.trim()}`,
		);
	}

	let report: MergeCheckReport;
	try {
		report = JSON.parse(stdout) as MergeCheckReport;
	} catch (error) {
		throw new Error(
			`Could not parse sheva-pr-checks output: ${error instanceof Error ? error.message : String(error)}\n${stdout}`,
		);
	}

	return { ...report, scriptExitCode: result.code, scriptStderr: result.stderr.trim() };
}

export function mergeCheckSummary(report: MergeCheckReport): string {
	return JSON.stringify(
		{
			ok: report.ok,
			pr: report.pr,
			ci: {
				pass: report.ci.pass,
				total: report.ci.total,
				pending: report.ci.pending,
				failing: report.ci.failing,
			},
			comments: {
				pass: report.comments.pass,
				unresolved: report.comments.unresolved,
			},
			merge: report.merge,
			scriptExitCode: report.scriptExitCode,
			scriptStderr: report.scriptStderr,
		},
		null,
		2,
	);
}

export function hasOnlyPendingCi(report: MergeCheckReport): boolean {
	return (
		report.comments.pass &&
		report.merge.pass &&
		report.ci.failing.length === 0 &&
		report.ci.pending.length > 0
	);
}

async function allowedMergeStrategies(pi: ExtensionAPI): Promise<MergeStrategy[]> {
	try {
		const policy = await execJson<MergeMethodPolicy>(pi, "gh", [
			"repo",
			"view",
			"--json",
			"mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed",
		]);
		const allowed = MERGE_STRATEGIES.filter((strategy) => strategy.isAllowed(policy));
		return allowed.length > 0 ? allowed : MERGE_STRATEGIES;
	} catch {
		return MERGE_STRATEGIES;
	}
}

function mergeFailureMessage(strategy: MergeStrategy, mode: "direct" | "auto", stdout: string, stderr: string): string {
	const output = stderr.trim() || stdout.trim() || "no output";
	return `${strategy.label} ${mode} attempt (${strategy.flag}) failed:\n${output}`;
}

export async function mergePr(pi: ExtensionAPI, prNumber: string): Promise<string> {
	const strategies = await allowedMergeStrategies(pi);
	const failures: string[] = [];

	for (const strategy of strategies) {
		const result = await pi.exec("gh", ["pr", "merge", prNumber, strategy.flag, "--delete-branch"], {
			timeout: 120_000,
		});
		if (result.code === 0) return [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
		failures.push(mergeFailureMessage(strategy, "direct", result.stdout, result.stderr));

		const fallback = await pi.exec("gh", ["pr", "merge", prNumber, "--auto", strategy.flag, "--delete-branch"], {
			timeout: 120_000,
		});
		if (fallback.code === 0) return [fallback.stdout.trim(), fallback.stderr.trim()].filter(Boolean).join("\n");
		failures.push(mergeFailureMessage(strategy, "auto", fallback.stdout, fallback.stderr));
	}

	throw new Error(
		`gh pr merge failed for available merge strategies (${strategies.map((strategy) => strategy.label).join(", ")}):\n\n${failures.join("\n\n")}`,
	);
}
