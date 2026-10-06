import { mkdtemp, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
	type TruncationResult,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";

const TOOL_NAMES = [
	"index_repository",
	"index_status",
	"list_projects",
	"delete_project",
	"search_graph",
	"search_code",
	"trace_path",
	"detect_changes",
	"query_graph",
	"get_graph_schema",
	"get_code_snippet",
	"get_architecture",
	"manage_adr",
	"ingest_traces",
] as const;

type CodebaseMemoryToolName = (typeof TOOL_NAMES)[number];

type Project = {
	name: string;
	root_path: string;
};

type CliDetails = {
	tool: CodebaseMemoryToolName;
	args: Record<string, unknown>;
	stderr?: string;
	truncation?: TruncationResult;
	fullOutputPath?: string;
};

const defaultBinary = join(homedir(), ".local", "bin", "codebase-memory-mcp");

const commonProjectField = {
	project: Type.Optional(
		Type.String({
			description:
				"Indexed project name. If omitted, the wrapper chooses the indexed project whose root_path best matches the current cwd.",
		}),
	),
};

const commonPagingFields = {
	limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, description: "Maximum rows/results to return." })),
	offset: Type.Optional(Type.Integer({ minimum: 0, description: "Result offset for pagination." })),
};

const emptyObjectSchema = Type.Object({}, { additionalProperties: true });

const schemas = {
	index_repository: Type.Object(
		{
			repo_path: Type.Optional(
				Type.String({ description: "Repository path to index. Defaults to the current working directory." }),
			),
			force: Type.Optional(Type.Boolean({ description: "Force a fresh/replacement index when supported." })),
		},
		{ additionalProperties: true },
	),
	index_status: Type.Object({ ...commonProjectField }, { additionalProperties: true }),
	list_projects: emptyObjectSchema,
	delete_project: Type.Object(
		{
			project: Type.String({ description: "Indexed project name to delete." }),
		},
		{ additionalProperties: true },
	),
	search_graph: Type.Object(
		{
			...commonProjectField,
			label: Type.Optional(Type.String({ description: "Node label filter, e.g. Function, Class, Method, File." })),
			name_pattern: Type.Optional(Type.String({ description: "Regex for node name matching, e.g. .*Handler.*" })),
			relationship: Type.Optional(Type.String({ description: "Relationship/edge type degree filter, e.g. CALLS." })),
			direction: Type.Optional(Type.String({ description: "Degree direction filter: inbound, outbound, or both." })),
			min_degree: Type.Optional(Type.Integer({ minimum: 0 })),
			max_degree: Type.Optional(Type.Integer({ minimum: 0 })),
			exclude_entry_points: Type.Optional(Type.Boolean()),
			is_test: Type.Optional(Type.Boolean()),
			is_exported: Type.Optional(Type.Boolean()),
			...commonPagingFields,
		},
		{ additionalProperties: true },
	),
	search_code: Type.Object(
		{
			...commonProjectField,
			query: Type.String({ description: "Text or regex query to search in indexed code." }),
			path_pattern: Type.Optional(Type.String({ description: "Optional file path regex/pattern filter." })),
			...commonPagingFields,
		},
		{ additionalProperties: true },
	),
	trace_path: Type.Object(
		{
			...commonProjectField,
			function_name: Type.String({ description: "Exact function/method/node name to trace. Use search_graph first if unsure." }),
			direction: Type.Optional(Type.String({ description: "Trace direction: inbound, outbound, or both." })),
			depth: Type.Optional(Type.Integer({ minimum: 1, maximum: 10, description: "Maximum graph traversal depth." })),
			risk_labels: Type.Optional(Type.Boolean({ description: "Include risk labels when supported." })),
		},
		{ additionalProperties: true },
	),
	detect_changes: Type.Object({ ...commonProjectField }, { additionalProperties: true }),
	query_graph: Type.Object(
		{
			...commonProjectField,
			query: Type.String({ description: "Cypher query to run against the indexed graph." }),
			params: Type.Optional(Type.Any({ description: "Optional query parameters object." })),
		},
		{ additionalProperties: true },
	),
	get_graph_schema: Type.Object({ ...commonProjectField }, { additionalProperties: true }),
	get_code_snippet: Type.Object(
		{
			...commonProjectField,
			qualified_name: Type.Optional(Type.String({ description: "Exact qualified node name from search_graph." })),
			file_path: Type.Optional(Type.String({ description: "File path to read snippet from, when supported." })),
			start_line: Type.Optional(Type.Integer({ minimum: 1 })),
			end_line: Type.Optional(Type.Integer({ minimum: 1 })),
		},
		{ additionalProperties: true },
	),
	get_architecture: Type.Object(
		{
			...commonProjectField,
			aspects: Type.Optional(
				Type.Array(Type.String(), {
					description: "Architecture aspects to return, e.g. ['all'] or ['overview'].",
				}),
			),
		},
		{ additionalProperties: true },
	),
	manage_adr: Type.Object(
		{
			...commonProjectField,
			mode: Type.String({ description: "ADR operation mode, e.g. store, update, get/list when supported." }),
			content: Type.Optional(Type.String({ description: "ADR content to store/update when supported." })),
		},
		{ additionalProperties: true },
	),
	ingest_traces: Type.Object(
		{
			...commonProjectField,
			trace_path: Type.Optional(Type.String({ description: "Path to trace file/directory when supported." })),
		},
		{ additionalProperties: true },
	),
} satisfies Record<CodebaseMemoryToolName, unknown>;

type ToolParams<T extends CodebaseMemoryToolName> = Static<(typeof schemas)[T]> & Record<string, unknown>;

function binaryPath() {
	return process.env.CODEBASE_MEMORY_MCP || defaultBinary;
}

function normalizeJsonArg(value: Record<string, unknown>) {
	return JSON.stringify(value, (_key, item) => (item === undefined ? undefined : item));
}

function extractJson(stdout: string) {
	const trimmed = stdout.trim();
	if (!trimmed) return undefined;
	try {
		return JSON.parse(trimmed);
	} catch {
		return undefined;
	}
}

async function writeTruncatedOutput(output: string, truncation: TruncationResult) {
	if (!truncation.truncated) return { text: output, fullOutputPath: undefined };

	const tempDir = await mkdtemp(join(tmpdir(), "pi-codebase-memory-"));
	const fullOutputPath = join(tempDir, "output.txt");
	await writeFile(fullOutputPath, output, "utf8");

	let text = truncation.content;
	const omittedLines = truncation.totalLines - truncation.outputLines;
	const omittedBytes = truncation.totalBytes - truncation.outputBytes;
	text += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`;
	text += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
	text += ` ${omittedLines} lines (${formatSize(omittedBytes)}) omitted.`;
	text += ` Full output saved to: ${fullOutputPath}]`;

	return { text, fullOutputPath };
}

async function runCli(
	pi: ExtensionAPI,
	tool: CodebaseMemoryToolName,
	args: Record<string, unknown>,
	signal?: AbortSignal,
) {
	const result = await pi.exec(binaryPath(), ["cli", tool, normalizeJsonArg(args)], {
		signal,
		timeout: tool === "index_repository" ? 10 * 60 * 1000 : 2 * 60 * 1000,
	});

	const stdout = result.stdout ?? "";
	const stderr = result.stderr ?? "";
	if (result.code !== 0) {
		const message = [stdout, stderr].filter(Boolean).join("\n").trim();
		throw new Error(message || `${tool} failed with exit code ${result.code}`);
	}

	return { stdout, stderr, json: extractJson(stdout) };
}

async function findCurrentProject(pi: ExtensionAPI, ctx: ExtensionContext, signal?: AbortSignal) {
	const { json } = await runCli(pi, "list_projects", {}, signal);
	const projects = Array.isArray(json?.projects) ? (json.projects as Project[]) : [];
	const cwd = ctx.cwd.replace(/\/$/, "");

	const matches = projects
		.filter((project) => typeof project.name === "string" && typeof project.root_path === "string")
		.filter((project) => {
			const root = project.root_path.replace(/\/$/, "");
			return cwd === root || cwd.startsWith(`${root}/`);
		})
		.sort((a, b) => b.root_path.length - a.root_path.length);

	return matches[0]?.name;
}

const toolsNeedingProject = new Set<CodebaseMemoryToolName>([
	"index_status",
	"search_graph",
	"search_code",
	"trace_path",
	"detect_changes",
	"query_graph",
	"get_graph_schema",
	"get_code_snippet",
	"get_architecture",
	"manage_adr",
	"ingest_traces",
]);

async function prepareArgs(
	pi: ExtensionAPI,
	tool: CodebaseMemoryToolName,
	params: Record<string, unknown>,
	ctx: ExtensionContext,
	signal?: AbortSignal,
) {
	const args = { ...params };

	if (tool === "index_repository" && typeof args.repo_path !== "string") {
		args.repo_path = ctx.cwd;
	}

	if (toolsNeedingProject.has(tool) && typeof args.project !== "string") {
		const project = await findCurrentProject(pi, ctx, signal);
		if (project) {
			args.project = project;
		} else if (tool === "index_status") {
			return {
				args,
				shortCircuit: `No indexed project matches cwd ${ctx.cwd}. Run index_repository with {"repo_path":"${ctx.cwd}"} first.`,
			};
		}
	}

	return { args };
}

const descriptions: Record<CodebaseMemoryToolName, string> = {
	index_repository: "Index a repository with codebase-memory-mcp. Defaults repo_path to the current cwd. Output is truncated if large.",
	index_status: "Check whether an indexed codebase-memory project is ready. If project is omitted, matches current cwd.",
	list_projects: "List repositories indexed by codebase-memory-mcp.",
	delete_project: "Delete an indexed codebase-memory project by name.",
	search_graph: "Search indexed code structure by symbol/node name, label, degree, or relationship using codebase-memory-mcp.",
	search_code: "Search indexed source text using codebase-memory-mcp.",
	trace_path: "Trace inbound/outbound/both call paths for an exact function or method name using codebase-memory-mcp.",
	detect_changes: "Map current git changes to affected indexed symbols using codebase-memory-mcp.",
	query_graph: "Run a Cypher query against the codebase-memory graph. Use for edge/property queries not covered by search_graph.",
	get_graph_schema: "Return graph node labels, edge types, and properties for an indexed codebase-memory project.",
	get_code_snippet: "Read a source snippet for a qualified graph node from codebase-memory-mcp.",
	get_architecture: "Summarize indexed repository architecture from codebase-memory-mcp.",
	manage_adr: "Store, update, or retrieve architecture decision records in codebase-memory-mcp.",
	ingest_traces: "Ingest runtime traces into codebase-memory-mcp when trace inputs are available.",
};

export default function codebaseMemoryExtension(pi: ExtensionAPI) {
	for (const toolName of TOOL_NAMES) {
		pi.registerTool({
			name: toolName,
			label: toolName,
			description: `${descriptions[toolName]} This wraps: codebase-memory-mcp cli ${toolName} <json>. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
			promptSnippet: descriptions[toolName],
			promptGuidelines:
				toolName === "list_projects"
					? [
							"Use codebase-memory graph tools (list_projects, index_status, index_repository, search_graph, trace_path, get_code_snippet, query_graph, get_architecture, search_code) before broad grep/read exploration when looking up code structure in repositories.",
						]
					: undefined,
			parameters: schemas[toolName],
			async execute(_toolCallId, params: ToolParams<typeof toolName>, signal, _onUpdate, ctx) {
				const prepared = await prepareArgs(pi, toolName, params, ctx, signal);
				if (prepared.shortCircuit) {
					return {
						content: [{ type: "text", text: prepared.shortCircuit }],
						details: { tool: toolName, args: prepared.args } satisfies CliDetails,
					};
				}

				const { stdout, stderr } = await runCli(pi, toolName, prepared.args, signal);
				const output = stdout.trim() ? stdout : stderr;
				const truncation = truncateHead(output, {
					maxLines: DEFAULT_MAX_LINES,
					maxBytes: DEFAULT_MAX_BYTES,
				});
				const { text, fullOutputPath } = await writeTruncatedOutput(output, truncation);

				const details: CliDetails = {
					tool: toolName,
					args: prepared.args,
				};
				if (stderr.trim()) details.stderr = stderr;
				if (truncation.truncated) details.truncation = truncation;
				if (fullOutputPath) details.fullOutputPath = fullOutputPath;

				return {
					content: [{ type: "text", text }],
					details,
				};
			},
			renderCall(args, theme) {
				let text = theme.fg("toolTitle", theme.bold(toolName));
				if (args && typeof args === "object") {
					const project = (args as Record<string, unknown>).project;
					const repoPath = (args as Record<string, unknown>).repo_path;
					const query = (args as Record<string, unknown>).query;
					const namePattern = (args as Record<string, unknown>).name_pattern;
					const functionName = (args as Record<string, unknown>).function_name;
					const qualifiedName = (args as Record<string, unknown>).qualified_name;
					const summary = project ?? repoPath ?? query ?? namePattern ?? functionName ?? qualifiedName;
					if (summary) text += " " + theme.fg("muted", String(summary));
				}
				return new Text(text, 0, 0);
			},
			renderResult(result, { expanded, isPartial }, theme) {
				if (isPartial) return new Text(theme.fg("warning", "Running codebase-memory-mcp..."), 0, 0);
				const details = result.details as CliDetails | undefined;
				let text = theme.fg("success", `${toolName} complete`);
				if (details?.truncation?.truncated) text += theme.fg("warning", " (truncated)");
				if (details?.fullOutputPath) text += theme.fg("dim", ` full: ${details.fullOutputPath}`);

				if (expanded) {
					const content = result.content?.[0];
					if (content?.type === "text") {
						const preview = content.text.split("\n").slice(0, 30).join("\n");
						text += "\n" + theme.fg("dim", preview);
					}
				}

				return new Text(text, 0, 0);
			},
		});
	}
}
