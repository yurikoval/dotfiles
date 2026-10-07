import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	currentPrNumber,
	hasOnlyPendingCi,
	mergeCheckSummary,
	mergePr,
	requestCopilotReview,
	runMergeChecks,
	type MergeCheckReport,
	waitForCopilotReview,
} from "./github";
import {
	addressPrCommentsPrompt,
	createPrPrompt,
	mergeRepairPrompt,
	planPrompt,
	requestCopilotPrompt,
	runImplementationPrompt,
} from "./prompts";
import {
	ONE_MINUTE_MS,
	extractPlanLocation,
	lastAssistantText,
	notify,
	preflightSheva,
	reasoningPolicyForRisk,
	reasoningPolicyForStep,
	reportShevaMetricsSummary,
	runAgentStep,
	shevaNextCommand,
	sleep,
	stopForShevaDecisionWait,
	type ShevaReasoningPolicy,
	type ShevaStep,
} from "./runtime";

function parseBuildArgs(args: string): { planLocation: string; mergeAfter: boolean } {
	const trimmed = args.trim();
	if (trimmed !== "--merge" && !trimmed.startsWith("--merge ")) {
		return { planLocation: trimmed, mergeAfter: false };
	}
	return { planLocation: trimmed.slice("--merge".length).trim(), mergeAfter: true };
}

type PolicyPrompt = string | ((policy: ShevaReasoningPolicy) => string);

export async function implementationReasoningPolicy(
	cwd: string,
	planLocation: string,
): Promise<ShevaReasoningPolicy> {
	if (!planLocation) return reasoningPolicyForRisk(undefined, "implementation plan path missing");
	try {
		return reasoningPolicyForStep("implementation", await readFile(resolve(cwd, planLocation), "utf8"));
	} catch {
		return reasoningPolicyForRisk(undefined, "implementation plan could not be inspected");
	}
}

async function runShevaStep(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	label: string,
	step: ShevaStep,
	prompt: PolicyPrompt,
	options?: { details?: string; expandPromptTemplates?: boolean; policy?: ShevaReasoningPolicy },
): Promise<void> {
	const policy = options?.policy ?? reasoningPolicyForStep(step, options?.details);
	await runAgentStep(pi, ctx, label, typeof prompt === "string" ? prompt : prompt(policy), {
		expandPromptTemplates: options?.expandPromptTemplates,
		policy,
	});
}

async function runBuildPipeline(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	planLocation: string,
	mergeAfter: boolean,
): Promise<void> {
	const implementationPolicy = await implementationReasoningPolicy(ctx.cwd, planLocation);
	await runShevaStep(
		pi,
		ctx,
		"Sheva: implementing plan",
		"implementation",
		(policy) => runImplementationPrompt(planLocation, policy),
		{ expandPromptTemplates: true, policy: implementationPolicy },
	);
	if (stopForShevaDecisionWait(ctx)) return;
	await runShevaStep(pi, ctx, "Sheva: creating pull request", "pr", createPrPrompt);
	if (stopForShevaDecisionWait(ctx)) return;

	const prNumber = await currentPrNumber(pi);
	const copilotPolicy = reasoningPolicyForStep("pr");
	const requestedAt = await requestCopilotReview(
		pi,
		ctx,
		prNumber,
		requestCopilotPrompt(prNumber, copilotPolicy),
		copilotPolicy,
	);
	if (stopForShevaDecisionWait(ctx)) return;
	await waitForCopilotReview(pi, ctx, prNumber, requestedAt);

	await runShevaStep(
		pi,
		ctx,
		"Sheva: addressing PR comments",
		"comments",
		(policy) => addressPrCommentsPrompt(prNumber, policy),
	);
	if (stopForShevaDecisionWait(ctx) || !mergeAfter) return;

	let report: MergeCheckReport | undefined;
	for (let attempt = 1; attempt <= 10; attempt += 1) {
		notify(ctx, `Sheva: running merge checks (attempt ${attempt})`);
		report = await runMergeChecks(pi, prNumber);
		if (report.ok) break;

		if (!report.comments.pass) {
			await runShevaStep(
				pi,
				ctx,
				"Sheva: addressing unresolved PR comments before merge",
				"comments",
				(policy) => addressPrCommentsPrompt(prNumber, policy),
			);
			if (stopForShevaDecisionWait(ctx)) return;
			continue;
		}

		if (hasOnlyPendingCi(report)) {
			notify(ctx, "Sheva: CI is still pending; waiting 1 minute");
			await sleep(ONE_MINUTE_MS);
			continue;
		}

		const failedReport = report;
		await runShevaStep(
			pi,
			ctx,
			"Sheva: fixing merge preflight blockers",
			"merge-repair",
			(policy) => mergeRepairPrompt(failedReport, policy),
			{ details: mergeCheckSummary(failedReport) },
		);
		if (stopForShevaDecisionWait(ctx)) return;
	}

	if (!report) throw new Error("Merge checks did not run.");
	if (!report.ok) {
		throw new Error(`Merge checks still failing after remediation attempts:\n${mergeCheckSummary(report)}`);
	}

	notify(ctx, `Sheva: checks pass; merging PR #${prNumber}`);
	const mergeOutput = await mergePr(pi, prNumber);
	ctx.ui.notify(`Sheva: planned, built, and merged PR #${prNumber}${mergeOutput ? ` (${mergeOutput})` : ""}`, "info");
}

export default function sheva(pi: ExtensionAPI) {
	pi.registerCommand("sheva-plan", {
		description: "Create a DAG implementation plan, with conditional grill workflow executed as a real follow-up",
		handler: async (args, ctx) => {
			if (!args.trim()) {
				ctx.ui.notify("Usage: /sheva-plan <plan description>", "warning");
				return;
			}
			if (!(await preflightSheva(pi, ctx))) return;

			try {
				if (!ctx.isIdle()) await ctx.waitForIdle();
				await runShevaStep(
					pi,
					ctx,
					"Sheva: creating plan",
					"plan",
					(policy) => planPrompt(args.trim(), "initial", policy),
					{ details: args.trim() },
				);
				if (stopForShevaDecisionWait(ctx)) return;

				const nextCommand = shevaNextCommand(lastAssistantText(ctx));
				if (nextCommand) {
					await runShevaStep(
						pi,
						ctx,
						`Sheva: running nested ${nextCommand.split(/\s+/, 1)[0]}`,
						"decision",
						nextCommand,
						{ expandPromptTemplates: true },
					);
					if (stopForShevaDecisionWait(ctx)) return;
					await runShevaStep(
						pi,
						ctx,
						"Sheva: writing plan after grill workflow",
						"plan",
						(policy) => planPrompt(args.trim(), "after-grill", policy),
						{ details: args.trim() },
					);
					if (stopForShevaDecisionWait(ctx)) return;
				}
			} catch (error) {
				ctx.ui.notify(`Sheva plan failed: ${error instanceof Error ? error.message : String(error)}`, "error");
			} finally {
				reportShevaMetricsSummary(ctx);
				ctx.ui.setStatus("sheva", undefined);
			}
		},
	});

	pi.registerCommand("sheva-build", {
		description: "Implement a plan, then actually run PR, Copilot review, and address-comments follow-ups",
		handler: async (args, ctx) => {
			try {
				if (!(await preflightSheva(pi, ctx))) return;
				if (!ctx.isIdle()) await ctx.waitForIdle();
				const { planLocation, mergeAfter } = parseBuildArgs(args);
				await runBuildPipeline(pi, ctx, planLocation, mergeAfter);
			} catch (error) {
				ctx.ui.notify(`Sheva build failed: ${error instanceof Error ? error.message : String(error)}`, "error");
			} finally {
				reportShevaMetricsSummary(ctx);
				ctx.ui.setStatus("sheva", undefined);
			}
		},
	});

	pi.registerCommand("sheva-run", {
		description: "Create a plan from the request, then build and merge it in a fresh session",
		handler: async (args, ctx) => {
			if (!args.trim()) {
				ctx.ui.notify("Usage: /sheva-run <plan description>", "warning");
				return;
			}
			if (!(await preflightSheva(pi, ctx))) return;

			let sessionReplaced = false;
			try {
				if (!ctx.isIdle()) await ctx.waitForIdle();

				await runShevaStep(
					pi,
					ctx,
					"Sheva: creating plan",
					"plan",
					(policy) => planPrompt(args.trim(), "initial", policy),
					{ details: args.trim() },
				);
				if (stopForShevaDecisionWait(ctx)) return;
				let planLocation = extractPlanLocation(lastAssistantText(ctx));

				const nextCommand = shevaNextCommand(lastAssistantText(ctx));
				if (nextCommand) {
					await runShevaStep(
						pi,
						ctx,
						`Sheva: running nested ${nextCommand.split(/\s+/, 1)[0]}`,
						"decision",
						nextCommand,
						{ expandPromptTemplates: true },
					);
					if (stopForShevaDecisionWait(ctx)) return;
					await runShevaStep(
						pi,
						ctx,
						"Sheva: writing plan after grill workflow",
						"plan",
						(policy) => planPrompt(args.trim(), "after-grill", policy),
						{ details: args.trim() },
					);
					if (stopForShevaDecisionWait(ctx)) return;
					planLocation = extractPlanLocation(lastAssistantText(ctx));
				}

				if (!planLocation) {
					throw new Error("Sheva could not detect the plan path; refusing to carry the full planning context into implementation.");
				}

				reportShevaMetricsSummary(ctx);
				const parentSession = ctx.sessionManager.getSessionFile();
				const switched = await ctx.newSession({
					parentSession,
					withSession: async (newCtx) => {
						await newCtx.sendUserMessage(`/sheva-build --merge ${planLocation}`, {
							expandPromptTemplates: true,
						});
					},
				});
				if (switched.cancelled) throw new Error("Fresh implementation session was cancelled.");
				sessionReplaced = true;
				return;
			} catch (error) {
				ctx.ui.notify(`Sheva run failed: ${error instanceof Error ? error.message : String(error)}`, "error");
			} finally {
				if (!sessionReplaced) {
					reportShevaMetricsSummary(ctx);
					ctx.ui.setStatus("sheva", undefined);
				}
			}
		},
	});

	pi.registerCommand("sheva-merge", {
		description: "Validate PR CI, unresolved comments, and merge conflicts; fix blockers; then merge",
		handler: async (args, ctx) => {
			const prArg = args.trim();
			let report: MergeCheckReport | undefined;

			try {
				if (!(await preflightSheva(pi, ctx))) return;
				if (!ctx.isIdle()) await ctx.waitForIdle();

				for (let attempt = 1; attempt <= 10; attempt += 1) {
					notify(ctx, `Sheva: running merge checks (attempt ${attempt})`);
					report = await runMergeChecks(pi, prArg);

					if (report.ok) break;

					const prNumber = String(report.pr.number);
					if (!report.comments.pass) {
						await runShevaStep(
							pi,
							ctx,
							"Sheva: addressing unresolved PR comments before merge",
							"comments",
							(policy) => addressPrCommentsPrompt(prNumber, policy),
						);
						if (stopForShevaDecisionWait(ctx)) return;
						continue;
					}

					if (hasOnlyPendingCi(report)) {
						notify(ctx, "Sheva: CI is still pending; waiting 1 minute");
						await sleep(ONE_MINUTE_MS);
						continue;
					}

					const failedReport = report;
					await runShevaStep(
						pi,
						ctx,
						"Sheva: fixing merge preflight blockers",
						"merge-repair",
						(policy) => mergeRepairPrompt(failedReport, policy),
						{ details: mergeCheckSummary(failedReport) },
					);
					if (stopForShevaDecisionWait(ctx)) return;
				}

				if (!report) throw new Error("Merge checks did not run.");
				if (!report.ok) {
					throw new Error(`Merge checks still failing after remediation attempts:\n${mergeCheckSummary(report)}`);
				}

				const prNumber = String(report.pr.number);
				notify(ctx, `Sheva: checks pass; merging PR #${prNumber}`);
				const mergeOutput = await mergePr(pi, prNumber);
				ctx.ui.notify(`Sheva: merged PR #${prNumber}${mergeOutput ? ` (${mergeOutput})` : ""}`, "info");
			} catch (error) {
				ctx.ui.notify(`Sheva merge failed: ${error instanceof Error ? error.message : String(error)}`, "error");
			} finally {
				reportShevaMetricsSummary(ctx);
				ctx.ui.setStatus("sheva", undefined);
			}
		},
	});
}
