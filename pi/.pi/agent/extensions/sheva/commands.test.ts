import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { implementationReasoningPolicy } from "./commands";

test("implementation plans escalate from inspected risk and fail safely when unavailable", async () => {
	const directory = await mkdtemp(join(tmpdir(), "sheva-routing-"));
	try {
		await writeFile(join(directory, "routine.md"), "Update documentation and fixtures.");
		await writeFile(join(directory, "risky.md"), "Apply database migrations and rotate secrets.");

		expect((await implementationReasoningPolicy(directory, "routine.md")).level).toBe("standard");
		expect((await implementationReasoningPolicy(directory, "risky.md")).level).toBe("high");
		expect((await implementationReasoningPolicy(directory, "missing.md")).level).toBe("high");
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
