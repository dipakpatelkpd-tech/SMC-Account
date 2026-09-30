import { useState } from "react";
import type { JSX } from "react";
import { api } from "../api.js";
import type { SetupInput } from "../../shared/api.js";
import type { Issue } from "../../engine/validation.js";
import { IssueList } from "../components/IssueList.js";
import { Money } from "../components/Money.js";
import { tryParseAmount } from "../format.js";
import { useLanguage, useStrings, LANGUAGES, type Language } from "../i18n/index.js";
import {
  DEFAULT_GRANT_HEADS,
  codeForNewHead,
  defaultProgrammeLines,
} from "../../lib/default-grant-heads.js";
import { financialYearEnd, financialYearStart } from "../../lib/dates.js";

/**
 * Setting up a school.
 *
 * Two uses. A NEW school (`newSchool` given): the form also asks where to keep
 * its data - usually a pen drive - and creating it makes the school's encrypted
 * folder there and registers it with the account. An open school whose
 * database is still EMPTY: the same form fills it in.
 *
 * Either way it creates everything the rest of the application assumes exists:
 * the school, its bank account, the first financial year, the grant heads and
 * their opening balances.
 *
 * One long form rather than a wizard. The school fills this in once, sitting
 * with their papers in front of them, and a wizard would only hide later fields
 * behind earlier ones while they hunt for a DISE code.
 */
interface HeadRow {
  code: string;
  nameGu: string;
  bank: string;
  cash: string;
}

export function Setup({
  onDone,
  newSchool,
}: {
  onDone: () => void;
  /** Present when this creates a new school rather than filling an open one. */
  newSchool?: { onCancel: () => void };
}): JSX.Element {
  const t = useStrings();
  const { language, setLanguage } = useLanguage();

  // Where the new school's data goes: the folder or pen drive the user picked.
  const [location, setLocation] = useState<string | null>(null);

  const [nameGu, setNameGu] = useState("");
  const [diseCode, setDiseCode] = useState("");
  const [clusterGu, setClusterGu] = useState("");
  const [talukaGu, setTalukaGu] = useState("");
  const [districtGu, setDistrictGu] = useState("");
  const [memberSecretaryGu, setMemberSecretaryGu] = useState("");
  const [memberSecretaryShortGu, setMemberSecretaryShortGu] = useState("");
  const [mobile, setMobile] = useState("");

  const [bankNameGu, setBankNameGu] = useState("Bank of Baroda (BOB)");
  const [branchGu, setBranchGu] = useState("");
  const [accountNo, setAccountNo] = useState("");

  const [yearLabel, setYearLabel] = useState(defaultYearLabel());

  const [heads, setHeads] = useState<HeadRow[]>(
    DEFAULT_GRANT_HEADS.map((head) => ({
      code: head.code,
      nameGu: head.nameGu,
      bank: "0.00",
      cash: "0.00",
    })),
  );

  const [issues, setIssues] = useState<Issue[]>([]);
  const [saving, setSaving] = useState(false);

  const yearValid = /^\d{4}-\d{2}$/.test(yearLabel.trim());
  const totalOpening = heads.reduce(
    (sum, head) => sum + (tryParseAmount(head.bank) ?? 0) + (tryParseAmount(head.cash) ?? 0),
    0,
  );

  const valid =
    (!newSchool || location !== null) &&
    nameGu.trim() !== "" &&
    diseCode.trim() !== "" &&
    clusterGu.trim() !== "" &&
    talukaGu.trim() !== "" &&
    districtGu.trim() !== "" &&
    memberSecretaryGu.trim() !== "" &&
    bankNameGu.trim() !== "" &&
    accountNo.trim() !== "" &&
    yearValid &&
    heads.length > 0 &&
    heads.every((head) => head.nameGu.trim() !== "") &&
    heads.every(
      (head) => tryParseAmount(head.bank) !== null && tryParseAmount(head.cash) !== null,
    );

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!valid || saving) return;

    const input: SetupInput = {
      school: {
        nameGu: nameGu.trim(),
        // The header line every report prints. Derived unless the school
        // already writes it differently.
        smcLabelGu: `SMCE ${nameGu.trim()}`,
        diseCode: diseCode.trim(),
        clusterGu: clusterGu.trim(),
        talukaGu: talukaGu.trim(),
        districtGu: districtGu.trim(),
        programmeGu: defaultProgrammeLines(districtGu.trim()),
        memberSecretaryGu: memberSecretaryGu.trim(),
        memberSecretaryShortGu:
          memberSecretaryShortGu.trim() || `સભ્ય સચિવ ${memberSecretaryGu.trim()}`,
        memberSecretaryMobile: mobile.trim() || null,
      },
      bank: {
        bankNameGu: bankNameGu.trim(),
        branchGu: branchGu.trim(),
        accountNo: accountNo.trim(),
      },
      year: {
        label: yearLabel.trim(),
        startDate: financialYearStart(yearLabel.trim()),
        endDate: financialYearEnd(yearLabel.trim()),
      },
      grantHeads: heads.map((head, index) => ({
        code: head.code,
        nameGu: head.nameGu.trim(),
        reportOrder: index + 1,
      })),
      openingBalances: heads.map((head) => ({
        code: head.code,
        bankPaise: tryParseAmount(head.bank) ?? 0,
        cashPaise: tryParseAmount(head.cash) ?? 0,
      })),
    };

    setSaving(true);
    const result = newSchool && location ? await api.createSchool(location, input) : await api.completeSetup(input);
    setSaving(false);

    if (!result.ok) {
      setIssues(result.issues);
      return;
    }
    setIssues([]);
    onDone();
  }

  return (
    <div className="setup">
      <form className="setup-form" onSubmit={(event) => void submit(event)}>
        <header className="setup-head">
          <div>
            <h1>{newSchool ? t.setupNewTitle : t.setupTitle}</h1>
            <p>{newSchool ? t.setupNewSubtitle : t.setupSubtitle}</p>
          </div>
          {/* Offered first: someone who cannot read Gujarati has to be able to
              get through this screen to reach the language setting. */}
          <div className="setup-language">
            {LANGUAGES.map((option) => (
              <button
                key={option}
                type="button"
                className={language === option ? "primary" : "ghost"}
                onClick={() => setLanguage(option as Language)}
              >
                {option === "gu" ? t.languageGujarati : t.languageEnglish}
              </button>
            ))}
          </div>
        </header>

        {newSchool && (
          <div className="setup-back">
            <button type="button" className="ghost" onClick={newSchool.onCancel} disabled={saving}>
              ← {t.setupBackToSchools}
            </button>
          </div>
        )}

        {issues.length > 0 && (
          <div className="card">
            <IssueList issues={issues} />
          </div>
        )}

        {newSchool && (
          <section className="card location-card">
            <h3>{t.setupLocationSection}</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              {t.setupLocationHint}
            </p>
            <div className="location-pick">
              <button
                type="button"
                className={location ? "ghost" : "primary"}
                onClick={async () => {
                  const chosen = await api.pickFolder("newSchool");
                  if (chosen) setLocation(chosen);
                }}
              >
                {t.setupLocationBrowse}
              </button>
              <span className={location ? "num-inline" : "muted"}>
                {location ? t.setupLocationWillCreate(schoolFolderPreview(location, diseCode)) : t.setupLocationNone}
              </span>
            </div>
          </section>
        )}

        <section className="card">
          <h3>{t.setupSchoolSection}</h3>
          <div className="form-grid">
            <Field label={t.setupSchoolName} value={nameGu} onChange={setNameGu} required suggest="school.name" />
            <Field label={t.diseCode} value={diseCode} onChange={setDiseCode} numeric required suggest="school.dise" />
            <Field label={t.setupCluster} value={clusterGu} onChange={setClusterGu} required suggest="school.cluster" />
            <Field label={t.setupTaluka} value={talukaGu} onChange={setTalukaGu} required suggest="school.taluka" />
            <Field label={t.setupDistrict} value={districtGu} onChange={setDistrictGu} required suggest="school.district" />
            <Field
              suggest="school.headTeacher"
              label={t.setupHeadTeacher}
              value={memberSecretaryGu}
              onChange={setMemberSecretaryGu}
              required
            />
            <Field
              suggest="school.headTeacherShort"
              label={t.setupHeadTeacherShort}
              value={memberSecretaryShortGu}
              onChange={setMemberSecretaryShortGu}
              hint={t.setupHeadTeacherShortHint}
            />
            <Field label={t.setupMobile} value={mobile} onChange={setMobile} numeric suggest="school.mobile" />
          </div>
        </section>

        <section className="card">
          <h3>{t.setupBankSection}</h3>
          <div className="form-grid">
            <Field label={t.bankName} value={bankNameGu} onChange={setBankNameGu} required suggest="bank.name" />
            <Field label={t.setupBranch} value={branchGu} onChange={setBranchGu} suggest="bank.branch" />
            <Field label={t.setupAccountNo} value={accountNo} onChange={setAccountNo} numeric required suggest="bank.accountNo" />
          </div>
        </section>

        <section className="card">
          <h3>{t.setupYearSection}</h3>
          <div className="form-grid">
            <Field
              suggest="year.label"
              label={t.setupYearLabel}
              value={yearLabel}
              onChange={setYearLabel}
              numeric
              required
              hint={t.setupYearHint}
            />
            <div className="field">
              <label>{t.setupYearRange}</label>
              <div className="num" style={{ padding: "7px 0", fontWeight: 600 }}>
                {yearValid
                  ? `${financialYearStart(yearLabel.trim())} → ${financialYearEnd(yearLabel.trim())}`
                  : "—"}
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <h3>{t.setupHeadsSection}</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            {t.setupHeadsHint}
          </p>
          <table>
            <thead>
              <tr>
                <th>{t.grantHead}</th>
                <th className="num">{t.setupOpeningBank}</th>
                <th className="num">{t.setupOpeningCash}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {heads.map((head, index) => (
                <tr key={head.code}>
                  <td>
                    <input
                      data-suggest="grantHead.name"
                      value={head.nameGu}
                      onChange={(event) =>
                        setHeads((current) =>
                          current.map((row, position) =>
                            position === index ? { ...row, nameGu: event.target.value } : row,
                          ),
                        )
                      }
                      style={{ width: "100%" }}
                    />
                  </td>
                  <td>
                    <input
                      className="num-input"
                      inputMode="decimal"
                      style={{ width: 120, textAlign: "right" }}
                      value={head.bank}
                      onChange={(event) =>
                        setHeads((current) =>
                          current.map((row, position) =>
                            position === index ? { ...row, bank: event.target.value } : row,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="num-input"
                      inputMode="decimal"
                      style={{ width: 120, textAlign: "right" }}
                      value={head.cash}
                      onChange={(event) =>
                        setHeads((current) =>
                          current.map((row, position) =>
                            position === index ? { ...row, cash: event.target.value } : row,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="danger"
                        onClick={() =>
                          setHeads((current) => current.filter((_, position) => position !== index))
                        }
                      >
                        {t.delete}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="total-row">
                <td>{t.total}</td>
                <td className="num" colSpan={2}>
                  <Money paise={totalOpening} />
                </td>
                <td />
              </tr>
            </tbody>
          </table>
          <div className="form-actions">
            <button
              type="button"
              className="ghost"
              onClick={() =>
                setHeads((current) => [
                  ...current,
                  {
                    code: codeForNewHead(current.map((row) => row.code)),
                    nameGu: "",
                    bank: "0.00",
                    cash: "0.00",
                  },
                ])
              }
            >
              {t.setupAddHead}
            </button>
          </div>
        </section>

        <div className="setup-actions">
          <button className="primary" type="submit" disabled={!valid || saving}>
            {saving ? t.setupSaving : t.setupSubmit}
          </button>
          {!valid && <span className="muted">{t.setupIncomplete}</span>}
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  numeric,
  hint,
  suggest,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  numeric?: boolean;
  hint?: string;
  /** What kind of thing this is, so every screen asking for it shares one list of suggestions. */
  suggest: string;
}): JSX.Element {
  return (
    <div className="field">
      <label>
        {label}
        {required && <span style={{ color: "var(--error-line)" }}> *</span>}
      </label>
      <input
        className={numeric ? "num-input" : undefined}
        data-suggest={suggest}
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

/**
 * Where the school's folder will be made, as the main process will make it
 * (src/server/profiles/data-folder.ts, folderForNewSchool) - shown before the
 * user commits, so a wrongly chosen drive is noticed now.
 */
function schoolFolderPreview(location: string, diseCode: string): string {
  const separator = location.includes("\\") ? "\\" : "/";
  const base = location.replace(/[\\/]+$/, "");
  const dataDir = /(^|[\\/])SMC Accounts$/i.test(base) ? base : `${base}${separator}SMC Accounts`;
  return `${dataDir}${separator}${diseCode.trim() || "…"}`;
}

/**
 * The financial year we are most likely in: April to March, so a date in
 * January still belongs to the year that started the previous April.
 */
function defaultYearLabel(): string {
  const now = new Date();
  const startYear = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}
