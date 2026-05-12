/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Full API origin (e.g. http://127.0.0.1:8787 or https://api.example.com). Overrides dev default. */
  readonly VITE_API_BASE_URL?: string;
  /** API port when using dev default http://127.0.0.1:${port} (default 8787). */
  readonly VITE_API_PORT?: string;
  /** Where Vite forwards `/api` in dev/preview if you rely on the proxy (default http://127.0.0.1:8787). */
  readonly VITE_API_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
