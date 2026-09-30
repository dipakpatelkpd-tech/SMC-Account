import { useEffect, useState } from "react";
import type { JSX } from "react";
import { api } from "../api.js";
import type { GrantHeadDto, SchoolDto } from "../../shared/api.js";
import type { Issue } from "../../engine/validation.js";
import { IssueList } from "../components/IssueList.js";
import { useStrings } from "../i18n/index.js";

/**
 * The masters: the school's own details and its grant heads.
 *
 * Setup asks for these once, on a screen nobody sees again. Everything here
 * prints on a statutory form, so a wrong DISE code or a misspelt grant head is a
 * wrong register - and up to now the only cure was editing the database by hand.
 *
 * Grant heads are edited in place because the list is short, known, and mostly
 * reordering. Two things are deliberately not symmetrical:
 *
 *  - **Deactivating** takes a head out of THIS year's forms and leaves earlier
 *    years printing it, which is how the state actually changes grants (SPEC
 *    11.3).
 *  - **Deleting** is for a head typed by mistake. The service refuses it once
 *    anything points at the head, and says what.
 */
export function Masters({ onChanged }: { onChanged: () => void }): JSX.Element {
  const t = useStrings();
  const [school, setSchool] = useState<SchoolDto | null>(null);
  const [draft, setDraft] = useState<SchoolDto | null>(null);
  const [heads, setHeads] = useState<GrantHeadDto[]>([]);
  const [headDrafts, setHeadDrafts] = useState<Record<number, string>>({});
  const [newHead, setNewHead] = useState("");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [savingSchool, setSavingSchool] = useState(false);
  const [busyHead, setBusyHead] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);

  async function reload(): Promise<void> {
    try {
      const [nextSchool, nextHeads] = await Promise.all([api.getSchool(), api.listGrantHeads()]);
      setSchool(nextSchool);
      setDraft(nextSchool);
      setHeads(nextHeads);
      setHeadDrafts(Object.fromEntries(nextHeads.map((head) => [head.id, head.nameGu])));
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  if (failure !== null) {
    return (
      <div className="state error">
        <p>{t.couldNotLoad}</p>
        <p className="num">{failure}</p>
      </div>
    );
  }

  if (loading || !school || !draft) return <div className="state">{t.loading}</div>;

  const schoolChanged = (Object.keys(school) as (keyof SchoolDto)[]).some(
    (key) => (draft[key] ?? "") !== (school[key] ?? ""),
  );

  async function saveSchool(): Promise<void> {
    if (!draft || savingSchool) return;
    setSavingSchool(true);
    const result = await api.saveSchool(draft);
    setSavingSchool(false);
    if (!result.ok) {
      setIssues(result.issues);
      return;
    }
    setIssues([]);
    await reload();
    onChanged();
  }

  /** Every grant-head write goes through here: one busy flag, one refetch. */
  async function headWrite(id: number | null, work: () => Promise<{ ok: boolean; issues?: Issue[] }>) {
    setBusyHead(id ?? -1);
    const result = await work();
    setBusyHead(null);
    if (!result.ok) {
      setIssues(result.issues ?? []);
      return;
    }
    setIssues([]);
    await reload();
    onChanged();
  }

  function set<K extends keyof SchoolDto>(key: K, value: SchoolDto[K]): void {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  /**
   * Swap two heads' print order. Both are written, because the order is the pair
   * of numbers and moving one without the other would leave a duplicate.
   */
  async function move(index: number, by: -1 | 1): Promise<void> {
    const head = heads[index];
    const other = heads[index + by];
    if (!head || !other) return;
    await headWrite(head.id, async () => {
      const first = await api.updateGrantHead(head.id, {
        nameGu: headDrafts[head.id] ?? head.nameGu,
        reportOrder: other.reportOrder,
        active: head.active,
      });
      if (!first.ok) return first;
      return api.updateGrantHead(other.id, {
        nameGu: headDrafts[other.id] ?? other.nameGu,
        reportOrder: head.reportOrder,
        active: other.active,
      });
    });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>{t.mastersTitle}</h2>
          <p>{t.mastersSubtitle}</p>
        </div>
      </div>

      {issues.length > 0 && (
        <div className="card">
          <IssueList issues={issues} />
        </div>
      )}

      <section className="card">
        <h3>{t.setupSchoolSection}</h3>
        <div className="form-grid">
          <Field label={t.setupSchoolName} value={draft.nameGu} onChange={(v) => set("nameGu", v)} />
          <Field
            label={t.mastersSmcLabel}
            value={draft.smcLabelGu}
            onChange={(v) => set("smcLabelGu", v)}
            hint={t.mastersSmcLabelHint}
          />
          <Field label={t.diseCode} value={draft.diseCode} onChange={(v) => set("diseCode", v)} numeric />
          <Field label={t.setupCluster} value={draft.clusterGu} onChange={(v) => set("clusterGu", v)} />
          <Field label={t.setupTaluka} value={draft.talukaGu} onChange={(v) => set("talukaGu", v)} />
          <Field label={t.setupDistrict} value={draft.districtGu} onChange={(v) => set("districtGu", v)} />
          <Field
            label={t.setupHeadTeacher}
            value={draft.memberSecretaryGu}
            onChange={(v) => set("memberSecretaryGu", v)}
          />
          <Field
            label={t.setupHeadTeacherShort}
            value={draft.memberSecretaryShortGu}
            onChange={(v) => set("memberSecretaryShortGu", v)}
            hint={t.setupHeadTeacherShortHint}
          />
          <Field
            label={t.setupMobile}
            value={draft.memberSecretaryMobile ?? ""}
            onChange={(v) => set("memberSecretaryMobile", v === "" ? null : v)}
            numeric
          />
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label>{t.mastersProgramme}</label>
          <input value={draft.programmeGu} onChange={(e) => set("programmeGu", e.target.value)} />
          <span className="muted" style={{ fontSize: 12 }}>
            {t.mastersProgrammeHint}
          </span>
        </div>

        <h3 style={{ marginTop: 20 }}>{t.setupBankSection}</h3>
        <div className="form-grid">
          <Field label={t.bankName} value={draft.bankNameGu} onChange={(v) => set("bankNameGu", v)} />
          <Field
            label={t.setupBranch}
            value={draft.bankBranchGu}
            onChange={(v) => set("bankBranchGu", v)}
          />
          <Field
            label={t.setupAccountNo}
            value={draft.bankAccountNo}
            onChange={(v) => set("bankAccountNo", v)}
            numeric
          />
        </div>

        <div className="form-actions">
          <button
            className="primary"
            disabled={!schoolChanged || savingSchool}
            onClick={() => void saveSchool()}
          >
            {savingSchool ? "…" : t.save}
          </button>
          {schoolChanged && (
            <button className="ghost" onClick={() => setDraft(school)}>
              {t.cancel}
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <h3>{t.mastersHeadsSection}</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          {t.mastersHeadsHint}
        </p>
        <table>
          <thead>
            <tr>
              <th className="num">{t.mastersOrder}</th>
              <th>{t.grantHead}</th>
              <th>{t.mastersActive}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {heads.map((head, index) => {
              const name = headDrafts[head.id] ?? head.nameGu;
              const renamed = name.trim() !== head.nameGu && name.trim() !== "";
              const busy = busyHead === head.id;

              return (
                <tr key={head.id}>
                  <td className="num">
                    <div className="row-actions">
                      <button
                        className="ghost"
                        disabled={index === 0 || busy}
                        onClick={() => void move(index, -1)}
                        title={t.mastersMoveUp}
                      >
                        ↑
                      </button>
                      <button
                        className="ghost"
                        disabled={index === heads.length - 1 || busy}
                        onClick={() => void move(index, 1)}
                        title={t.mastersMoveDown}
                      >
                        ↓
                      </button>
                    </div>
                  </td>
                  <td>
                    <input
                      value={name}
                      style={{ width: "100%" }}
                      onChange={(e) =>
                        setHeadDrafts((current) => ({ ...current, [head.id]: e.target.value }))
                      }
                    />
                  </td>
                  <td>
                    <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={head.active}
                        disabled={busy}
                        onChange={(e) =>
                          void headWrite(head.id, () =>
                            api.updateGrantHead(head.id, {
                              nameGu: name,
                              reportOrder: head.reportOrder,
                              active: e.target.checked,
                            }),
                          )
                        }
                      />
                      <span className="muted">{head.active ? t.mastersInUse : t.mastersClosed}</span>
                    </label>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="primary"
                        disabled={!renamed || busy}
                        onClick={() =>
                          void headWrite(head.id, () =>
                            api.updateGrantHead(head.id, {
                              nameGu: name,
                              reportOrder: head.reportOrder,
                              active: head.active,
                            }),
                          )
                        }
                      >
                        {busy ? "…" : t.save}
                      </button>
                      <button
                        className="danger"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm(t.mastersConfirmDelete(head.nameGu))) return;
                          void headWrite(head.id, () => api.deleteGrantHead(head.id));
                        }}
                      >
                        {t.delete}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="form-actions">
          <input
            placeholder={t.mastersNewHeadPlaceholder}
            value={newHead}
            onChange={(e) => setNewHead(e.target.value)}
            style={{ minWidth: 260 }}
          />
          <button
            className="primary"
            disabled={newHead.trim() === "" || busyHead === -1}
            onClick={() =>
              void headWrite(null, async () => {
                const result = await api.createGrantHead({ nameGu: newHead.trim() });
                if (result.ok) setNewHead("");
                return result;
              })
            }
          >
            {t.mastersAddHead}
          </button>
        </div>
      </section>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  numeric,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  numeric?: boolean;
  hint?: string;
}): JSX.Element {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        className={numeric ? "num-input" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && (
        <span className="muted" style={{ fontSize: 12 }}>
          {hint}
        </span>
      )}
    </div>
  );
}
