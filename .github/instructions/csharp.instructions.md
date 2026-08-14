---
name: csharp-backend
description: Rules for the .NET / ASP.NET Core backend — Domain, Application, Infrastructure, and Web layers.
applyTo: "src/**/*.cs,tests/**/*.cs"
---

# C# / .NET Backend Rules

Applies to all backend C#. See [AGENTS.md](../../AGENTS.md) and
[ADR-0003](../../docs/adr/0003-repository-structure.md) for the layout.

## Layering

- Follow Clean Architecture: dependencies point **inward** — `Web` and `Infrastructure` →
  `Application` → `Domain`. `Domain` (telegrams, simulation model) and `Application` (use cases,
  ports) must not reference ASP.NET or `System.Net.Sockets`. Put HTTP/real-time in `Web`; sockets,
  codecs/framing/CRC, and persistence in `Infrastructure`.
- Depend on abstractions (ports) across layers; wire concretes via DI in `Web` startup.

## Async & I/O

- All I/O is `async`/`await`; every async method that does I/O accepts a `CancellationToken` and
  honors it. Never block on I/O (`.Result`, `.Wait()`, `.GetAwaiter().GetResult()`).
- Prefer `System.IO.Pipelines` / `Span<byte>` for telegram framing and parsing; avoid needless
  allocations and copies on the hot path.

## Style & correctness

- Nullable reference types **enabled**; treat warnings as errors where practical. Don't silence
  nullability with `!` to hide real issues.
- Validate all external input (HTTP payloads and inbound telegram bytes) at the boundary; fail
  with clear, typed errors. Never trust length/offset fields without bounds checks.
- Use structured logging (`ILogger`); never log secrets, credentials, or full raw payloads that
  may contain sensitive data.
- Run `dotnet format` before finishing.

## Tests

- Add/adjust xUnit tests under `tests/` (per layer, e.g. `Domain.UnitTests`, `Application.UnitTests`,
  `Infrastructure.IntegrationTests`) for every behavior change. Codec/framing logic must have
  round-trip and malformed-input tests. Keep `Domain`/`Application` tests free of sockets/HTTP.
