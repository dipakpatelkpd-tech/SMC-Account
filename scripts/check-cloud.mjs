/**
 * Is the Supabase project in .env set up the way the app needs?
 *
 *   npm run check:cloud
 *
 * Run it after following docs/SUPABASE_SETUP.md, before building the installer.
 * It creates nothing and signs nobody up - it only asks questions a
 * not-signed-in visitor may ask, and checks the answers:
 *
 *   1. the URL and the publishable key are right;
 *   2. email sign-up is on and addresses must be confirmed with a code;
 *   3. the migration has run: the tables and create_profile() exist;
 *   4. someone who is not signed in is refused all of them.
 *
 * The storage bucket cannot be seen without signing in; the guide has you
 * check it in the dashboard.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

function readEnv() {
  const values = { ...process.env };
  const file = path.join(ROOT, ".env");
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match && values[match[1]] === undefined) values[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  return values;
}

const env = readEnv();
const url = (env.MAIN_VITE_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const key = (env.MAIN_VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();

let failures = 0;
const pass = (message) => console.log(`  ok    ${message}`);
const fail = (message, hint) => {
  failures += 1;
  console.log(`  FAIL  ${message}${hint ? `\n        → ${hint}` : ""}`);
};

console.log(`\nChecking the Supabase project for SMC Accounts\n`);

if (!url || !key) {
  fail(
    "MAIN_VITE_SUPABASE_URL and MAIN_VITE_SUPABASE_PUBLISHABLE_KEY are not both set in .env",
    "docs/SUPABASE_SETUP.md, step 6",
  );
  process.exit(1);
}
if (!/^https:\/\/[^/\s]+$/.test(url)) fail(`the URL "${url}" is not an https:// address`, "copy the Project URL exactly");
if (/^sb_secret_/.test(key) || /service_role/.test(Buffer.from(key.split(".")[1] ?? "", "base64url").toString())) {
  fail("the key in .env is the SECRET key", "use the PUBLISHABLE key; the secret key must never go into the app");
  process.exit(1);
}

async function call(pathname, init = {}) {
  try {
    const response = await fetch(`${url}${pathname}`, {
      ...init,
      headers: { apikey: key, "content-type": "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(20_000),
    });
    let body = null;
    try {
      body = await response.json();
    } catch {
      // Not JSON; the status is enough.
    }
    return { status: response.status, body };
  } catch (error) {
    return { status: 0, body: { message: error instanceof Error ? error.message : String(error) } };
  }
}

// 1 and 2: the auth settings are public.
const settings = await call("/auth/v1/settings");
if (settings.status === 0) {
  fail(`cannot reach ${url}: ${settings.body?.message}`, "check the URL and the internet connection");
  process.exit(1);
}
if (settings.status === 401 || settings.status === 403) {
  fail("the project refused the key", "copy the publishable key again (Project Settings → API Keys)");
  process.exit(1);
}
if (settings.status !== 200) {
  fail(`unexpected answer ${settings.status} from the auth service`, JSON.stringify(settings.body));
} else {
  pass("the URL and the publishable key are right");
  const s = settings.body ?? {};
  if (s.external?.email === true) pass("email sign-in is on");
  else fail("email sign-in is off", "Authentication → Sign In / Providers → Email: enable it");
  if (s.disable_signup === true) fail("new sign-ups are disabled", "Authentication → Sign In / Providers: allow new users to sign up");
  else pass("new accounts can sign up");
  if (s.mailer_autoconfirm === false) pass("email addresses must be confirmed");
  else fail("email confirmation is OFF - anyone could sign up with someone else's address", "Authentication → Sign In / Providers → Email: turn on \"Confirm email\"");
}

// 3 and 4: the tables and the function exist, and refuse a visitor.
const PERMISSION_DENIED = "42501";
for (const table of ["profiles", "profile_keys", "backups"]) {
  const answer = await call(`/rest/v1/${table}?select=*&limit=1`);
  const code = answer.body?.code;
  if (code === PERMISSION_DENIED || answer.status === 401 || answer.status === 403) {
    pass(`table ${table} exists and refuses a visitor who is not signed in`);
  } else if (code === "PGRST205" || code === "42P01" || answer.status === 404) {
    fail(`table ${table} does not exist`, "run supabase/migrations/0001_smc_cloud.sql in the SQL Editor (step 4)");
  } else if (answer.status === 200) {
    fail(`table ${table} can be read WITHOUT signing in`, "run the migration again; it revokes that access");
  } else {
    fail(`table ${table}: unexpected answer ${answer.status}`, JSON.stringify(answer.body));
  }
}

const rpc = await call("/rest/v1/rpc/create_profile", {
  method: "POST",
  body: JSON.stringify({
    p_id: "00000000-0000-4000-8000-000000000000",
    p_school_name_gu: "check",
    p_dise_code: "check",
    p_key_hex: "0".repeat(64),
  }),
});
if (rpc.body?.code === PERMISSION_DENIED || rpc.status === 401 || rpc.status === 403) {
  pass("create_profile() exists and refuses a visitor who is not signed in");
} else if (rpc.body?.code === "PGRST202" || rpc.status === 404) {
  fail("create_profile() does not exist", "run supabase/migrations/0001_smc_cloud.sql in the SQL Editor (step 4)");
} else {
  fail(`create_profile(): unexpected answer ${rpc.status}`, JSON.stringify(rpc.body));
}

console.log(
  failures === 0
    ? `\nAll checks passed. Also confirm in the dashboard that Storage has a PRIVATE bucket named "backups".\n`
    : `\n${failures} check(s) failed. See docs/SUPABASE_SETUP.md.\n`,
);
process.exit(failures === 0 ? 0 : 1);
