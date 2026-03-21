## [ERR-20260321-001] beads create output includes human prefix

**Logged**: 2026-03-21T19:42:00Z
**Area**: tooling/beads

Attempted to capture `br create` output directly into shell variables for dependency wiring. The CLI returns strings like `✓ Created bd-xyz: Title`, not a bare issue id, so follow-up `br dep add` failed with `Issue not found`.

**Working pattern:** resolve created issue ids via `br list --json | jq` (or parse the id out explicitly) before using them in automation.

---
## [ERR-20260321-002] ACP runtime unavailable for Tripletex coding spawn

**Logged**: 2026-03-21T19:45:00Z
**Area**: openclaw/acp

`sessions_spawn` with `runtime="acp"` and `agentId="codex"` failed with: `ACP runtime backend is currently unavailable. Try again in a moment.`

**Fallback:** use the real `ah` CLI / Agent Harness path when ACP is temporarily unavailable and the user explicitly requested Codex in Agent Harness.

---
