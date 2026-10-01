import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import type { AppStateDto, DashboardDto, OpenSchoolDto, SetupStateDto, UserDto } from "../shared/api.js";
import { Dashboard } from "./screens/Dashboard.js";
import { Receipts } from "./screens/Receipts.js";
import { BankCharges } from "./screens/BankCharges.js";
import { Bills } from "./screens/Bills.js";
import { Cheques } from "./screens/Cheques.js";
import { OpeningBalances } from "./screens/OpeningBalances.js";
import { Reports } from "./screens/Reports.js";
import { Reconciliation } from "./screens/Reconciliation.js";
import { Settings } from "./screens/Settings.js";
import { Masters } from "./screens/Masters.js";
import { YearEnd } from "./screens/YearEnd.js";
import { Import } from "./screens/Import.js";
import { Setup } from "./screens/Setup.js";
import { Login } from "./screens/Login.js";
import { Schools } from "./screens/Schools.js";
import { BackupBadge } from "./components/BackupBadge.js";
import { Suggestions } from "./components/Suggestions.js";
import { PhoneticTyping } from "./components/PhoneticTyping.js";
import { flushSuggestions, startSuggestionSync } from "./suggestions/sync.js";
import { LanguageProvider, useStrings } from "./i18n/index.js";
import { PrintRoot, printableReportFromHash } from "./print/PrintRoot.js";
import type { JSX } from "react";

/**
 * The screens, in the order the year is actually entered.
 *
 * Labels are looked up per render rather than stored here, so switching the
 * language re-labels the navigation without any other bookkeeping.
 */
const SCREENS = [
  { id: "dashboard", group: "" },
  { id: "opening", group: "data" },
  { id: "receipts", group: "data" },
  { id: "bills", group: "data" },
  { id: "cheques", group: "data" },
  { id: "bankCharges", group: "data" },
  { id: "reconciliation", group: "data" },
  { id: "reports", group: "printing" },
  { id: "masters", group: "settings" },
  { id: "yearEnd", group: "settings" },
  { id: "import", group: "settings" },
  { id: "settings", group: "settings" },
] as const;

export type ScreenId = (typeof SCREENS)[number]["id"];

/** The provider has to sit above anything that reads the dictionary. */
export function App(): JSX.Element {
  // A print route renders one report and nothing else - no sidebar, no
  // language switching, because the forms are Gujarati whatever the interface
  // is set to. The main process loads this route offscreen to make the PDF.
  const printable = printableReportFromHash(window.location.hash);
  if (printable) return <PrintRoot report={printable} />;

  return (
    <LanguageProvider>
      <Root />
      {/* Once, above every screen: it watches whichever text box has focus. */}
      <Suggestions />
      {/* Gujarati from English letters, in every text box (Ctrl+G). */}
      <PhoneticTyping />
    </LanguageProvider>
  );
}

/** How often an open school checks that its pen drive is still there. */
const STATE_POLL_MS = 3000;

/**
 * Where the application is - signed out, choosing a school, in a school's
 * books - decided by the main process (AppStateDto) and asked for first.
 */
function Root(): JSX.Element {
  const t = useStrings();
  const [state, setState] = useState<AppStateDto | null>(null);
  const [creatingSchool, setCreatingSchool] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await api.getAppState());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // While a school is open, notice at once when its pen drive is pulled out
  // (and when it comes back): the main process checks the folder, this asks.
  const phase = state?.phase;
  useEffect(() => {
    if (phase !== "open" && phase !== "dataMissing") return;
    const timer = window.setInterval(async () => {
      const next = await api.getAppState();
      setState((current) => (current && current.phase !== next.phase ? next : current));
    }, STATE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [phase]);

  if (error !== null) {
    return (
      <div className="state error">
        <p>{t.couldNotLoad}</p>
        <p className="detail num">{error}</p>
      </div>
    );
  }
  if (!state) return <div className="state">{t.loading}</div>;

  switch (state.phase) {
    case "unavailable":
      return (
        <div className="state error">
          <h2>{t.authUnavailableTitle}</h2>
          <p>{t.authUnavailableHint}</p>
          <p className="detail num-inline">{state.reason}</p>
        </div>
      );
    case "signedOut":
      return <Login cloud={state.cloud} onSignedIn={() => void refresh()} />;
    case "chooseSchool":
      return creatingSchool ? (
        <Setup
          newSchool={{ onCancel: () => setCreatingSchool(false) }}
          onDone={() => {
            setCreatingSchool(false);
            void refresh();
          }}
        />
      ) : (
        <Schools
          user={state.user}
          cloud={state.cloud}
          onOpened={() => void refresh()}
          onNewSchool={() => setCreatingSchool(true)}
        />
      );
    case "dataMissing":
      return <DataMissing school={state.school} onChanged={(next) => setState(next)} />;
    case "open":
      if (state.needsSetup) return <Setup onDone={() => void refresh()} />;
      // Keyed by school: switching schools starts every screen afresh.
      return (
        <Shell
          key={state.school.profileId}
          school={state.school}
          user={state.user}
          onSchoolClosed={() => void refresh()}
        />
      );
  }
}

/** The pen drive was pulled out while the school was open. */
function DataMissing({
  school,
  onChanged,
}: {
  school: OpenSchoolDto;
  onChanged: (state: AppStateDto) => void;
}): JSX.Element {
  const t = useStrings();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function reconnect(): Promise<void> {
    setBusy(true);
    const result = await api.reconnectSchool();
    setBusy(false);
    if (result.ok) onChanged(result.data);
    else setFailed(true);
  }

  return (
    <div className="state missing">
      <div className="card missing-card">
        <h2>{t.missingTitle}</h2>
        <p>{t.missingBody(school.schoolNameGu, school.folder)}</p>
        {failed && <p className="issue warning">{t.schoolsNotConnected}</p>}
        <div className="form-actions" style={{ justifyContent: "center" }}>
          <button className="primary" type="button" disabled={busy} onClick={() => void reconnect()}>
            {busy ? t.working : t.missingReconnect}
          </button>
          <button className="ghost" type="button" disabled={busy} onClick={async () => onChanged(await api.closeSchool())}>
            {t.missingClose}
          </button>
        </div>
      </div>
    </div>
  );
}

function Shell({
  school,
  user,
  onSchoolClosed,
}: {
  school: OpenSchoolDto;
  user: UserDto;
  onSchoolClosed: () => void;
}): JSX.Element {
  const t = useStrings();
  // The screen is kept in the URL hash so a particular screen can be opened
  // directly - used by the SMOKE_SHOT check, and by the back button behaving
  // the way people expect.
  const [screen, setScreenState] = useState<ScreenId>(screenFromHash());

  const setScreen = useCallback((next: ScreenId) => {
    window.location.hash = next;
    setScreenState(next);
  }, []);

  useEffect(() => {
    const onHashChange = (): void => setScreenState(screenFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const [dashboard, setDashboard] = useState<DashboardDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Null while we are still asking. A fresh installation has a valid but empty
  // database, so the first question is always "has this been set up?" - asking
  // for a dashboard first would fail with nothing useful to say.
  const [setupState, setSetupState] = useState<SetupStateDto | null>(null);

  /**
   * Reloaded after every write. Every figure in this app is computed from the
   * stored facts, so a stale copy in the renderer would be a wrong number on
   * screen - cheaper to refetch than to try to patch it locally.
   */
  const refresh = useCallback(async () => {
    try {
      const state = await api.getSetupState();
      setSetupState(state);
      if (state.needsSetup) {
        setDashboard(null);
        setError(null);
        return;
      }
      setDashboard(await api.getDashboard());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The suggestions live in this school's books: merge them with the ones the
  // app holds now, and keep saving while the school is open.
  const ready = setupState !== null && !setupState.needsSetup;
  useEffect(() => (ready ? startSuggestionSync() : undefined), [ready]);

  if (error !== null) {
    return (
      <div className="state error">
        <p>{t.couldNotLoad}</p>
        <p className="detail num">{error}</p>
      </div>
    );
  }

  // First run: the only screen that works without a school.
  if (setupState?.needsSetup) {
    return <Setup onDone={() => void refresh()} />;
  }

  if (!dashboard) return <div className="state">{t.loading}</div>;

  const groups = [...new Set(SCREENS.map((item) => item.group))];

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="sidebar-school-card">
          <h1>{dashboard.school.smcLabelGu}</h1>
          <span className="year-badge">
            {t.year} {dashboard.year.label}
          </span>
          <div className="sidebar-school-actions">
            <BackupBadge />
            <button
              className="ghost small"
              type="button"
              onClick={async () => {
                await flushSuggestions();
                await api.closeSchool();
                onSchoolClosed();
              }}
            >
              {t.changeSchool}
            </button>
          </div>
        </div>

        {groups.map((group) => (
          <div className="nav-group" key={group || "root"}>
            {group !== "" && <h2>{groupLabel(group, t)}</h2>}
            {SCREENS.filter((item) => item.group === group).map((item) => {
              const count = countFor(item.id, dashboard);
              return (
                <button
                  key={item.id}
                  className="nav-item"
                  aria-current={screen === item.id}
                  onClick={() => setScreen(item.id)}
                >
                  <span className="nav-item-left">
                    <NavIcon id={item.id} />
                    <span>{screenLabel(item.id, t)}</span>
                  </span>
                  {count !== "" && <span className="count">{count}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <main className="main">
        {screen === "dashboard" && <Dashboard data={dashboard} onNavigate={setScreen} />}
        {screen === "opening" && <OpeningBalances onChanged={refresh} />}
        {screen === "receipts" && <Receipts onChanged={refresh} />}
        {screen === "bills" && <Bills onChanged={refresh} />}
        {screen === "cheques" && <Cheques onChanged={refresh} />}
        {screen === "bankCharges" && <BankCharges onChanged={refresh} />}
        {screen === "reconciliation" && <Reconciliation onChanged={refresh} />}
        {screen === "reports" && <Reports />}
        {screen === "masters" && <Masters onChanged={refresh} />}
        {screen === "yearEnd" && <YearEnd />}
        {screen === "import" && <Import onChanged={refresh} />}
        {screen === "settings" && (
          <Settings data={dashboard} school={school} user={user} onSignedOut={onSchoolClosed} />
        )}
      </main>
    </div>
  );
}

/** Navigation labels for the current language. */
function screenLabel(id: ScreenId, t: ReturnType<typeof useStrings>): string {
  switch (id) {
    case "dashboard":
      return t.navDashboard;
    case "opening":
      return t.navOpening;
    case "receipts":
      return t.navReceipts;
    case "bills":
      return t.navBills;
    case "cheques":
      return t.navCheques;
    case "bankCharges":
      return t.navBankCharges;
    case "reconciliation":
      return t.navReconciliation;
    case "reports":
      return t.navReports;
    case "masters":
      return t.navMasters;
    case "yearEnd":
      return t.navYearEnd;
    case "import":
      return t.navImport;
    case "settings":
      return t.navSettings;
  }
}

function groupLabel(group: string, t: ReturnType<typeof useStrings>): string {
  switch (group) {
    case "data":
      return t.groupData;
    case "printing":
      return t.groupPrinting;
    case "settings":
      return t.groupSettings;
    default:
      return "";
  }
}

/** The screen named in the URL hash, defaulting to the dashboard. */
function screenFromHash(): ScreenId {
  const requested = window.location.hash.replace(/^#/, "");
  const known = SCREENS.some((item) => item.id === requested);
  return known ? (requested as ScreenId) : "dashboard";
}

function countFor(id: ScreenId, dashboard: DashboardDto): string {
  switch (id) {
    case "receipts":
      return String(dashboard.counts.receipts);
    case "bills":
      return String(dashboard.counts.bills);
    case "cheques":
      return String(dashboard.counts.cheques);
    default:
      return "";
  }
}

function NavIcon({ id }: { id: ScreenId }): JSX.Element {
  switch (id) {
    case "dashboard":
      return (
        <svg className="nav-item-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="9" />
          <rect x="14" y="3" width="7" height="5" />
          <rect x="14" y="12" width="7" height="9" />
          <rect x="3" y="16" width="7" height="5" />
        </svg>
      );
    case "opening":
      return (
        <svg className="nav-item-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          <path d="M8 7h8" />
          <path d="M8 11h6" />
        </svg>
      );
    case "receipts":
      return (
        <svg className="nav-item-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="8 12 12 16 16 12" />
          <line x1="12" y1="8" x2="12" y2="16" />
        </svg>
      );
    case "bills":
      return (
        <svg className="nav-item-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    case "cheques":
      return (
        <svg className="nav-item-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
          <line x1="6" y1="16" x2="10" y2="16" />
          <line x1="14" y1="16" x2="18" y2="16" />
        </svg>
      );
    case "bankCharges":
      return (
        <svg className="nav-item-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21h18" />
          <path d="M5 21V9l7-5 7 5v12" />
          <line x1="9" y1="14" x2="15" y2="14" />
        </svg>
      );
    case "reconciliation":
      return (
        <svg className="nav-item-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21h18" />
          <path d="M3 10h18" />
          <path d="M5 10v11" />
          <path d="M19 10v11" />
          <path d="M9 10v11" />
          <path d="M15 10v11" />
          <path d="M12 3 2 10h20L12 3z" />
        </svg>
      );
    case "reports":
      return (
        <svg className="nav-item-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
      );
    case "masters":
      return (
        <svg className="nav-item-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case "yearEnd":
      return (
        <svg className="nav-item-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <path d="m9 16 2 2 4-4" />
        </svg>
      );
    case "import":
      return (
        <svg className="nav-item-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      );
    case "settings":
      return (
        <svg className="nav-item-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
  }
}
