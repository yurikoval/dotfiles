import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Thinking = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
type Lane = "strong" | "medium" | "cheap";

type Route = {
  lane: Lane;
  provider: string;
  model: string;
  thinking: Thinking;
  reason: string;
  confidence: "forced" | "high" | "default";
};

type CostRouterEntry = {
  lane: Lane;
  provider: string;
  model: string;
  thinking: Thinking;
  reason: string;
  confidence: Route["confidence"];
  timestamp: number;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    totalTokens?: number;
    costTotal?: number;
  };
  stopReason?: string;
  error?: boolean;
};

const BASE_ROUTES: Record<Lane, Omit<Route, "reason" | "confidence">> = {
  strong: {
    lane: "strong",
    provider: "openai-codex",
    model: "gpt-5.6-sol",
    thinking: "high",
  },
  medium: {
    lane: "medium",
    provider: "openai-codex",
    model: "gpt-5.6-terra",
    thinking: "low",
  },
  cheap: {
    lane: "cheap",
    provider: "openai-codex",
    model: "gpt-5.6-luna",
    thinking: "off",
  },
};

const FORCE_RE = /^\/cost\s+(strong|medium|cheap|off)\s+([\s\S]*)$/i;

function route(lane: Lane, reason: string, confidence: Route["confidence"]): Route {
  return { ...BASE_ROUTES[lane], reason, confidence };
}

function classify(prompt: string): Route {
  const lower = prompt.toLowerCase();

  if (/\b(production|prod|security|auth|payment|stripe|migration|data model|architecture|diagnose|debug|incident|credentials?|secrets?)\b/.test(lower)) {
    return route("strong", "risk keyword", "high");
  }

  if (/\b(implementation plan|plan_description|draft .*plan|create .*plan|product request|engineering request|code review|review .*diff|quality gate)\b/.test(lower)) {
    return route("medium", "planning or review", "high");
  }

  if (/\b(fix typo|format|rename|search|find|summari[sz]e|inspect|where is|list files|grep|read only|read-only|token usage|cost stats|cost analysis)\b/.test(lower)) {
    return route("cheap", "low-risk search or mechanical task", "high");
  }

  if (/\b(add test|fix spec|failing spec|wire up|implement|small refactor|update copy|small edit)\b/.test(lower)) {
    return route("medium", "ordinary implementation", "high");
  }

  return route("strong", "default route", "default");
}

function summarizeEntries(entries: CostRouterEntry[]): string {
  const byLane = new Map<Lane, { calls: number; cost: number; tokens: number; errors: number }>();

  for (const entry of entries) {
    const current = byLane.get(entry.lane) ?? { calls: 0, cost: 0, tokens: 0, errors: 0 };
    current.calls += 1;
    current.cost += entry.usage?.costTotal ?? 0;
    current.tokens += entry.usage?.totalTokens ?? 0;
    if (entry.error || entry.stopReason === "error") current.errors += 1;
    byLane.set(entry.lane, current);
  }

  const lines = [
    "| Lane | Calls | Cost | Tokens | Errors |",
    "|---|---:|---:|---:|---:|",
  ];

  for (const lane of ["strong", "medium", "cheap"] as Lane[]) {
    const row = byLane.get(lane) ?? { calls: 0, cost: 0, tokens: 0, errors: 0 };
    lines.push(`| ${lane} | ${row.calls} | $${row.cost.toFixed(4)} | ${row.tokens.toLocaleString()} | ${row.errors} |`);
  }

  return lines.join("\n");
}

export default function (pi: ExtensionAPI) {
  let forcedLane: Lane | undefined;
  let bypassOnce = false;
  let activeRoute: Route | undefined;

  pi.on("input", (event) => {
    const match = event.text.match(FORCE_RE);
    if (!match) return { action: "continue" as const };

    const requested = match[1].toLowerCase();
    const rewritten = match[2].trim();

    if (requested === "off") {
      bypassOnce = true;
      forcedLane = undefined;
      return { action: "transform" as const, text: rewritten };
    }

    forcedLane = requested as Lane;
    bypassOnce = false;
    return { action: "transform" as const, text: rewritten };
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (bypassOnce) {
      bypassOnce = false;
      activeRoute = undefined;
      ctx.ui.setStatus("cost-router", "cost: bypassed");
      return;
    }

    const selected = forcedLane
      ? route(forcedLane, "manual override", "forced")
      : classify(event.prompt);
    forcedLane = undefined;
    activeRoute = selected;

    const model = ctx.modelRegistry.find(selected.provider, selected.model);
    if (!model) {
      ctx.ui.notify(`Cost router: missing model ${selected.provider}/${selected.model}`, "warning");
      ctx.ui.setStatus("cost-router", "cost: missing model");
      return;
    }

    const current = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "";
    const next = `${selected.provider}/${selected.model}`;

    if (current !== next) {
      const ok = await pi.setModel(model);
      if (!ok) {
        ctx.ui.notify(`Cost router: no auth for ${next}`, "warning");
        ctx.ui.setStatus("cost-router", "cost: auth missing");
        return;
      }
    }

    pi.setThinkingLevel(selected.thinking);
    ctx.ui.setStatus("cost-router", `cost: ${selected.lane}`);
    ctx.ui.notify(`Cost router: ${selected.lane} → ${next} (${selected.thinking}; ${selected.reason})`, "info");
  });

  pi.on("message_end", (event) => {
    const message = event.message as any;
    if (!activeRoute || message.role !== "assistant") return;

    const usage = message.usage;
    const entry: CostRouterEntry = {
      lane: activeRoute.lane,
      provider: activeRoute.provider,
      model: activeRoute.model,
      thinking: activeRoute.thinking,
      reason: activeRoute.reason,
      confidence: activeRoute.confidence,
      timestamp: Date.now(),
      stopReason: message.stopReason,
      error: message.stopReason === "error",
      usage: usage
        ? {
            input: usage.input,
            output: usage.output,
            cacheRead: usage.cacheRead,
            cacheWrite: usage.cacheWrite,
            totalTokens: usage.totalTokens,
            costTotal: usage.cost?.total,
          }
        : undefined,
    };

    pi.appendEntry("cost-router", entry);
  });

  pi.registerCommand("cost-stats", {
    description: "Summarize cost-router lane usage for the current session",
    handler: async (_args, ctx) => {
      const entries = ctx.sessionManager
        .getEntries()
        .filter((entry: any) => entry.type === "custom" && entry.customType === "cost-router")
        .map((entry: any) => entry.data as CostRouterEntry);

      if (entries.length === 0) {
        ctx.ui.notify("Cost router: no routed assistant turns recorded in this session", "info");
        return;
      }

      ctx.ui.notify(`Cost router stats:\n${summarizeEntries(entries)}`, "info");
    },
  });
}
