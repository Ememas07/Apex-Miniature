### Token & Tool-Call Efficiency Protocol
1. **Surgical File Reads Only:** Never dump entire large files (like `cars.ts`, `tracks.ts`, or bundle outputs) into context. Use `grep_search` / line-range reads (`startLine`–`endLine`) to inspect only the specific functions, interfaces, or data entries relevant to the task.
2. **Parallelize Tool Calls:** Batch independent read-only searches and file reads into a single parallel tool turn instead of sequential one-by-one turns.
3. **Minimal-Diff Edits:** Use targeted search-and-replace / patch edits rather than rewriting entire files. Never echo unchanged code blocks back in assistant messages.
4. **Silent Execution Between Milestones:** Do not narrate routine steps ("Now I will read X", "Next I will edit Y"). Execute tool calls directly and only output a concise final summary after verification passes.
5. **Single-Pass Verification & Terse Output:** Run `npx tsc --noEmit` once after batching all edits—not after every file change. When inspecting command logs, read only error lines/tail output, and keep final summaries under 15 bullet points.
6. **No Scratch Verification Scripts:** Never create temporary test scripts or run test conversions; modify only the target project files and verify with `npx tsc --noEmit`.

### AI Model Naming & Rotation Rule
1. **Only Two Race Slots (`v1` and `v2`) + `starts`:** Never create `v3`, `v4`, `v5`, etc. The codebase and training scripts maintain strictly `v1` (current/previous trained baseline), `v2` (newest model under development/training), and `starts` (dedicated standing/rolling race starts specialist).
2. **Naming Flip on Every New Model Generation:** Whenever a new AI model generation is introduced, the previous `v2` model is promoted to **`v1`** (replacing the old `v1`), and the new model ALWAYS takes the **`v2`** slot.
3. **Minimal Scripts Discipline:** Keep only the single unified trainer (`scripts/trainPPO.py` + internal bridge `scripts/headlessEnv.ts`), the single unified bench/audit runner (`scripts/benchAndAudit.py`), and car conversion (`scripts/objToLowPoly.mjs`).

### Mandatory Changelog Logging Rule
1. **Log Every Change Automatically:** Every meaningful change, feature, or fix made to the project MUST be logged at the top of `CHANGELOG.md` (ordered newest to oldest).
2. **Exact Format:** Use a timestamped heading (`## YYYY-MM-DD HH:MM`) followed by concise bullet points.
3. **Half-Detailed, Human-Readable Level:** Write entries that players and general readers can easily understand—neither overly vague ("Physics overhaul") nor overly technical ("Changed `ThermalModel.ts` coefficient from 0.45 to 0.12"). Explain what changed and how it affects gameplay or usability.