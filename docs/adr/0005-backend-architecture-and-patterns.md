# 5. Backend architecture: hexagonal core + design-pattern conventions

- **Status:** Accepted
- **Date:** 2026-08-10
- **Deciders:** PlcTelegramSimulator team

## Context and problem statement

[ADR-0002](0002-tech-stack.md) chose a .NET backend, and [ADR-0003](0003-repository-structure.md)
set the Clean Architecture layer split (`Domain` / `Application` / `Infrastructure` / `Web`) — but
the backend's *internal* architecture and the design patterns contributors should reach for were
left open. Without a stated convention,
humans and AI assistants will apply patterns ad hoc (or not at all), and it is easy to swing to
either extreme: an anaemic N-tier design that leaks I/O into the domain, or a gold-plated one that
over-engineers a simulator.

We want an architecture that is **clean and pragmatic but visibly well-structured**: the telegram
and simulation logic must be unit-testable without sockets or HTTP; the TCP transport and the
HTTP/real-time API must evolve independently; and the set of "default" patterns must be small,
domain-appropriate, and consistently applied. Constraints from ADR-0002/0003 still hold: **no
HTTP/sockets in `Domain`/`Application`**, tests are required for behaviour changes, and we make the
smallest change that fully solves the problem.

## Decision drivers

- **Testability** — exercise codecs, framing, and the simulation engine in isolation (no I/O).
- **Boundary isolation** — TCP (`Infrastructure`) and HTTP/real-time (`Web`) evolve without touching domain logic.
- **Pragmatism / YAGNI** — showcase good design without over-engineering; patterns must be *earned*.
- **Consistency** — contributors and AI agents reach for the same, named patterns.
- **Domain fit** — binary framing/codecs, live traffic fan-out, and a simulation lifecycle.

## Considered options

1. **Hexagonal (Ports & Adapters) core + CQRS-lite application layer + a curated pattern set.**
2. **Classic N-tier** (controllers → services → repositories) with patterns applied ad hoc.
3. **Full tactical DDD + CQRS + event sourcing from day one.**

## Decision outcome

**Chosen option:** "Hexagonal core + CQRS-lite + a curated pattern set," because it satisfies the
testability, boundary, and consistency drivers while respecting YAGNI.

- **Hexagonal (Ports & Adapters).** `Domain` + `Application` hold the telegram/simulation model
  and the use cases, and define **ports** (interfaces) for everything they need from the outside.
  `Infrastructure` (TCP sockets, codecs/framing/CRC, persistence) and `Web` (REST + real-time) are
  **adapters** that implement or consume those ports. `Domain`/`Application` have no HTTP/socket
  dependencies. See [ADR-0003](0003-repository-structure.md) for the concrete project layout.
- **CQRS-lite.** The application layer separates **commands** (drive the simulation: start, send,
  inject fault) from **queries** (read templates and traffic), dispatched through a **mediator** so
  controllers stay thin. This is CQRS at the code level — *not* separate databases.
- **Curated "flagship" patterns**, applied where the domain earns them: **Strategy + Builder +
  Factory** for codecs/framing (fixed-length, length-prefixed, delimiter/EOF); **Chain of
  Responsibility + Decorator** for the inbound processing pipeline and cross-cutting concerns;
  **Adapter** for `System.Net.Sockets` behind a port; **State** for the simulation/connection
  lifecycle; **Observer/pub-sub** to fan a telegram event out to the real-time channel, store, and
  metrics; **Repository** for template/scenario persistence; **Object Pool** (`ArrayPool<byte>`)
  on the socket hot path.
- **YAGNI guardrail.** A pattern is introduced only when a second, concrete need for it appears;
  heavier patterns (full event sourcing, Sagas, Actor model, microservices) are deferred until a
  real requirement justifies a follow-up ADR.

### Consequences

- **Positive:** `Domain`/`Application` are unit-testable without I/O; TCP and HTTP/real-time concerns evolve
  independently; a shared, named pattern vocabulary keeps humans and AI aligned; strong,
  demonstrable architecture with minimal gratuitous complexity.
- **Negative:** more indirection (ports, handlers) than plain N-tier; adds a mediator dependency
  and the ongoing discipline to keep `Domain`/`Application` pure and resist pattern-creep.
- **Neutral / follow-ups:** pick the mediator library (e.g. MediatR vs. a lightweight in-house
  dispatcher); real-time transport (SignalR vs. WebSockets) and API contract/versioning remain
  deferred per [ADR-0002](0002-tech-stack.md); persistence/event-sourcing gets its own ADR when a
  replay/audit need is confirmed. Validate the approach with vertical slice #1 ("send one
  telegram"), which exercises the hexagonal boundary, Strategy/Builder codecs, and the
  Observer → real-time fan-out.
