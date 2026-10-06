import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

type UsageLike = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  cost?: { total?: number };
};

type SummaryData = {
  version: 1;
  summary: string;
  source: "auto" | "manual" | "fallback";
  createdAt: string;
  sourceLeafId?: string | null;
};

const SUMMARY_ENTRY_TYPE = "thread-status-summary";
const DEFAULT_SUMMARY = "New thread";
const PENDING_SUMMARY = "Summarizing thread…";
const MAX_CONVERSATION_CHARS = 8000;

function usageFromEntry(entry: any): UsageLike | undefined {
  if (entry?.type === "message" && entry.message?.role === "assistant") {
    return entry.message.usage;
  }
  if (entry?.type === "message" && entry.message?.role === "toolResult") {
    return entry.message.usage;
  }
  if ((entry?.type === "branch_summary" || entry?.type === "compaction") && entry.usage) {
    return entry.usage;
  }
  return undefined;
}

function sessionCostUsd(entries: readonly any[]): number {
  let cost = 0;
  for (const entry of entries) {
    const usage = usageFromEntry(entry);
    cost += usage?.cost?.total ?? 0;
  }
  return cost;
}

function sanitizeStatusText(text: string): string {
  return text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}

function pctColor(theme: any, percent: number | null | undefined, text: string): string {
  if (percent === null || percent === undefined) return text;
  if (percent < 60) return theme.fg("success", text);
  if (percent <= 90) return theme.fg("warning", text);
  return theme.fg("error", text);
}

function modelLabel(ctx: any): string | undefined {
  const model = ctx.model;
  if (!model) return undefined;
  const base = model.name || model.id;
  const thinking = ctx.thinkingLevel && ctx.thinkingLevel !== "off" ? ` ${ctx.thinkingLevel}` : "";
  return `${base}${thinking}`;
}

function extractTextParts(content: unknown): string[] {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];

  const parts: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const block = part as { type?: string; text?: string };
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts;
}

function buildConversationText(entries: readonly any[]): string {
  const sections: string[] = [];

  for (const entry of entries) {
    if (entry?.type !== "message") continue;
    const role = entry.message?.role;
    if (role !== "user" && role !== "assistant") continue;

    const text = extractTextParts(entry.message.content).join("\n").trim();
    if (!text) continue;

    sections.push(`${role === "user" ? "User" : "Assistant"}: ${text}`);
  }

  const conversation = sections.join("\n\n");
  if (conversation.length <= MAX_CONVERSATION_CHARS) return conversation;
  return conversation.slice(0, MAX_CONVERSATION_CHARS) + "\n\n[truncated]";
}

function normalizeSummary(summary: string): string {
  const cleaned = sanitizeStatusText(summary)
    .replace(/^['"“”‘’]+|['"“”‘’]+$/g, "")
    .replace(/[.!?]+$/g, "")
    .trim();

  if (!cleaned) return DEFAULT_SUMMARY;

  const words = cleaned.split(/\s+/).slice(0, 12).join(" ");
  return words.length > 80 ? words.slice(0, 77).trimEnd() + "…" : words;
}

function fallbackSummary(entries: readonly any[]): string {
  const firstUser = entries.find((entry) => entry?.type === "message" && entry.message?.role === "user");
  const text = extractTextParts(firstUser?.message?.content).join(" ").trim();
  if (!text) return DEFAULT_SUMMARY;

  const withoutCommand = text.replace(/^\/[^\s]+\s*/, "").trim() || text;
  return normalizeSummary(withoutCommand);
}

function findStoredSummary(ctx: any): string | undefined {
  const branch = ctx.sessionManager.getBranch() as any[];
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (entry?.type !== "custom" || entry.customType !== SUMMARY_ENTRY_TYPE) continue;
    const summary = entry.data?.summary;
    if (typeof summary === "string" && summary.trim()) {
      return normalizeSummary(summary);
    }
  }
  return undefined;
}

function hasConversation(ctx: any): boolean {
  return Boolean(buildConversationText(ctx.sessionManager.getBranch() as any[]).trim());
}

function summaryPrompt(conversationText: string): string {
  return [
    "Name this coding-agent conversation for a terminal status bar.",
    "Use plain, layman's terms so the user can glance at a window/tab and know what it is.",
    "Return only one short phrase, 4-10 words, no punctuation, no quotes.",
    "Do not mention implementation details unless they are the main task.",
    "",
    "Conversation:",
    conversationText,
  ].join("\n");
}

export default function (pi: ExtensionAPI) {
  let summaryLine = DEFAULT_SUMMARY;
  let hasStoredSummary = false;
  let autoAttempted = false;
  let pending = false;
  let disposed = false;
  let requestRender: (() => void) | undefined;

  function setSummary(next: string): void {
    summaryLine = normalizeSummary(next);
    requestRender?.();
  }

  async function generateAndStoreSummary(ctx: any, source: "auto" | "manual"): Promise<void> {
    if (pending) {
      if (source === "manual" && ctx.hasUI) ctx.ui.notify("Thread summary is already running", "info");
      return;
    }

    const branch = ctx.sessionManager.getBranch() as any[];
    const conversationText = buildConversationText(branch);
    if (!conversationText.trim()) {
      if (source === "manual" && ctx.hasUI) ctx.ui.notify("No conversation to summarize yet", "warning");
      return;
    }

    if (source === "auto") autoAttempted = true;
    pending = true;
    setSummary(PENDING_SUMMARY);

    let summarySource: SummaryData["source"] = source;
    let summary = fallbackSummary(branch);

    try {
      const model = ctx.model;
      if (model && ctx.modelRegistry.hasConfiguredAuth(model)) {
        const response = await ctx.modelRegistry.complete(
          model,
          {
            messages: [
              {
                role: "user" as const,
                content: [{ type: "text" as const, text: summaryPrompt(conversationText) }],
                timestamp: Date.now(),
              },
            ],
          },
          {
            reasoningEffort: "minimal",
            cacheRetention: "none",
            sessionId: randomUUID(),
          },
        );

        const modelSummary = response.content
          .filter((part: any): part is { type: "text"; text: string } => part?.type === "text")
          .map((part: { text: string }) => part.text)
          .join(" ");

        summary = normalizeSummary(modelSummary || summary);
      } else {
        summarySource = "fallback";
      }
    } catch (error) {
      summarySource = "fallback";
      if (source === "manual" && ctx.hasUI) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Thread summary fell back to first prompt: ${message}`, "warning");
      }
    } finally {
      pending = false;
    }

    if (disposed) return;

    setSummary(summary);
    hasStoredSummary = true;
    pi.appendEntry<SummaryData>(SUMMARY_ENTRY_TYPE, {
      version: 1,
      summary,
      source: summarySource,
      createdAt: new Date().toISOString(),
      sourceLeafId: ctx.sessionManager.getLeafId(),
    });

    if (source === "manual" && ctx.hasUI) ctx.ui.notify(`Thread summary set: ${summary}`, "info");
  }

  pi.registerCommand("thread-summary", {
    description: "Show, set, or refresh the one-time footer thread summary. Usage: /thread-summary [text|--refresh]",
    handler: async (args, ctx) => {
      const value = (args ?? "").trim();

      if (!value) {
        ctx.ui.notify(`Thread summary: ${summaryLine}`, "info");
        return;
      }

      if (value === "--refresh" || value === "refresh") {
        await generateAndStoreSummary(ctx, "manual");
        return;
      }

      setSummary(value);
      hasStoredSummary = true;
      pi.appendEntry<SummaryData>(SUMMARY_ENTRY_TYPE, {
        version: 1,
        summary: summaryLine,
        source: "manual",
        createdAt: new Date().toISOString(),
        sourceLeafId: ctx.sessionManager.getLeafId(),
      });
      ctx.ui.notify(`Thread summary set: ${summaryLine}`, "info");
    },
  });

  pi.on("session_start", (_event, ctx) => {
    disposed = false;
    requestRender = undefined;
    autoAttempted = false;
    pending = false;

    const stored = findStoredSummary(ctx);
    hasStoredSummary = Boolean(stored);
    summaryLine = stored || DEFAULT_SUMMARY;

    if (ctx.mode !== "tui") return;

    ctx.ui.setFooter((tui, theme, footerData) => {
      requestRender = () => tui.requestRender();
      const interval = setInterval(() => tui.requestRender(), 10_000);
      const unsubscribeBranch = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose() {
          clearInterval(interval);
          unsubscribeBranch();
          if (requestRender) requestRender = undefined;
        },
        invalidate() {},
        render(width: number): string[] {
          const bottomParts: string[] = ["🇺🇦"];

          const branch = footerData.getGitBranch();
          if (branch) bottomParts.push(branch);

          const model = modelLabel(ctx);
          if (model) bottomParts.push(model);

          const contextUsage = ctx.getContextUsage();
          if (contextUsage) {
            const percent = contextUsage.percent;
            const display = percent === null ? "ctx:?" : `ctx:${Math.round(percent)}%`;
            bottomParts.push(pctColor(theme, percent, display));
          }

          const cost = sessionCostUsd(ctx.sessionManager.getEntries() as readonly any[]);
          if (cost > 0) bottomParts.push(`sess:$${cost.toFixed(2)}`);

          const statuses = Array.from(footerData.getExtensionStatuses().entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([, text]) => sanitizeStatusText(text))
            .filter(Boolean);

          if (statuses.length > 0) bottomParts.push(...statuses);

          const topLine = theme.fg("dim", "Thread: ") + theme.fg("accent", summaryLine);
          const bottomLine = bottomParts.join("  ");

          return [
            truncateToWidth(topLine, width, theme.fg("dim", "…")),
            truncateToWidth(bottomLine, width, theme.fg("dim", "…")),
          ];
        },
      };
    });

    if (!hasStoredSummary && hasConversation(ctx)) {
      void generateAndStoreSummary(ctx, "auto");
    }
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (hasStoredSummary || autoAttempted || pending || !hasConversation(ctx)) return;
    void generateAndStoreSummary(ctx, "auto");
  });

  pi.on("session_shutdown", () => {
    disposed = true;
    requestRender = undefined;
  });
}
