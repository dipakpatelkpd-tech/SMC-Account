import { useCallback, useEffect, useState } from "react";
import type { JSX } from "react";
import { api } from "../api.js";
import { endSuggestionSession } from "../suggestions/sync.js";
import type {
  CloudBackupDto,
  CloudInfoDto,
  FolderInspectionDto,
  SchoolListDto,
  SchoolListItemDto,
  UserDto,
} from "../../shared/api.js";
import type { Issue } from "../../engine/validation.js";
import { IssueList } from "../components/IssueList.js";
import { LanguageSwitch } from "../components/LanguageSwitch.js";
import { formatBytes, formatDateTime } from "../format.js";
import { useStrings } from "../i18n/index.js";

/**
 * Choosing a school - Tally's "Select Company".
 *
 * Every school in the account is listed, with where its data is from this PC's
 * point of view:
 *
 *   available            its folder is reachable: open it
 *   pen drive not in     this PC knows it; plug the drive in, or point at the folder
 *   never on this PC     open its folder from a pen drive, or bring it back
 *                        from a cloud backup if the pen drive is gone
 */
interface LockPrompt {
  profileId: string;
  folder?: string;
  deviceName: string;
  openedAt: string;
}

interface RestorePanel {
  school: SchoolListItemDto;
  backups: CloudBackupDto[] | null;
  chosen: string | null;
}

export function Schools({
  user,
  cloud,
  onOpened,
  onNewSchool,
}: {
  user: UserDto;
  cloud: CloudInfoDto;
  onOpened: () => void;
  onNewSchool: () => void;
}): JSX.Element {
  const t = useStrings();
  const [list, setList] = useState<SchoolListDto | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [busy, setBusy] = useState(false);
  const [lock, setLock] = useState<LockPrompt | null>(null);
  const [found, setFound] = useState<FolderInspectionDto | null>(null);
  const [restore, setRestore] = useState<RestorePanel | null>(null);

  const load = useCallback(async () => {
    setList(await api.listSchools());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function busyWith(work: () => Promise<void>): Promise<void> {
    setBusy(true);
    setIssues([]);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  }

  function open(profileId: string, options: { folder?: string; force?: boolean } = {}): Promise<void> {
    return busyWith(async () => {
      const result = await api.openSchool(profileId, options);
      if (!result.ok) {
        setIssues(result.issues);
        await load();
        return;
      }
      if (!result.data.opened) {
        setLock({ profileId, folder: options.folder, ...result.data.lockedBy });
        return;
      }
      setLock(null);
      onOpened();
    });
  }

  /** Point at a folder or pen drive and open what is in it. */
  function openFromFolder(expected?: SchoolListItemDto): Promise<void> {
    return busyWith(async () => {
      setFound(null);
      const folder = await api.pickFolder("openSchool");
      if (!folder) return;
      const inspected = await api.inspectFolder(folder);
      if (!inspected.ok) {
        setIssues(inspected.issues);
        return;
      }
      const mine = inspected.data.schools.filter((school) => school.ownedByMe);
      const match = expected
        ? mine.find((school) => school.profileId === expected.profileId)
        : mine.length === 1 && inspected.data.schools.length === 1
          ? mine[0]
          : undefined;
      if (match) {
        setBusy(false);
        await open(match.profileId, { folder: match.folder });
        return;
      }
      setFound(inspected.data);
    });
  }

  function showRestore(school: SchoolListItemDto): Promise<void> {
    return busyWith(async () => {
      setRestore({ school, backups: null, chosen: null });
      const result = await api.listCloudBackups(school.profileId);
      if (!result.ok) {
        setIssues(result.issues);
        setRestore(null);
        return;
      }
      setRestore({ school, backups: result.data, chosen: result.data[0]?.id ?? null });
    });
  }

  function restoreTo(): Promise<void> {
    const panel = restore;
    if (!panel?.chosen) return Promise.resolve();
    return busyWith(async () => {
      const folder = await api.pickFolder("restoreSchool");
      if (!folder) return;
      const result = await api.restoreSchool(panel.school.profileId, panel.chosen!, folder);
      if (!result.ok) {
        setIssues(result.issues);
        return;
      }
      onOpened();
    });
  }

  function moveLegacy(): Promise<void> {
    return busyWith(async () => {
      const folder = await api.pickFolder("newSchool");
      if (!folder) return;
      const result = await api.moveLegacyBooks(folder);
      if (!result.ok) {
        setIssues(result.issues);
        return;
      }
      onOpened();
    });
  }

  async function signOut(): Promise<void> {
    await endSuggestionSession();
    await api.signOut();
    onOpened();
  }

  const availability: Record<SchoolListItemDto["availability"], string> = {
    ready: t.schoolsReady,
    notConnected: t.schoolsNotConnected,
    notOnThisPc: t.schoolsNotOnThisPc,
  };

  return (
    <div className="setup">
      <div className="setup-form">
        <header className="setup-head">
          <div>
            <h1>{t.schoolsTitle}</h1>
            <p>{t.schoolsSubtitle}</p>
            <p className="muted num-inline">{t.schoolsSignedInAs(user.email)}</p>
          </div>
          <div className="schools-head-actions">
            <LanguageSwitch />
            <button type="button" className="ghost" onClick={() => void signOut()} disabled={busy}>
              {t.schoolsSignOut}
            </button>
          </div>
        </header>

        {cloud.kind === "fake" && cloud.note && (
          <div className="issue warning">
            <div>
              <strong>{t.authDevCloud}.</strong> {cloud.note}
            </div>
          </div>
        )}

        {issues.length > 0 && (
          <div className="card">
            <IssueList issues={issues} />
          </div>
        )}

        {lock && (
          <div className="card lock-card">
            <p>{t.schoolsLocked(lock.deviceName, formatDateTime(lock.openedAt))}</p>
            <div className="form-actions">
              <button
                className="primary"
                type="button"
                disabled={busy}
                onClick={() => void open(lock.profileId, { folder: lock.folder, force: true })}
              >
                {t.schoolsOpenAnyway}
              </button>
              <button className="ghost" type="button" onClick={() => setLock(null)}>
                {t.cancel}
              </button>
            </div>
          </div>
        )}

        <div className="schools-actions">
          <button className="school-action card" type="button" onClick={onNewSchool} disabled={busy}>
            <strong>{t.schoolsNew}</strong>
            <span className="muted">{t.schoolsNewHint}</span>
          </button>
          <button className="school-action card" type="button" onClick={() => void openFromFolder()} disabled={busy}>
            <strong>{t.schoolsOpenExisting}</strong>
            <span className="muted">{t.schoolsOpenExistingHint}</span>
          </button>
        </div>

        {found && (
          <div className="card">
            <p>{t.schoolsFoundInFolder}</p>
            {found.schools.map((school) => (
              <div className="school-row" key={school.profileId + school.folder}>
                <div>
                  <div className="school-name">{school.schoolNameGu}</div>
                  <div className="muted num-inline">
                    {school.diseCode} · {school.folder}
                  </div>
                </div>
                {school.ownedByMe ? (
                  <button
                    className="primary"
                    type="button"
                    disabled={busy}
                    onClick={() => void open(school.profileId, { folder: school.folder })}
                  >
                    {t.schoolsOpen}
                  </button>
                ) : (
                  <span className="badge muted">{t.schoolsOtherAccount}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {list?.legacyBooks && (
          <div className="card legacy-card">
            <h3>{t.legacyTitle}</h3>
            <p>
              {list.legacyBooks.schoolNameGu && <strong>{list.legacyBooks.schoolNameGu}. </strong>}
              {t.legacyHint}
              {list.legacyBooks.developmentCopy && <span className="muted"> {t.legacyDevNote}</span>}
            </p>
            <button className="primary" type="button" disabled={busy} onClick={() => void moveLegacy()}>
              {t.legacyMove}
            </button>
          </div>
        )}

        <div className="card">
          {list && !list.cloudReachable && (
            <div className="issue warning">
              <div>
                {t.schoolsOffline}{" "}
                <button className="link" type="button" onClick={() => void load()}>
                  {t.schoolsRefresh}
                </button>
              </div>
            </div>
          )}
          {list === null && <p className="muted">{t.loading}</p>}
          {list && list.schools.length === 0 && <p className="muted">{t.schoolsEmpty}</p>}
          {list?.schools.map((school) => (
            <div className="school-row" key={school.profileId}>
              <div>
                <div className="school-name">{school.schoolNameGu}</div>
                <div className="muted num-inline">
                  {school.diseCode}
                  {school.folder && ` · ${school.folder}`}
                  {school.lastOpenedAt && ` · ${t.schoolsLastOpened} ${formatDateTime(school.lastOpenedAt)}`}
                </div>
                <span className={`badge ${school.availability}`}>{availability[school.availability]}</span>
              </div>
              <div className="row-actions">
                {school.availability === "ready" && (
                  <button className="primary" type="button" disabled={busy} onClick={() => void open(school.profileId)}>
                    {t.schoolsOpen}
                  </button>
                )}
                {school.availability !== "ready" && (
                  <button className="ghost" type="button" disabled={busy} onClick={() => void openFromFolder(school)}>
                    {t.schoolsFindFolder}
                  </button>
                )}
                {school.availability !== "ready" && (
                  <button className="ghost" type="button" disabled={busy} onClick={() => void showRestore(school)}>
                    {t.schoolsRestore}
                  </button>
                )}
                {school.availability === "notConnected" && (
                  <button
                    className="ghost"
                    type="button"
                    disabled={busy}
                    onClick={async () => setList(await api.forgetSchool(school.profileId))}
                  >
                    {t.schoolsForget}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {restore && (
          <div className="card">
            <h3>{t.restoreTitle(restore.school.schoolNameGu)}</h3>
            <p className="muted">{t.restoreHint}</p>
            {restore.backups === null && <p className="muted">{t.loading}</p>}
            {restore.backups?.length === 0 && <p className="muted">{t.restoreNoBackups}</p>}
            {restore.backups && restore.backups.length > 0 && (
              <BackupPicker
                backups={restore.backups}
                chosen={restore.chosen}
                onChoose={(id) => setRestore({ ...restore, chosen: id })}
              />
            )}
            <div className="form-actions">
              <button
                className="primary"
                type="button"
                disabled={busy || !restore.chosen}
                onClick={() => void restoreTo()}
              >
                {busy ? t.working : t.restoreChooseLocation}
              </button>
              <button className="ghost" type="button" onClick={() => setRestore(null)}>
                {t.cancel}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** A table of cloud backups, newest first, one of them chosen. */
export function BackupPicker({
  backups,
  chosen,
  onChoose,
}: {
  backups: CloudBackupDto[];
  chosen: string | null;
  onChoose: (id: string) => void;
}): JSX.Element {
  const t = useStrings();
  return (
    <table>
      <thead>
        <tr>
          <th />
          <th>{t.backupWhen}</th>
          <th>{t.backupDevice}</th>
          <th className="num">{t.backupSize}</th>
        </tr>
      </thead>
      <tbody>
        {backups.map((backup, index) => (
          <tr key={backup.id} onClick={() => onChoose(backup.id)} className="clickable">
            <td style={{ width: 32 }}>
              <input
                type="radio"
                name="backup"
                checked={chosen === backup.id}
                onChange={() => onChoose(backup.id)}
                aria-label={formatDateTime(backup.createdAt)}
              />
            </td>
            <td className="num-inline">
              {formatDateTime(backup.createdAt)}
              {index === 0 && <span className="badge ready"> {t.restoreLatest}</span>}
            </td>
            <td className="num-inline">{backup.deviceName}</td>
            <td className="num">{formatBytes(backup.sizeBytes)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
