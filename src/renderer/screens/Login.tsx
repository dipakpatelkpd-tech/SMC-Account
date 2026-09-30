import { useState } from "react";
import type { FormEvent, JSX } from "react";
import { api } from "../api.js";
import type { CloudInfoDto } from "../../shared/api.js";
import type { Issue } from "../../engine/validation.js";
import { IssueList } from "../components/IssueList.js";
import { LanguageSwitch } from "../components/LanguageSwitch.js";
import { useStrings } from "../i18n/index.js";

/**
 * Logging in, creating an account, and resetting a forgotten password.
 *
 * Every step talks to the cloud, so each one needs the internet; the note under
 * the form says so, because the first login is the one moment this app cannot
 * work offline. After it, this PC stays signed in.
 *
 * Email addresses are proved with a 6-digit code rather than a link: a link
 * would open a web browser, and a school PC's browser may not even be the one
 * that has the email open. A code can be read off a phone.
 */
type Mode = "signIn" | "signUp" | "verify" | "forgot" | "reset";

const MIN_PASSWORD = 8;

export function Login({ cloud, onSignedIn }: { cloud: CloudInfoDto; onSignedIn: () => void }): JSX.Element {
  const t = useStrings();
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [code, setCode] = useState("");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function go(next: Mode): void {
    setMode(next);
    setIssues([]);
    setLocalError(null);
    setCode("");
    if (next !== "verify") {
      setPassword("");
      setPasswordAgain("");
    }
  }

  /** Both new-password forms check the same two things before asking the cloud. */
  function passwordProblem(): string | null {
    if (password.length < MIN_PASSWORD) return t.authPasswordShort;
    if (password !== passwordAgain) return t.authPasswordsDiffer;
    return null;
  }

  /** One cloud call, with the busy flag and the error list handled. */
  async function run<T>(
    call: () => Promise<{ ok: true; data: T } | { ok: false; issues: Issue[] }>,
  ): Promise<{ ok: true; data: T } | { ok: false; issues: Issue[] }> {
    setBusy(true);
    setIssues([]);
    setLocalError(null);
    try {
      const result = await call();
      if (!result.ok) setIssues(result.issues);
      return result;
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (busy) return;
    const address = email.trim();

    switch (mode) {
      case "signIn": {
        const result = await run(() => api.signIn(address, password));
        if (result.ok) onSignedIn();
        // Signed up earlier but never entered the code: go straight to it.
        else if (result.issues.some((issue) => issue.code === "email_not_confirmed")) setMode("verify");
        return;
      }
      case "signUp": {
        const problem = passwordProblem();
        if (problem) return setLocalError(problem);
        const result = await run(() => api.signUp(address, password));
        if (result.ok && result.data.needsCode) setMode("verify");
        else if (result.ok) onSignedIn();
        return;
      }
      case "verify": {
        const result = await run(() => api.verifySignUp(address, code));
        if (result.ok) onSignedIn();
        return;
      }
      case "forgot": {
        const result = await run(() => api.requestPasswordReset(address));
        if (result.ok) setMode("reset");
        return;
      }
      case "reset": {
        const problem = passwordProblem();
        if (problem) return setLocalError(problem);
        const result = await run(() => api.completePasswordReset(address, code, password));
        if (result.ok) onSignedIn();
        return;
      }
    }
  }

  const titles: Record<Mode, string> = {
    signIn: t.appName,
    signUp: t.authSignUpTitle,
    verify: t.authCodeTitle,
    forgot: t.authResetTitle,
    reset: t.authResetTitle,
  };

  return (
    <div className="auth">
      <form className="auth-card card" onSubmit={(event) => void submit(event)}>
        <div className="auth-head">
          <h1>{titles[mode]}</h1>
          <LanguageSwitch />
        </div>

        {mode === "signIn" && <p className="muted">{t.authSubtitle}</p>}
        {mode === "signUp" && <p className="muted">{t.authSignUpHint}</p>}
        {mode === "verify" && <p className="muted">{t.authCodeHint(email.trim())}</p>}
        {mode === "forgot" && <p className="muted">{t.authResetHint}</p>}
        {mode === "reset" && <p className="muted">{t.authCodeHint(email.trim())}</p>}

        {(mode === "signIn" || mode === "signUp" || mode === "forgot") && (
          <div className="field">
            <label htmlFor="auth-email">{t.authEmail}</label>
            <input
              id="auth-email"
              data-no-suggest
              type="email"
              autoComplete="username"
              className="num-input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus
            />
          </div>
        )}

        {(mode === "verify" || mode === "reset") && (
          <div className="field">
            <label htmlFor="auth-code">{t.authCode}</label>
            <input
              id="auth-code"
              data-no-suggest
              className="num-input auth-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              required
              autoFocus
            />
          </div>
        )}

        {(mode === "signIn" || mode === "signUp" || mode === "reset") && (
          <div className="field">
            <label htmlFor="auth-password">{mode === "reset" ? t.authNewPassword : t.authPassword}</label>
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === "signIn" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
        )}

        {(mode === "signUp" || mode === "reset") && (
          <div className="field">
            <label htmlFor="auth-password-again">{t.authPasswordAgain}</label>
            <input
              id="auth-password-again"
              type="password"
              autoComplete="new-password"
              value={passwordAgain}
              onChange={(event) => setPasswordAgain(event.target.value)}
              required
            />
          </div>
        )}

        {localError && <div className="issue error">{localError}</div>}
        {issues.length > 0 && <IssueList issues={issues} />}

        <div className="auth-actions">
          <button className="primary" type="submit" disabled={busy}>
            {busy
              ? mode === "signIn"
                ? t.authSigningIn
                : t.working
              : {
                  signIn: t.authSignIn,
                  signUp: t.authSignUpSubmit,
                  verify: t.authVerify,
                  forgot: t.authSendCode,
                  reset: t.authSetPassword,
                }[mode]}
          </button>
        </div>

        <div className="auth-links">
          {mode === "signIn" ? (
            <>
              <button type="button" className="link" onClick={() => go("signUp")}>
                {t.authCreateAccount}
              </button>
              <button type="button" className="link" onClick={() => go("forgot")}>
                {t.authForgot}
              </button>
            </>
          ) : (
            <button type="button" className="link" onClick={() => go("signIn")}>
              {mode === "signUp" ? t.authHaveAccount : t.authBack}
            </button>
          )}
        </div>

        <p className="auth-note muted">{t.authInternetNote}</p>
        {cloud.kind === "fake" && cloud.note && (
          <div className="issue warning auth-dev">
            <div>
              <strong>{t.authDevCloud}.</strong> <span className="num-inline">{cloud.note}</span>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
