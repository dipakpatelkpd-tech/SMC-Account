import { useState } from "react";
import type { JSX } from "react";
import { api } from "../api.js";
import { endSuggestionSession } from "../suggestions/sync.js";
import type { CloudBackupDto, DashboardDto, OpenSchoolDto, UserDto } from "../../shared/api.js";
import type { Issue } from "../../engine/validation.js";
import { LANGUAGES, useLanguage, useStrings, type Language } from "../i18n/index.js";
import { backupLabel, useBackupStatus } from "../components/BackupBadge.js";
import { IssueList } from "../components/IssueList.js";
import { BackupPicker } from "./Schools.js";
import { formatDateTime } from "../format.js";

/**
 * Application preferences, and the open school's account and backups.
 *
 * The interface language is the only preference. The printed reports are
 * deliberately not affected — they are the government audit forms and must
 * stay Gujarati, which the screen says out loud so nobody goes looking for a
 * setting that should not exist.
 */
export function Settings({
  data,
  school,
  user,
  onSignedOut,
}: {
  data: DashboardDto;
  school: OpenSchoolDto;
  user: UserDto;
  onSignedOut: () => void;
}): JSX.Element {
  const t = useStrings();
  const { language, setLanguage } = useLanguage();

  const labelFor: Record<Language, string> = {
    gu: t.languageGujarati,
    en: t.languageEnglish,
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h2>{t.settingsTitle}</h2>
          <p>{t.settingsSubtitle}</p>
        </div>
      </div>

      <div className="card">
        <h3>{t.language}</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          {t.languageHelp}
        </p>

        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {LANGUAGES.map((option) => (
            <button
              key={option}
              className={language === option ? "primary" : "ghost"}
              aria-pressed={language === option}
              onClick={() => setLanguage(option)}
              style={{ minWidth: 170 }}
            >
              {labelFor[option]}
            </button>
          ))}
        </div>

        <div className="issue warning" style={{ marginTop: 16 }}>
          <div>{t.reportsAlwaysGujarati}</div>
        </div>
      </div>

      <AccountAndBackup school={school} user={user} onSignedOut={onSignedOut} />

      <div className="card">
        <h3>{t.aboutTitle}</h3>
        <table>
          <tbody>
            <tr>
              <td style={{ width: 220 }}>{t.aboutSchool}</td>
              <td>
                {data.school.nameGu}
                <div className="muted" style={{ fontSize: 13 }}>
                  {t.diseCode} {data.school.diseCode} · {data.school.clusterGu} ·{" "}
                  {data.school.talukaGu}
                </div>
              </td>
            </tr>
            <tr>
              <td>{t.aboutBank}</td>
              <td>
                {data.school.bankNameGu} {data.school.bankBranchGu}
                <div className="muted num" style={{ fontSize: 13 }}>
                  {data.school.bankAccountNo}
                </div>
              </td>
            </tr>
            <tr>
              <td>{t.year}</td>
              <td className="num">{data.year.label}</td>
            </tr>
            <tr>
              <td>{t.navReports}</td>
              <td>{t.reportFontNote}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * Who is signed in, where this school's data is, and its cloud backups.
 *
 * Restoring replaces the open books with an older backup, so it asks first; the
 * books it replaces are kept in the school's backups folder either way.
 */
function AccountAndBackup({
  school,
  user,
  onSignedOut,
}: {
  school: OpenSchoolDto;
  user: UserDto;
  onSignedOut: () => void;
}): JSX.Element {
  const t = useStrings();
  const status = useBackupStatus(3000);
  const [backups, setBackups] = useState<CloudBackupDto[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function work(task: () => Promise<void>): Promise<void> {
    setBusy(true);
    setIssues([]);
    setMessage(null);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  }

  const backupNow = () =>
    work(async () => {
      const result = await api.backupNow();
      if (!result.ok) setIssues(result.issues);
      if (backups) await showBackups();
    });

  const showBackups = async (): Promise<void> => {
    const result = await api.listCloudBackups(school.profileId);
    if (!result.ok) {
      setIssues(result.issues);
      return;
    }
    setBackups(result.data);
    setChosen(result.data[0]?.id ?? null);
  };

  const restore = () =>
    work(async () => {
      const backup = backups?.find((item) => item.id === chosen);
      if (!backup) return;
      if (!window.confirm(t.backupRestoreConfirm(formatDateTime(backup.createdAt)))) return;
      const result = await api.restoreBackup(backup.id);
      if (!result.ok) {
        setIssues(result.issues);
        return;
      }
      setMessage(t.backupRestored);
      // Every screen holds figures from the books that were just replaced.
      window.location.reload();
    });

  const signOut = () =>
    work(async () => {
      if (!window.confirm(t.signOutHint)) return;
      await endSuggestionSession();
      await api.signOut();
      onSignedOut();
    });

  return (
    <div className="card">
      <h3>{t.accountSection}</h3>
      {issues.length > 0 && <IssueList issues={issues} />}
      {message && <div className="issue warning">{message}</div>}
      <table>
        <tbody>
          <tr>
            <td style={{ width: 220 }}>{t.accountEmail}</td>
            <td>
              <span className="num-inline">{user.email}</span>{" "}
              <button className="ghost small" type="button" disabled={busy} onClick={() => void signOut()}>
                {t.schoolsSignOut}
              </button>
            </td>
          </tr>
          <tr>
            <td>{t.dataFolder}</td>
            <td>
              <span className="num-inline">{school.folder}</span>{" "}
              <button className="ghost small" type="button" onClick={() => void api.showDataFolder()}>
                {t.openDataFolder}
              </button>
              <div className="muted" style={{ fontSize: 13 }}>
                {t.encryptionNote}
              </div>
            </td>
          </tr>
          <tr>
            <td>{t.backupStatus}</td>
            <td>
              {status && <span className={`backup-badge ${status.state}`}>{backupLabel(status, t)}</span>}{" "}
              <button className="primary small" type="button" disabled={busy} onClick={() => void backupNow()}>
                {busy ? t.working : t.backupNow}
              </button>
              {status?.lastError && status.state !== "upToDate" && (
                <div className="muted num-inline" style={{ fontSize: 12 }}>
                  {status.lastError}
                </div>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <h4 style={{ marginBottom: 4 }}>{t.backupList}</h4>
      <p className="muted" style={{ marginTop: 0 }}>
        {t.backupListHint}
      </p>
      {backups === null ? (
        <button className="ghost" type="button" disabled={busy} onClick={() => void work(showBackups)}>
          {t.backupShowList}
        </button>
      ) : backups.length === 0 ? (
        <p className="muted">{t.restoreNoBackups}</p>
      ) : (
        <>
          <BackupPicker backups={backups} chosen={chosen} onChoose={setChosen} />
          <div className="form-actions">
            <button className="danger" type="button" disabled={busy || !chosen} onClick={() => void restore()}>
              {t.backupRestore}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
