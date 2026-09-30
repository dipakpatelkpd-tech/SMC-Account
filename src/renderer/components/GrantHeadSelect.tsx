import { useState } from "react";
import type { JSX } from "react";
import { api } from "../api.js";
import type { GrantHeadDto } from "../../shared/api.js";
import type { Issue } from "../../engine/validation.js";
import { IssueList } from "./IssueList.js";
import { useStrings } from "../i18n/index.js";

/** The option that opens the "new grant head" box instead of choosing a head. */
const NEW_HEAD = "new";

/**
 * The grant-head dropdown of a data-entry form, with one more choice at the
 * end: a grant head that was not set up on the setup screen. Choosing it opens
 * a box for the name right here; the head is created (as on the Masters
 * screen) and chosen, without leaving the form half-filled.
 */
export function GrantHeadSelect({
  id,
  heads,
  value,
  onChange,
  onCreated,
}: {
  id: string;
  heads: GrantHeadDto[];
  value: number;
  onChange: (grantHeadId: number) => void;
  /** A head was added: the screen adds it to its list. */
  onCreated: (head: GrantHeadDto) => void;
}): JSX.Element {
  const t = useStrings();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<Issue[]>([]);

  async function add(): Promise<void> {
    const nameGu = name.trim();
    if (nameGu === "" || busy) return;
    // Typed the name of a head that already exists: just choose it.
    const existing = heads.find((head) => head.nameGu.trim() === nameGu);
    if (existing) {
      onChange(existing.id);
      close();
      return;
    }
    setBusy(true);
    const result = await api.createGrantHead({ nameGu });
    setBusy(false);
    if (!result.ok) {
      setIssues(result.issues);
      return;
    }
    onCreated(result.data);
    onChange(result.data.id);
    close();
  }

  function close(): void {
    setAdding(false);
    setName("");
    setIssues([]);
  }

  if (adding) {
    return (
      <div className="grant-head-new">
        <div style={{ display: "flex", gap: 6 }}>
          <input
            id={id}
            autoFocus
            data-suggest="grantHead.name"
            placeholder={t.grantHeadNewPlaceholder}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              // Enter adds the head; it must not save the whole form.
              if (event.key === "Enter") {
                event.preventDefault();
                void add();
              }
              if (event.key === "Escape") close();
            }}
            style={{ flex: 1, minWidth: 0 }}
          />
          <button type="button" className="primary small" disabled={name.trim() === "" || busy} onClick={() => void add()}>
            {t.grantHeadNewAdd}
          </button>
          <button type="button" className="ghost small" onClick={close}>
            {t.cancel}
          </button>
        </div>
        {issues.length > 0 && <IssueList issues={issues} />}
      </div>
    );
  }

  return (
    <select
      id={id}
      value={value}
      onChange={(event) => {
        if (event.target.value === NEW_HEAD) setAdding(true);
        else onChange(Number(event.target.value));
      }}
    >
      {heads.map((head) => (
        <option key={head.id} value={head.id}>
          {head.nameGu}
        </option>
      ))}
      <option value={NEW_HEAD}>{t.grantHeadNewOption}</option>
    </select>
  );
}
