# 6. Real-time transport: SignalR

- **Status:** Accepted
- **Date:** 2026-08-11
- **Deciders:** PlcTelegramSimulator team

## Context and problem statement

[ADR-0002](0002-tech-stack.md) chose a .NET backend plus a React frontend and pushed live
telegram traffic over "a real-time channel (SignalR **or** WebSockets)", explicitly deferring the
exact choice. That decision is now due: the Connection & Session page needs the server to push two
kinds of events to the browser — **listener status** changes (stopped → listening → connected …)
and a continuous **traffic** stream (inbound/outbound telegrams, plus error/system rows) — while
control actions (start/stop/send) stay ordinary request/response REST calls.

The frontend already defines the consumer side of this contract (`ConnectionClient.subscribe`
delivering `status` and `traffic` events). We need a browser-to-.NET push transport that is
reliable across reconnects, cheap to implement on both ends, and does not force us to hand-roll
connection management.

## Decision drivers

- **Server→client push** for two event types over one long-lived connection.
- **Resilience** — automatic reconnection and transport fallback without bespoke code.
- **Low boilerplate** on both the ASP.NET Core server and the React client.
- **First-class .NET + browser support**, so we don't invent framing or heartbeats ourselves.
- **Room to scale** later (multiple browser clients; a backplane if we ever run more than one host).

## Considered options

1. **SignalR** — ASP.NET Core hub with the `@microsoft/signalr` browser client.
2. **Raw WebSockets** — hand-managed `System.Net.WebSockets` server endpoint + browser `WebSocket`.
3. **Server-Sent Events (SSE)** — one-way HTTP event stream from server to browser.

## Decision outcome

**Chosen option:** "SignalR", because it satisfies the resilience and low-boilerplate drivers
better than the alternatives while remaining first-class on both tiers.

- A single hub at **`/hubs/connection`** invokes two client methods — **`status`** (a status
  snapshot) and **`traffic`** (one telegram/log entry) — matching the frontend's existing
  `connection.on('status' | 'traffic')` handlers. The hub also pushes the current snapshot to a
  client in `OnConnectedAsync`, so a late subscriber is immediately consistent.
- SignalR gives us **automatic reconnection** and **transport fallback** (WebSockets → SSE →
  long-polling) out of the box, so a dropped socket or a proxy that blocks WebSockets degrades
  gracefully instead of silently stalling the live view.
- Control-plane operations stay REST (see [ADR-0007](0007-connection-api-and-transport-model.md));
  SignalR carries only the server→client push. The hub is a thin **adapter** over the application
  layer's broadcaster port, keeping `Domain`/`Application` free of ASP.NET (per
  [ADR-0003](0003-repository-structure.md)/[ADR-0005](0005-backend-architecture-and-patterns.md)).

Raw WebSockets were rejected because they push reconnection, fallback, and message framing back
onto us for no functional gain here. SSE was rejected because it is HTTP/1-oriented, one-way only,
and more awkward to evolve if we later need client→server hub calls.

### Consequences

- **Positive:** Reconnection, transport negotiation, and fallback are handled by the framework;
  the server and client code are small; a Redis backplane can be added later for scale-out without
  changing the hub contract.
- **Negative:** Adds the `@microsoft/signalr` client dependency (bundle size) and a protocol
  abstraction over the raw socket; browsers connecting cross-origin require a CORS policy with
  `AllowCredentials` and explicit origins (cannot use `AllowAnyOrigin`), which the dev setup must
  configure for the Vite origin.
- **Neutral / follow-ups:** the exact message payloads (DTO shapes, enum tokens, epoch-ms
  timestamps) are specified in [ADR-0007](0007-connection-api-and-transport-model.md); scale-out
  backplane, authentication, and message back-pressure policy are deferred until a concrete need
  appears.
