---
description: Check whether configured Pi subagents/models are usable before delegating
---
Run a token-cheap delegation preflight for this session.

Steps:
1. Print current route:
   ```bash
   printf 'PI_PROVIDER=%s\nPI_MODEL=%s\nPI_REASONING_LEVEL=%s\n' "$PI_PROVIDER" "$PI_MODEL" "$PI_REASONING_LEVEL"
   ```
2. Verify configured model routes once with `pi --list-models | head -80` when available.
3. If delegation will be used, run exactly one tiny read-only subagent task with `cheap-reader` or `rails-reader`.
4. Report which agents are usable and which should be avoided.
5. If an agent route is broken, do not retry it in this task; propose the smallest config fix instead.

Keep output short. Do not inspect unrelated files.
