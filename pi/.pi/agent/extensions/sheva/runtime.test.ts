import { describe, expect, test } from "bun:test";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	checkShevaDependencies,
	escalateReasoningPolicy,
	preflightSheva,
	reasoningPolicyForRisk,
	reasoningPolicyForStep,
	runAgentStep,
	SHEVA_PROMPT_COMMANDS,
	SHEVA_PROMPT_DEPENDENCIES,
	SHEVA_PROMPT_SKILLS,
	SHEVA_PROMPT_TOOLS,
	type ShevaDependency,
} from "./runtime";

const pi = {} as ExtensionAPI;

describe("reasoning policy", () => {
	test("maps explicit risk classes to their default levels", () => {
		expect(reasoningPolicyForRisk("routine", "docs").level).toBe("fast");
		expect(reasoningPolicyForRisk("ordinary", "implementation").level).toBe("standard");
		expect(reasoningPolicyForRisk("high", "migration").level).toBe("high");
	});

	test("defaults unknown risk upward", () => {
		expect(reasoningPolicyForRisk("unknown", "unclassified")).toMatchObject({
			level: "high",
			risk: "high",
			escalated: true,
		});
	});

	test("escalates every high-risk category without downgrading explicit high risk", () => {
		for (const detail of [
			"authentication change",
			"authorization boundary",
			"tenant isolation",
			"billing credits",
			"database schema migration",
			"concurrency race",
			"destructive cleanup",
			"production deployment",
		]) {
			expect(reasoningPolicyForRisk("routine", "mechanical default", detail).level).toBe("high");
		}
		expect(reasoningPolicyForRisk("high", "explicit", "documentation")).toMatchObject({
			level: "high",
			risk: "high",
			escalated: false,
		});
	});

	test("keeps an escalated policy high for the current step", () => {
		const escalated = escalateReasoningPolicy(reasoningPolicyForStep("implementation"), "unclear invariant");
		expect(escalateReasoningPolicy(escalated, "later mechanical edit")).toBe(escalated);
	});

	test("supports an explicit high-reasoning escape hatch", () => {
		const original = process.env.SHEVA_REASONING_LEVEL;
		process.env.SHEVA_REASONING_LEVEL = "high";
		try {
			expect(reasoningPolicyForStep("pr")).toMatchObject({ level: "high", risk: "high", escalated: true });
		} finally {
			if (original === undefined) delete process.env.SHEVA_REASONING_LEVEL;
			else process.env.SHEVA_REASONING_LEVEL = original;
		}
	});
});

describe("runAgentStep", () => {
	test("keeps existing prompt execution unchanged when routing is disabled", async () => {
		const sent: unknown[][] = [];
		let waits = 0;
		const stepPi = {
			sendUserMessage: (...args: unknown[]) => sent.push(args),
		} as unknown as ExtensionAPI;
		const ctx = {
			ui: { notify: () => {}, setStatus: () => {} },
			waitForIdle: async () => {
				waits += 1;
			},
		} as unknown as ExtensionCommandContext;

		const metric = await runAgentStep(stepPi, ctx, "test step", "same prompt", {
			policy: reasoningPolicyForStep("verification"),
			settle: async () => {},
			now: (() => {
				const values = [100, 125];
				return () => values.shift()!;
			})(),
		});

		expect(sent).toEqual([["same prompt", { expandPromptTemplates: false }]]);
		expect(waits).toBe(1);
		expect(metric).toMatchObject({ success: true, elapsedMs: 25, routingApplied: false });
	});

	test("falls back safely when Pi does not expose routing controls", async () => {
		const original = process.env.SHEVA_REASONING_ROUTING;
		process.env.SHEVA_REASONING_ROUTING = "1";
		try {
			const stepPi = { sendUserMessage: () => {} } as unknown as ExtensionAPI;
			const ctx = {
				ui: { notify: () => {}, setStatus: () => {} },
				waitForIdle: async () => {},
			} as unknown as ExtensionCommandContext;

			const metric = await runAgentStep(stepPi, ctx, "fallback", "prompt", {
				policy: reasoningPolicyForStep("implementation"),
				settle: async () => {},
			});
			expect(metric).toMatchObject({ success: true, routingApplied: false });
		} finally {
			if (original === undefined) delete process.env.SHEVA_REASONING_ROUTING;
			else process.env.SHEVA_REASONING_ROUTING = original;
		}
	});

	test("applies the selected level for one step and restores the session level", async () => {
		const original = process.env.SHEVA_REASONING_ROUTING;
		process.env.SHEVA_REASONING_ROUTING = "1";
		try {
			let level = "high";
			const selected: string[] = [];
			const stepPi = {
				sendUserMessage: () => {},
				getThinkingLevel: () => level,
				setThinkingLevel: (next: string) => {
					level = next;
					selected.push(next);
				},
			} as unknown as ExtensionAPI;
			const ctx = {
				ui: { notify: () => {}, setStatus: () => {} },
				waitForIdle: async () => {},
			} as unknown as ExtensionCommandContext;

			const metric = await runAgentStep(stepPi, ctx, "routed", "prompt", {
				policy: reasoningPolicyForStep("verification"),
				settle: async () => {},
			});
			expect(selected).toEqual(["low", "high"]);
			expect(metric.routingApplied).toBe(true);
		} finally {
			if (original === undefined) delete process.env.SHEVA_REASONING_ROUTING;
			else process.env.SHEVA_REASONING_ROUTING = original;
		}
	});

	test("reports compact metrics only when debug reporting is enabled", async () => {
		const notifications: string[] = [];
		const stepPi = { sendUserMessage: () => {} } as unknown as ExtensionAPI;
		const ctx = {
			ui: {
				notify: (message: string) => notifications.push(message),
				setStatus: () => {},
			},
			waitForIdle: async () => {},
		} as unknown as ExtensionCommandContext;
		const options = {
			policy: reasoningPolicyForStep("pr"),
			settle: async () => {},
			now: () => 1,
		};

		await runAgentStep(stepPi, ctx, "quiet", "prompt", options);
		expect(notifications.some((message) => message.startsWith("Sheva metric:"))).toBe(false);
		await runAgentStep(stepPi, ctx, "debug", "prompt", { ...options, debugMetrics: true });
		expect(notifications.at(-1)).toContain("Sheva metric: debug: fast/routine");
	});
});

describe("checkShevaDependencies", () => {
	test("returns no errors when every dependency is ready", async () => {
		const dependencies: ShevaDependency[] = [
			{ name: "ready", check: async () => undefined },
		];

		expect(await checkShevaDependencies(pi, dependencies)).toEqual([]);
	});

	test("reports failed and broken checks", async () => {
		const dependencies: ShevaDependency[] = [
			{ name: "missing", check: async () => "install it" },
			{
				name: "broken",
				check: async () => {
					throw new Error("check crashed");
				},
			},
		];

		expect(await checkShevaDependencies(pi, dependencies)).toEqual([
			"missing: install it",
			"broken: check crashed",
		]);
	});

	test("reports missing prompt skills, extensions, and inactive tools", async () => {
		const configuredTools = SHEVA_PROMPT_TOOLS.filter((tool) => tool !== "search_graph");
		const activeTools = configuredTools.filter((tool) => tool !== "questionnaire");
		const promptResources = SHEVA_PROMPT_DEPENDENCIES.filter((dependency) =>
			["Prompt skills", "Prompt extensions/tools"].includes(dependency.name),
		);
		const promptPi = {
			getCommands: () =>
				SHEVA_PROMPT_SKILLS.filter((skill) => skill !== "frontend-design").map((skill) => ({
					name: `skill:${skill}`,
					source: "skill",
				})),
			getAllTools: () => configuredTools.map((name) => ({ name })),
			getActiveTools: () => activeTools,
		} as unknown as ExtensionAPI;

		expect(await checkShevaDependencies(promptPi, promptResources)).toEqual([
			"Prompt skills: load required skills: frontend-design",
			"Prompt extensions/tools: install/load extensions providing: search_graph; enable tools: questionnaire",
		]);
	});

	test("reports prompt commands missing from PATH", async () => {
		const originalPath = process.env.PATH;
		process.env.PATH = "";
		try {
			const commandDependency = SHEVA_PROMPT_DEPENDENCIES.filter(
				(dependency) => dependency.name === "Prompt commands",
			);
			expect(await checkShevaDependencies(pi, commandDependency)).toEqual([
				`Prompt commands: install commands on PATH: ${SHEVA_PROMPT_COMMANDS.join(", ")}`,
			]);
		} finally {
			process.env.PATH = originalPath;
		}
	});

	test("prints one error and stops when preflight fails", async () => {
		const notifications: unknown[][] = [];
		const ctx = {
			ui: { notify: (...args: unknown[]) => notifications.push(args) },
		} as unknown as ExtensionCommandContext;

		expect(
			await preflightSheva(pi, ctx, [{ name: "missing", check: async () => "install it" }]),
		).toBe(false);
		expect(notifications).toEqual([["Sheva pre-check failed:\n- missing: install it", "error"]]);
	});
});
