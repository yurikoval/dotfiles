import { describe, expect, test } from "bun:test";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	checkShevaDependencies,
	preflightSheva,
	SHEVA_PROMPT_COMMANDS,
	SHEVA_PROMPT_DEPENDENCIES,
	SHEVA_PROMPT_SKILLS,
	SHEVA_PROMPT_TOOLS,
	type ShevaDependency,
} from "./runtime";

const pi = {} as ExtensionAPI;

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
