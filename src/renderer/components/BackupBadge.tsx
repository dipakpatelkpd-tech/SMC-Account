import { useEffect, useState } from "react";
import type { JSX } from "react";
import { api } from "../api.js";
import type { BackupStatusDto } from "../../shared/api.js";
import { formatDateTime } from "../format.js";
import { useStrings } from "../i18n/index.js";

const POLL_MS = 5000;

/**
 * One line saying whether the open school's books are safe in the cloud.
 * Kept in the sidebar so it is always in sight: "backup pending, offline" is
 * the thing a school should notice before it leaves with the pen drive.
 */
export function BackupBadge(): JSX.Element {
  const status = useBackupStatus();
  const t = useStrings();
  if (!status) return <span className="backup-badge" />;
  return (
    <span className={`backup-badge ${status.state}`} title={status.lastError ?? undefined}>
      {backupLabel(status, t)}
    </span>
  );
}

export function useBackupStatus(pollMs = POLL_MS): BackupStatusDto | null {
  const [status, setStatus] = useState<BackupStatusDto | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async (): Promise<void> => {
      const next = await api.getBackupStatus();
      if (alive) setStatus(next);
    };
    void load();
    const timer = window.setInterval(() => void load(), pollMs);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [pollMs]);
  return status;
}

export function backupLabel(status: BackupStatusDto, t: ReturnType<typeof useStrings>): string {
  switch (status.state) {
    case "upToDate":
      return t.backupUpToDate(formatDateTime(status.lastBackupAt));
    case "pending":
      return t.backupPending;
    case "uploading":
      return t.backupUploading;
    case "offline":
      return t.backupOffline;
    case "failed":
      return t.backupFailed;
    case "signedOut":
      return t.backupSignedOut;
    case "never":
      return t.backupNever;
  }
}
