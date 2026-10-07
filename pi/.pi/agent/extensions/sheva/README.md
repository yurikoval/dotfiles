# Sheva reasoning routing

Sheva attaches a typed risk and reasoning policy to each agent step. Prompt budgeting is always active; runtime thinking-level changes are opt-in until a representative run confirms the expected speedup without more failures or review findings.

## Pi capability matrix

| Boundary | Supported | Sheva behavior |
| --- | --- | --- |
| Individual `sendUserMessage` call | No model/thinking options | Set the session thinking level immediately before the step. |
| Current session | `setThinkingLevel` and `setModel` | Route thinking only; do not guess a replacement model or authentication. Restore the prior level after the step settles. |
| New session | Recreated from configured defaults | `/sheva-run` keeps its fresh-session handoff; it transfers only the plan path through `/sheva-build`. |
| Resumed session | Recorded model/thinking changes restore | Existing Pi behavior is unchanged. |
| Observation | Assistant messages expose the dispatched model; contexts expose the selected model | Optional metrics record the selected level, risk, escalation, elapsed time, result, and available model identifier. |

Pi has no per-message reasoning option on `sendUserMessage`. Session-level `setThinkingLevel` is therefore the smallest supported routing boundary. Sheva does not add virtual-model routing or switch physical models.

## Policy

| Step | Default |
| --- | --- |
| PR mechanics and focused verification | `fast` / routine |
| Planning, implementation, review comments, clear merge repair | `standard` / ordinary |
| Decision follow-up and detected auth, tenancy, billing, schema, migration, destructive, concurrency, production, or unclear-failure work | `high` / high |

Unknown risk defaults high. Keyword hints may only escalate; they never downgrade explicit risk. An escalated step remains high until it settles.

## Settings

- `SHEVA_REASONING_ROUTING=1`: apply `low`, `medium`, or `high` Pi thinking levels for `fast`, `standard`, or `high` steps.
- `SHEVA_REASONING_LEVEL=high`: force every step high, enabling routing even when the general flag is off.
- `SHEVA_DEBUG_METRICS=1`: show compact per-step and pipeline summaries. Metrics never fail the workflow.

Without routing support or with routing disabled, Sheva sends the same prompt and waits for idle exactly as before.

## Benchmark next

Run one representative `/sheva-run` task comparable to the `pw-278ff579` baseline. Compare active time, assistant turns, tool calls, context growth/compactions, escalations, test failures, reviewer findings, and rework. Keep routing opt-in unless the run improves runtime by about 20% without a quality regression; use debug telemetry only if the manual comparison is insufficient.
