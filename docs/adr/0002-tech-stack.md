# 2. Tech stack: .NET backend + React frontend

- **Status:** Accepted
- **Date:** 2026-08-10
- **Deciders:** PlcTelegramSimulator team

## Context and problem statement

PlcTelegramSimulator needs (a) a backend that can open TCP/IP sockets, encode/decode binary PLC
telegrams, run simulation scenarios, and stream live traffic; and (b) an interactive frontend to
define telegram templates, drive simulations, and inspect traffic in real time. We must pick the
primary language/runtime for each tier.

## Decision drivers

- Strong, first-class TCP/IP and binary-protocol support on the backend.
- Team familiarity and the surrounding eController/eHub ecosystem (predominantly C#/.NET).
- A productive, component-based UI with a large ecosystem for dashboards and live data.

## Considered options

1. **.NET (ASP.NET Core) backend + React (Vite + TypeScript) frontend.**
2. .NET backend + Blazor (single-stack C#) frontend.
3. Node/TypeScript backend + React frontend (single-language full stack).

## Decision outcome

**Chosen option:** ".NET backend + React frontend."

- **Backend:** .NET (ASP.NET Core Web API) targeting the installed SDK (10.0.x, LTS fallback
  9.0.x). REST for control-plane operations plus a real-time channel (SignalR or WebSockets) for
  live telegram streams. `System.Net.Sockets` / pipelines handle the PLC TCP/IP transport.
- **Frontend:** React with TypeScript, built with Vite. Talks to the backend over REST + the
  real-time channel.

### Consequences

- **Positive:** Plays to the team's C#/.NET strength and the broader eController/eHub ecosystem;
  React gives a rich, well-supported UI for live dashboards.
- **Positive:** Both stacks are strongly typed and well supported by AI assistants.
- **Negative:** Two languages/toolchains (C# + TypeScript) to build, lint, and test.
- **Neutral / follow-ups:** Exact real-time transport (SignalR vs. raw WebSockets) and API
  contract/versioning are deferred to their own ADRs when the backend takes shape.

