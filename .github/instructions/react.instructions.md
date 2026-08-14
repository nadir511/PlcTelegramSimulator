---
name: react-frontend
description: Rules for the React + Vite + TypeScript frontend.
applyTo: "src/frontend/**/*.ts,src/frontend/**/*.tsx"
---

# React / TypeScript Frontend Rules

Applies to all frontend TS/TSX. See [AGENTS.md](../../AGENTS.md) for commands and structure.

## TypeScript

- `strict` mode on. No `any`; model API request/response types explicitly. Avoid non-null (`!`)
  assertions used to silence real type errors.
- Share types with the backend contract by mirroring them in a typed API client module — don't
  scatter inline shapes.

## Components & state

- Function components + hooks only. Keep components small and focused; extract logic into custom
  hooks. Separate data-fetching/state from presentation.
- Always handle **loading, error, and empty** states for anything async.
- For live telegram streams (real-time channel), subscribe/unsubscribe in `useEffect` cleanup and
  avoid re-render storms (memoize, batch, or virtualize high-frequency lists).

## Conventions

- No hardcoded backend URLs or secrets — use `import.meta.env`.
- Mind accessibility: labels, roles, and keyboard support for interactive controls.
- Add a dependency only when it clearly earns its weight; prefer the platform and existing libs.
- Run `npm run lint` and `npm run build` (type-check) before finishing.

## Tests

- Add/adjust Vitest + React Testing Library tests **co-located** next to the code they cover
  (`*.test.ts` / `*.test.tsx`) for behavior changes. Test behavior and accessible roles, not
  implementation details.
