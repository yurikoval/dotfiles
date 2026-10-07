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
	runAgentStep,
	shevaNextCommand,
	sleep,
	stopForShevaDecisionWait,
} from "./runtime";

function parseBuildArgs(args: string): { planLocation: string; mergeAfter: boolean } {
	const trimmed = args.trim();
	if (trimmed !== "--merge" && !trimmed.startsWith("--merge ")) {
		return { planLocation: trimmed, mergeAfter: false };
	}
	return { planLocation: trimmed.slice("--merge".length).trim(), mergeAfter: true };
}

async function runBuildPipeline(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	planLocation: string,
	mergeAfter: boolean,
): Promise<void> {
	await runAgentStep(pi, ctx, "Sheva: implementing plan", runImplementationPrompt(planLocation), {
		expandPromptTemplates: true,
	});
	if (stopForShevaDecisionWait(ctx)) return;
	await runAgentStep(pi, ctx, "Sheva: creating pull request", createPrPrompt());
	if (stopForShevaDecisionWait(ctx)) return;

	const prNumber = await currentPrNumber(pi);
	const requestedAt = await requestCopilotReview(pi, ctx, prNumber, requestCopilotPrompt(prNumber));
	if (stopForShevaDecisionWait(ctx)) return;
	await waitForCopilotReview(pi, ctx, prNumber, requestedAt);

	await runAgentStep(pi, ctx, "Sheva: addressing PR comments", addressPrCommentsPrompt(prNumber));
	if (stopForShevaDecisionWait(ctx) || !mergeAfter) return;

	let report: MergeCheckReport | undefined;
	for (let attempt = 1; attempt <= 10; attempt += 1) {
		notify(ctx, `Sheva: running merge checks (attempt ${attempt})`);
		report = await runMergeChecks(pi, prNumber);
		if (report.ok) break;

		if (!report.comments.pass) {
			await runAgentStep(
				pi,
				ctx,
				"Sheva: addressing unresolved PR comments before merge",
				addressPrCommentsPrompt(prNumber),
			);
			if (stopForShevaDecisionWait(ctx)) return;
			continue;
		}

		if (hasOnlyPendingCi(report)) {
			notify(ctx, "Sheva: CI is still pending; waiting 1 minute");
			await sleep(ONE_MINUTE_MS);
			continue;
		}

		await runAgentStep(pi, ctx, "Sheva: fixing merge preflight blockers", mergeRepairPrompt(report));
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
				await runAgentStep(pi, ctx, "Sheva: creating plan", planPrompt(args.trim()));
				if (stopForShevaDecisionWait(ctx)) return;

				const nextCommand = shevaNextCommand(lastAssistantText(ctx));
				if (nextCommand) {
					await runAgentStep(pi, ctx, `Sheva: running nested ${nextCommand.split(/\s+/, 1)[0]}`, nextCommand, {
						expandPromptTemplates: true,
					});
					if (stopForShevaDecisionWait(ctx)) return;
					await runAgentStep(
						pi,
						ctx,
						"Sheva: writing plan after grill workflow",
						planPrompt(args.trim(), "after-grill"),
					);
					if (stopForShevaDecisionWait(ctx)) return;
				}
			} catch (error) {
				ctx.ui.notify(`Sheva plan failed: ${error instanceof Error ? error.message : String(error)}`, "error");
			} finally {
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

				await runAgentStep(pi, ctx, "Sheva: creating plan", planPrompt(args.trim()));
				if (stopForShevaDecisionWait(ctx)) return;
				let planLocation = extractPlanLocation(lastAssistantText(ctx));

				const nextCommand = shevaNextCommand(lastAssistantText(ctx));
				if (nextCommand) {
					await runAgentStep(pi, ctx, `Sheva: running nested ${nextCommand.split(/\s+/, 1)[0]}`, nextCommand, {
						expandPromptTemplates: true,
					});
					if (stopForShevaDecisionWait(ctx)) return;
					await runAgentStep(
						pi,
						ctx,
						"Sheva: writing plan after grill workflow",
						planPrompt(args.trim(), "after-grill"),
					);
					if (stopForShevaDecisionWait(ctx)) return;
					planLocation = extractPlanLocation(lastAssistantText(ctx));
				}

				if (!planLocation) {
					throw new Error("Sheva could not detect the plan path; refusing to carry the full planning context into implementation.");
				}

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
				if (!sessionReplaced) ctx.ui.setStatus("sheva", undefined);
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
						await runAgentStep(
							pi,
							ctx,
							"Sheva: addressing unresolved PR comments before merge",
							addressPrCommentsPrompt(prNumber),
						);
						if (stopForShevaDecisionWait(ctx)) return;
						continue;
					}

					if (hasOnlyPendingCi(report)) {
						notify(ctx, "Sheva: CI is still pending; waiting 1 minute");
						await sleep(ONE_MINUTE_MS);
						continue;
					}

					await runAgentStep(
						pi,
						ctx,
						"Sheva: fixing merge preflight blockers",
						mergeRepairPrompt(report),
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
				ctx.ui.setStatus("sheva", undefined);
			}
		},
	});
}
