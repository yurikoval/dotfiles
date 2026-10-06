import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type PeonHookEvent = {
  hook_event_name: string;
  source: "pi";
  session_id: string;
  cwd: string;
  notification_type?: string;
  message?: string;
  body?: string;
  tool_name?: string;
  error?: string;
};

const peonBinary = process.env.PEON_BIN || "/opt/homebrew/bin/peon";
const fallbackSessionId = `omp-${randomUUID()}`;

let activeSessionId = fallbackSessionId;
let ranAgent = false;
let lastUiPromptAt = 0;
let lastStopAt = 0;

function sessionId(ctx: ExtensionContext): string {
  const fromManager = ctx.sessionManager.getSessionId?.();
  if (fromManager) activeSessionId = `omp-${fromManager}`;
  return activeSessionId;
}

function peonExists(): boolean {
  return existsSync(peonBinary) || peonBinary === "peon";
}

function sendPeon(event: PeonHookEvent): void {
  if (!peonExists()) return;

  const child = spawn(peonBinary, [], {
    cwd: event.cwd || process.cwd(),
    env: {
      ...process.env,
      CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"),
      PEON_ALLOW_HEADLESS: "1",
    },
    stdio: ["pipe", "ignore", "ignore"],
    detached: true,
  });

  child.on("error", () => {});
  child.stdin?.on("error", () => {});
  child.stdin?.end(JSON.stringify(event));
  child.unref();
}

function eventBase(ctx: ExtensionContext): Pick<PeonHookEvent, "source" | "session_id" | "cwd"> {
  return {
    source: "pi",
    session_id: sessionId(ctx),
    cwd: ctx.cwd,
  };
}

export default function peonAttention(pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    if (!peonExists()) {
      ctx.ui.notify(`Peon attention: ${peonBinary} not found`, "warning");
    }
  });

  pi.on("before_agent_start", (_event, ctx) => {
    ranAgent = true;
    sendPeon({
      ...eventBase(ctx),
      hook_event_name: "UserPromptSubmit",
    });
  });

  pi.on("ui_prompt_start", (event, ctx) => {
    const now = Date.now();
    if (now - lastUiPromptAt < 2_000) return;
    lastUiPromptAt = now;

    const title = event.title ? `${event.title}` : "Pi is waiting for you";
    sendPeon({
      ...eventBase(ctx),
      hook_event_name: "Notification",
      notification_type: "elicitation_dialog",
      message: title,
      body: title,
    });
  });

  pi.on("session_before_compact", (_event, ctx) => {
    sendPeon({
      ...eventBase(ctx),
      hook_event_name: "PreCompact",
      message: "Pi is compacting context",
      body: "Pi is compacting context",
    });
  });

  pi.on("tool_execution_end", (event, ctx) => {
    if (!event.isError) return;
    const toolName = event.toolName || "unknown";
    sendPeon({
      ...eventBase(ctx),
      hook_event_name: "PostToolUseFailure",
      tool_name: toolName === "bash" ? "Bash" : toolName,
      error: `${toolName} failed`,
    });
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (!ranAgent) return;

    const now = Date.now();
    if (now - lastStopAt < 5_000) return;
    lastStopAt = now;
    ranAgent = false;

    sendPeon({
      ...eventBase(ctx),
      hook_event_name: "Stop",
      message: "Pi is ready for input",
      body: "Pi is ready for input",
    });
  });

  pi.on("session_shutdown", (_event, ctx) => {
    sendPeon({
      ...eventBase(ctx),
      hook_event_name: "SessionEnd",
    });
  });

  pi.registerCommand("peon-test", {
    description: "Send a Peon attention test notification for this Pi session",
    handler: async (_args, ctx) => {
      sendPeon({
        ...eventBase(ctx),
        hook_event_name: "Notification",
        notification_type: "elicitation_dialog",
        message: "Pi needs your attention",
        body: "Test notification from Pi",
      });
      ctx.ui.notify("Peon attention test sent", "info");
    },
  });
}
