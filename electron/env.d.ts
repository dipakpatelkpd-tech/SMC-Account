/**
 * Build-time settings electron-vite bakes into the main process from `.env`.
 * Only MAIN_VITE_-prefixed variables reach the main bundle; nothing here is
 * ever visible to the renderer. See docs/SUPABASE_SETUP.md.
 */
interface ImportMetaEnv {
  /** e.g. https://abcdefghijklmnop.supabase.co */
  readonly MAIN_VITE_SUPABASE_URL?: string;
  /** The project's PUBLISHABLE key (sb_publishable_... or the legacy anon key). Never the secret key. */
  readonly MAIN_VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
