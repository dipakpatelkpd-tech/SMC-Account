/**
 * Which cloud this run of the app talks to.
 *
 *   packaged, configured     Supabase. The only option a school ever sees.
 *   packaged, not configured refuse to start - a build without its cloud
 *                            settings cannot log anybody in, and saying so
 *                            plainly beats a login screen that always fails.
 *   development, configured  Supabase, so the real project can be tried.
 *   development, otherwise   the fake cloud in a folder (src/server/cloud/fake.ts),
 *                            so the app runs before any Supabase project exists.
 *                            SMC_CLOUD=fake forces it even when configured.
 *
 * The URL and publishable key are baked in at build time from `.env`
 * (MAIN_VITE_SUPABASE_URL, MAIN_VITE_SUPABASE_PUBLISHABLE_KEY) - see
 * docs/SUPABASE_SETUP.md. The publishable key is designed to be public; the
 * project's secret key must never be put here.
 */
export type CloudConfig =
  | { kind: "supabase"; url: string; publishableKey: string }
  | { kind: "fake"; reason: string }
  | { kind: "missing"; reason: string };

export function resolveCloudConfig(input: {
  isPackaged: boolean;
  url: string | undefined;
  publishableKey: string | undefined;
  forceFake: boolean;
}): CloudConfig {
  const url = input.url?.trim() ?? "";
  const publishableKey = input.publishableKey?.trim() ?? "";

  if (!input.isPackaged && input.forceFake) {
    return { kind: "fake", reason: "SMC_CLOUD=fake" };
  }

  if (url && publishableKey) {
    if (!/^https:\/\/[^/\s]+$/.test(url.replace(/\/$/, ""))) {
      return { kind: "missing", reason: `the Supabase URL "${url}" is not an https:// address` };
    }
    if (/^sb_secret_|service_role/i.test(publishableKey) || looksLikeServiceRoleJwt(publishableKey)) {
      // The secret key bypasses every security rule in the project. Shipping
      // it inside an app would hand it to anyone who opens the installer.
      return {
        kind: "missing",
        reason: "the configured key is the project's SECRET key; use the publishable key",
      };
    }
    return { kind: "supabase", url: url.replace(/\/$/, ""), publishableKey };
  }

  if (!input.isPackaged) {
    return { kind: "fake", reason: "no Supabase project configured in .env" };
  }
  return { kind: "missing", reason: "this build was made without its Supabase settings" };
}

/** Old-style keys are JWTs; the secret one says role "service_role". */
function looksLikeServiceRoleJwt(key: string): boolean {
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as {
      role?: string;
    };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}
