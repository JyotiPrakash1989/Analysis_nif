/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MSTOCK_API_KEY: string;
  readonly VITE_MSTOCK_JWT_TOKEN: string;
  readonly VITE_MSTOCK_APP_NAME: string;
  readonly VITE_MSTOCK_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
