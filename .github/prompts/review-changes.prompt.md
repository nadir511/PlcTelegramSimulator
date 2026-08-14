---
name: review-changes
description: Review the current change set for correctness, security, and plan alignment.
argument-hint: "optional scope or PR number"
agent: reviewer
---

# Goal

Perform a high-signal review of the current change set (or the scope/PR in the argument).

## Steps

1. Read the diff, the plan (if any), and relevant ADRs; understand the intent first.
2. Trace the critical paths:
   - **Backend** — telegram framing/encoding, transport lifecycle, `CancellationToken` on I/O,
     API contract, error handling, layer boundaries (`Web`/`Infrastructure` → `Application` → `Domain`).
   - **Frontend** — data flow, live-stream subscribe/cleanup, typed API usage, loading/error states.
3. Check security: no secrets committed or logged, external input validated, no unsafe deserialization.
4. Confirm tests exist for the behavior changed and actually exercise it.
5. Report findings by severity (**blocking / warning / info**) with file:line evidence and your
   confidence. Skip nits already handled by `dotnet format` / ESLint. Missing tests for a behavior
   change = blocking.
