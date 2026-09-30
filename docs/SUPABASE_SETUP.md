# Setting up the cloud (Supabase)

The app keeps every school's books on the school's own pen drive. The cloud
holds only three things: the **accounts** (email and password), each school's
**encryption key**, and **encrypted backups** of the books. This guide creates
that cloud once, by hand, in about half an hour.

Nothing in the app has to change afterwards: you put the project's address and
public key into `.env`, run a check, and build the installer.

> Use a **new** Supabase account for this, not the one currently connected to
> Claude in the app's connectors. Everything below happens in your web browser
> at supabase.com.

---

## 1. Create the Supabase account

1. Go to <https://supabase.com> → **Start your project** → sign up (email, or GitHub).
2. Turn on two-factor authentication: click your avatar → **Account preferences**
   → **Security** → **Multi-factor authentication**.

   This matters more than usual: the project holds every school's encryption
   key. Whoever can sign in to the Supabase dashboard can read them.

## 2. Create the project

**New project**, then:

| Setting | Value |
|---|---|
| Name | `smc-accounts` (any name) |
| Database password | click **Generate**, save it in a password manager. The app never needs it. |
| Region | **South Asia (Mumbai)** — the closest to Gujarat |
| Plan | **Free** to try it out; see [Plans](#plans-and-limits) before real schools use it |

If the form offers security options, keep the **Data API** enabled — the app talks
to it. Whatever it offers about row-level security or exposing tables, the script in
step 4 sets both explicitly, so either choice works.

Wait a minute or two until the project says it is ready.

## 3. Authentication settings

In the project: **Authentication** → **Sign In / Providers** (on older dashboards,
**Authentication → Providers**).

1. **Email**: enabled.
2. **Confirm email**: **ON**. Without it, anybody could create an account in
   someone else's name. `npm run check:cloud` refuses a project with this off.
3. **Minimum password length**: **8** (the app asks for at least 8).
4. **Allow new users to sign up**: ON if the people using the app create their own
   accounts. If you would rather create every account yourself, turn it off and
   add users under **Authentication → Users → Add user** (tick *Auto confirm*).
5. Every other provider (Google, phone, …) stays **off**; the app does not use them.

## 4. Create the tables — run the script once

1. Open **SQL Editor** → **New query**.
2. Open `supabase/migrations/0001_smc_cloud.sql` from this project, copy **all** of
   it, paste it into the editor, press **Run**.
3. Expect *Success. No rows returned.* Running it a second time is harmless.

Then check what it made:

- **Table Editor** lists `profiles`, `profile_keys` and `backups`, each marked as
  having **RLS enabled**.
- **Storage** has a bucket called **`backups`** marked **Private**.
- **Advisors → Security Advisor** shows no errors for those tables.

What the script guarantees (and what `tests/cloud/supabase-sql.test.ts` proves
against real PostgreSQL on every test run):

- an account sees and adds only its own schools, keys, backups and files;
- **nothing can be changed or deleted** through the app's key — a backup, once
  written, stays, and a school's key can never be replaced;
- somebody who is not signed in can do nothing at all.

## 5. Email: the code template and a real sender

The app confirms email addresses and resets passwords with a **6-digit code**
typed into the app, not a link (a school PC's browser is often not where the
email is open, and a code can be read off a phone). Supabase's default emails
contain a link, so two templates change.

**Authentication → Emails → Templates** (older dashboards: **Authentication → Email Templates**):

**Confirm signup** — subject `SMC હિસાબ – તમારો કોડ / your code`, body:

```html
<h2>SMC હિસાબ</h2>
<p>તમારું ખાતું ચાલુ કરવા આ કોડ સોફ્ટવેરમાં લખો:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>Enter this code in SMC Accounts to confirm your email address.</p>
<p style="color:#666">જો તમે ખાતું ન બનાવ્યું હોય તો આ ઈમેલ અવગણો. / If you did not sign up, ignore this email.</p>
```

**Reset Password** — subject `SMC હિસાબ – પાસવર્ડ બદલવાનો કોડ / password code`, body:

```html
<h2>SMC હિસાબ</h2>
<p>નવો પાસવર્ડ રાખવા આ કોડ સોફ્ટવેરમાં લખો:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>Enter this code in SMC Accounts to set a new password.</p>
<p style="color:#666">જો તમે પાસવર્ડ બદલવાનું ન કહ્યું હોય તો આ ઈમેલ અવગણો. / If you did not ask for this, ignore this email.</p>
```

`{{ .Token }}` is the code; leave it exactly as written. The code lasts an hour by
default (**Email OTP Expiration** under the Email provider settings); the app
accepts codes of 6 to 10 digits, so the **Email OTP Length** setting can stay as it is.

**A real email sender.** Supabase's built-in sender is meant only for trying things
out: at the time of writing it delivers only to members of your own Supabase
organisation, and only a few messages an hour. Before anyone else signs up:

1. Get SMTP details from an email service — for example Resend, Brevo, Zoho Mail,
   or Amazon SES — with a sender address on a domain you control
   (e.g. `no-reply@yourdomain.in`).
2. **Authentication → Emails → SMTP Settings**: enable custom SMTP and enter them.
3. **Authentication → Rate Limits**: raise the email limit to what you expect
   (a few dozen an hour is plenty for a handful of schools).

Until then you can test with your own address, which is a member of the organisation.

**No domain? Use a Gmail account as the sender.** Google's SMTP server needs no
domain of your own, and a free Gmail account can send a few hundred emails a day —
plenty for a handful of schools.

1. Create a **separate** Gmail account just for this (e.g. `smc.hisab.codes@gmail.com`),
   because the password made below can read and send that account's mail.
2. In that Google account: **Security → 2-Step Verification** → turn it on.
3. Then **Security → App passwords** (or search "App passwords" in the account
   settings) → create one named `Supabase` → copy the 16-letter password.
4. In Supabase, **Authentication → Emails → SMTP Settings** → enable custom SMTP:

   | Field | Value |
   |---|---|
   | Sender email | the Gmail address |
   | Sender name | `SMC હિસાબ` |
   | Host | `smtp.gmail.com` |
   | Port | `587` |
   | Username | the full Gmail address |
   | Password | the 16-letter app password (no spaces) |

5. **Authentication → Rate Limits**: raise the email limit (e.g. 30 an hour).

Later, with a domain of your own, you can switch to a proper email service
without changing anything in the app.

## 6. Put the project into the app

1. **Project Settings → API Keys** (older dashboards: **Project Settings → API**).
2. Copy the **Project URL** — `https://<something>.supabase.co`.
3. Copy the **Publishable key** — it starts `sb_publishable_`. If the page shows
   only *legacy* keys, use the one labelled **anon / public**.

   **Never** use the *secret* key (`sb_secret_…`) or the *service_role* key. They
   bypass every rule from step 4, and anything built into an installer can be
   read by whoever has the installer. The app refuses to start with one.
4. Open `.env` in this project folder and add (see `.env.example`):

   ```
   MAIN_VITE_SUPABASE_URL=https://<something>.supabase.co
   MAIN_VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
5. Check it:

   ```bash
   npm run check:cloud
   ```

   Every line should say `ok`. It creates nothing and signs nobody up.

## 7. Try it end to end

```bash
npm run dev
```

The yellow *Development cloud* note on the login screen is gone: the app now uses
your project.

1. **Create an account** with your own email; the code arrives; enter it.
2. **New school** → **Choose location…** → pick a pen drive → fill in the form → **Start**.
3. **Settings → Back up now.**
4. In Supabase: **Table Editor → backups** has a row, and **Storage → backups** has a
   file under your user id. Download it if you like: it is unreadable without the key.
5. A second PC — or, on this one, `SMC_DEV_PC=pc2 npm run dev` — log in with the same
   account, **Open existing data**, choose the pen drive: the same books open.

## 8. Build the installer

The URL and the key are built into the installer from `.env`:

```bash
npm run pack:win
```

See `docs/PACKAGING.md`. Install it on a clean Windows 10 or 11 PC once before
handing it over: log in, create a school on a pen drive, back up.

---

## Plans and limits

At the time of writing (check <https://supabase.com/pricing>):

- **Free** projects are **paused after about a week with no activity**. While
  paused, logins and backups fail; the app keeps working on the pen drive and sends
  the waiting backups once the project is restored from the dashboard. Fine for
  trying things out, not for schools relying on it.
- **Pro** projects are not paused and have far larger limits. Choose it before real
  schools depend on the backups.

**How much space backups take.** A school's whole year is about 150 KB. The app
backs up a few minutes after changes (at most every 20 minutes), when a school is
closed, and on **Back up now** — typically a few backups on a working day, so
roughly 10–100 MB a school a year. Backups are never deleted automatically; that
is the point of them.

## Looking after it

- **The secret key and the database password never leave the dashboard.** The
  app needs neither.
- **Deleting a user** (Authentication → Users) also deletes their schools, keys and
  backup records. **Their pen-drive data can then never be opened again**, because
  its key is gone. Their backup files stay in Storage until removed there.
- **Changing the publishable key** (rotating it) means rebuilding the installer.
- **Pruning old backups**, if it is ever needed, is done in the dashboard
  (Storage and Table Editor). The app itself cannot delete a backup.
- **Subscriptions later.** Schools belong to an account (`profiles.owner_id`), so a
  limit on schools per account, or a paid plan per account, can be added as one more
  table and one more rule without touching the schools' data.

## If something goes wrong

| Symptom | Likely cause |
|---|---|
| App says it was built without its cloud settings | `.env` lacked the two lines when the installer was built |
| "No internet connection" on a PC that is online | wrong URL in `.env`, or the project is paused |
| The code email never arrives | built-in sender (step 5): the address is not in your organisation, or the hourly limit is used up |
| "The code is wrong or has expired" with a fresh code | the template does not contain `{{ .Token }}`, so the email held a link instead |
| `check:cloud`: table does not exist | step 4 was not run, or not all of the file was pasted |
| `check:cloud`: email confirmation is OFF | step 3, *Confirm email* |
