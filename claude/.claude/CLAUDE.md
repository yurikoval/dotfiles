# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Principles

1. **Work doggedly.** Be autonomous as long as possible. If the user's overall goal is clear and progress can be made, keep working. Justify any stop.
2. **Work smart.** When debugging, step back and think deeply. Add logging to check assumptions before guessing.
3. **Check your work.** After writing code, find a way to run it. After starting a process, check logs within 30 seconds.
4. **Be cautious with terminal commands.** Before every command, consider whether it exits on its own or runs indefinitely. Launch long-running processes with `nohup` or in a background task.

## Commands

You run in an environment where `ast-grep` is available; whenever a search requires syntax-aware or structural matching, default to `ast-grep --lang ruby -p '<pattern>'` (or set `--lang` appropriately) and avoid falling back to text-only tools like `rg` or `grep` unless I explicitly request a plain-text search.

### Codebase memory index

When exploring or searching code, use the `codebase-memory-mcp` graph tools alongside `rg`/`ast-grep`/`Grep`:

- Reach for `search_graph`, `trace_path`, `get_code_snippet`, `query_graph`, `get_architecture`, and `search_code` to find symbols, call chains, and structure — they understand code semantics that text search misses.
- Keep using `rg`/`ast-grep`/`Grep`/`Read` for text, configs, non-code files, and always `Read` a file before editing it.
- If the current repository is not indexed yet (check with `index_status`; `list_projects` shows what's available), run `index_repository` FIRST, then proceed.

---

## Self-Improvement Protocol

**This file is a living document. Claude must actively maintain it.**

After ANY of the following events, propose an update to this file (or make it directly if the user has authorized autonomous updates):

1. **After a user correction:** Extract the general pattern and add it to the relevant section. Don't just fix the mistake — prevent the class of mistake.
2. **After discovering a project convention:** If you learn something about how this codebase works that required reading multiple files, document it in Architecture.
3. **After a new command is established:** Add it to Commands.
4. **After a dependency or tool is added:** Update Stack.
5. **After a painful debugging session:** Add a "Gotcha" to the relevant section so future sessions don't repeat it.

**Rules for self-improvement:**
- Keep this file under 200 lines. If it grows past that, ruthlessly prune anything Claude already does correctly without being told.
- Never add generic advice ("write clean code", "handle errors"). Only add project-specific, hard-won knowledge.
- Use progressive disclosure: prefer "see `docs/X.md` for details" over inlining lengthy explanations.
- When in doubt, ask the user before adding a section.
