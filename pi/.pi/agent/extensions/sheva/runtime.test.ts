import { describe, expect, test } from "bun:test";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { checkShevaDependencies, preflightSheva, type ShevaDependency } from "./runtime";

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
