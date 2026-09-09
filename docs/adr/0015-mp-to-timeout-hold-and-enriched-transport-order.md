# 0015. MP/TO timeout policy (hold) and enriched transport-order contract

- **Status:** Accepted
- **Date:** 2026-08-17
- **Deciders:** Simulator maintainers

## Context and problem statement

[ADR-0012](0012-mp-to-orchestration-and-simulation-authority.md) makes the backend the authority for
message-point (MP) → transport-order (TO) routing, correlating each report to its TO by `TelegramId`
through a Pending-Request Registry. It deliberately deferred three follow-ups to "their own future
ADRs": the **timeout & exception-routing** policy (its state diagram lists `default lane / hold /
retry` as open options), the **concrete command/event DTOs**, and the exact **wire mapping**.

Implementing the canvas exposed why those gaps must now be closed:

- A bin that reaches an MP was released after a fixed delay **even when no TO had arrived** — because
  the registry's timeout sweep *removed* the pending request, and the frontend released a bin on a
  fault as well as on a TO. A bin must instead **wait for a real routing decision** (ADR-0012's whole
  premise); with a transport-order-only outer client (no explicit ACK) the short ACK deadline fires
  first, and removing the request then **strands a later, genuine TO** as "unmatched".
- The TO a bin receives must name the **next message point** so the bin can route toward it, but the
  transport-order contract carried only a generic `Destination` string — no dedicated next-MP field.
- The correlation id rendered on the wire as a bare integer (`1`, `2`, …), which reads as an
  ever-growing global counter rather than a stable, zero-padded telegram id (`000001`, `000002`, …).

## Decision drivers

- **Faithfulness to ADR-0012** — the backend owns the release decision; a timeout must not fabricate
  routing.
- **Correctness of correlation** — a late/out-of-order TO must still resolve its bin (no stranding).
- **Additive, low-churn contract** — extend, don't reshape, the existing DTOs and codec.
- **Observability** — the id shown to users should look like a telegram id, stable per report.
- **Reversibility** — keep the policy localized so it can evolve (e.g. to retry/default-lane) later.

## Considered options

1. **Release on timeout (default-lane / auto-advance)** — on a missed deadline, move the bin on
   anyway. Simple, but contradicts ADR-0012 (routing invented in the absence of a decision) and was
   the observed bug.
2. **Hold on timeout, fault-but-retain (chosen)** — a timeout raises a *non-releasing* fault and
   **retains** the pending request so a later real TO still resolves it; the bin holds until a
   genuine TO arrives. Overload nothing: add an explicit `DestinationMp` to the TO contract and
   zero-pad the `TelegramId` on the wire.
3. **Configurable retry with backoff** — resend the MP report on timeout. More moving parts than the
   simulator needs today; can layer on top of "hold" later.

## Decision outcome

**Chosen option:** "Hold on timeout, fault-but-retain", because it satisfies faithfulness (no
release without a TO) and correctness (retaining the request keeps a late TO matchable) with the
smallest, most reversible change.

Concretely:

- **Exception routing = hold.** The Pending-Request Registry's timeout sweep **reports** an expiry
  without **removing** the request, and marks it faulted so it faults **at most once**. `Resolve`
  still matches by `TelegramId` regardless of phase, so a genuine TO arriving after the fault
  releases the bin normally. This selects the `hold` branch of ADR-0012's `default lane / hold /
  retry` and refines its `Exception --> Routing` transition to fire **only** on a received TO.
- **Enriched TO contract.** `TransportOrder` and its `transportOrder` DTO gain an optional
  `DestinationMp` (the next MP id), threaded through the inbound codec (`TO|{id}|{dest}|{destMp}`,
  fourth part optional), the engine input, the orchestrator, and the SignalR contract. `Destination`
  is unchanged.
- **Wire id formatting.** The interim ASCII codec zero-pads `TelegramId` to a configurable width
  (default **6**): `MP|000001|{tu}|{mp}|N`. This is presentation only — the id stays an `int`
  end-to-end and `int.TryParse` round-trips the padded value.
- **Frontend behaviour.** The canvas releases a bin **only** on a `transportOrder` event; a `fault`
  becomes a non-releasing "held" state. With no backend connected, a bin holds indefinitely; an
  opt-in local **demo** resolver (default on when no backend is configured) replays the round-trip so
  the cycle is observable without hardware.

This ADR **refines**, and does not supersede, ADR-0012; that decision stays `Accepted`.

### Consequences

- **Positive:** bins now honour backend authority (no timeout-driven movement); a late/out-of-order
  TO still resolves its bin; the next-MP destination is explicit; wire ids are stable and readable;
  all changes are additive to the ADR-0012 contract.
- **Negative:** a request with no TO is retained until resolved (a small unbounded set of "held"
  requests until a run resets); "hold forever with no backend" can look inert to a user, mitigated by
  the demo resolver and a distinct held/timed-out visual.
- **Neutral / follow-ups:** a **per-run `TelegramId` reset** (start each run at `000001` backend-side)
  and **true branch routing** by `DestinationMp` on non-linear layouts remain open and would each
  warrant their own ADR; ADR-0012's other deferred items (back-pressure, reconnect resync, two-socket
  routing) are unchanged.
