/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the .NET backend, e.g. `http://localhost:5088`. When set, the UI
   * talks to the live REST + SignalR API; when empty/unset it falls back to the
   * in-browser mock client.
   */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
