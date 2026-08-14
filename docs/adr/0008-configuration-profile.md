# 8. Configuration profile: a single versioned JSON import/export file

- **Status:** Accepted
- **Date:** 2026-08-11
- **Deciders:** PlcTelegramSimulator team

## Context and problem statement

The Connection & Session page already exposes several settings (bind address, send/receive ports,
processing delay, auto-reconnect), and future screens — telegram templates, simulation scenarios —
will add many more. Users need to **save a full set of settings and reload it later**: to reuse a
setup after a reload, share it with a teammate, keep it under version control, or switch between
environments without re-typing every field.

We therefore need a durable, portable representation of "all the configuration for this app," plus
a way to **export** it and **import** it back into the UI to repopulate the fields. Constraints:
the project has **no persistence layer yet** (deferred in [ADR-0005](0005-backend-architecture-and-patterns.md));
the set of configurable features will **grow over time**, so the format must extend without
breaking older files or spawning a new file per feature; and importing an untrusted/edited file
must **never corrupt state** — it has to be validated before it is applied.

## Decision drivers

- **Portability** — one file the user can download, share, commit to git, and move between machines.
- **Extensibility** — new features contribute their settings without breaking existing files.
- **Human-readable & diffable** — greppable, reviewable, easy to hand-edit.
- **Safe import** — validate structure and values before populating fields; tolerate version drift.
- **Low complexity now** — no database/persistence infrastructure required yet (YAGNI, ADR-0005).
- **One shared shape** — a single documented format both the frontend and a future backend can rely on.

## Considered options

1. **A single, versioned JSON "configuration profile"** with a top-level schema version and one
   section per feature area (`connection` today; `telegramTemplates`, `simulation` later),
   exported/imported from the UI and validated on import.
2. **One JSON file per feature** (`connection.json`, `templates.json`, …), managed as a set.
3. **Server-side persisted configuration** — the backend stores settings (file/DB) behind
   import/export endpoints.
4. **Browser `localStorage` only** — persistence without a portable, shareable file.

## Decision outcome

**Chosen option:** "A single, versioned JSON configuration profile," because it satisfies
portability and extensibility while adding no persistence infrastructure — one file grows with the
app instead of multiplying files (option 2), needs no database or server state (option 3), and
stays shareable/diffable unlike `localStorage` (option 4).

**Shape.** One JSON document (a *configuration profile*) with a stable envelope and one object per
feature area:

```jsonc
{
  "app": "PlcTelegramSimulator",
  "schemaVersion": 1,
  "exportedAt": "2026-08-11T15:00:00.000Z",
  "connection": {
    "bindAddress": "0.0.0.0",
    "sendPort": 3700,
    "receivePort": 3701,
    "processingDelayMs": 50,
    "autoAcceptReconnections": true
  }
  // future features add their own top-level section, e.g. "telegramTemplates": [...], "simulation": {...}
}
```

**Conventions.**

- **Versioning** — an integer `schemaVersion`. *Additive* changes (a new section, a new optional
  field) do **not** bump it; a **breaking** change does, and ships a one-way upgrade/migration path.
  On import, an **unknown section or field is ignored** (forward-compatible) and a **missing
  section falls back to that feature's defaults** (backward-compatible).
- **Extensibility** — each feature **owns exactly one top-level key** with its own typed sub-shape,
  its own serializer, and its own validator; a feature never reads or writes another's section.
  Adding a feature means adding a key plus its validator — **never a new file**.
- **Import** — parse → validate the envelope (`app` matches, `schemaVersion` recognised) →
  validate each section with its existing validator (e.g. the connection section reuses the current
  `validateConfig`) → **populate the form fields**. Invalid sections are reported and skipped rather
  than applied partially. Import **fills fields only**; it does not auto-start the listener — the
  user reviews, then acts.
- **Export** — serialize the current in-UI configuration for every section that has state into the
  envelope (stamping `schemaVersion` and `exportedAt`) and let the user download it (e.g.
  `plc-simulator-config.json`).
- **No secrets** — the profile must never contain credentials, tokens, or connection strings
  (there are none today; keep it that way).

**Ownership (initial).** Export/import is a **frontend** concern — a browser download/upload of the
JSON blob — so the backend stays **stateless** for now, consistent with ADR-0005 deferring
persistence. The envelope is defined here as a **shared contract** so a later backend endpoint
(load a profile on startup, or `GET`/`PUT` the active profile) can adopt the same format **without
a new format decision**. The profile's TypeScript types/section registry live under
`src/frontend/src/config/`; backend DTOs mirror them **only if** the backend later consumes the file.

### Consequences

- **Positive:** one portable, diffable, shareable file; the format **grows additively** as features
  land (no churn, no file sprawl); imports are safe because they reuse each feature's existing
  validators; **no persistence infrastructure** is needed now; a single documented shape is ready
  for a future backend to share.
- **Negative:** a growing single file demands **ongoing versioning/compatibility discipline**; the
  shared envelope is a **coupling point** every feature must respect; frontend-only export/import
  means the **running server does not persist config** — a reload without a saved file loses
  unsaved edits — until a future ADR adds server-side persistence; validation and any migration
  logic must be kept **in lockstep** with the schema.
- **Neutral / follow-ups:** a future ADR may add **server-side persistence / an import-export API**
  and a formal **JSON Schema** file (for editor validation and a CI check); define a **migration
  strategy** when `schemaVersion` first increments; the **connection** section is the first
  realization — implement export/import on the Connection page as the initial slice
  ([ADR-0007](0007-connection-api-and-transport-model.md) defines its field shape). See
  [ADR-0003](0003-repository-structure.md) for where the profile code lives.
