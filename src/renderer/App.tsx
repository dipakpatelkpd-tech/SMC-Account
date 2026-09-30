import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import type { AppStateDto, DashboardDto, OpenSchoolDto, SetupStateDto, UserDto } from "../shared/api.js";
import { Dashboard } from "./screens/Dashboard.js";
import { Receipts } from "./screens/Receipts.js";
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
        <h1>{dashboard.school.smcLabelGu}</h1>
        <p className="year num">
          {t.year} {dashboard.year.label}
        </p>
        <div className="sidebar-school">
          <BackupBadge />
          <button
            className="ghost small"
            type="button"
            onClick={async () => {
              await api.closeSchool();
              onSchoolClosed();
            }}
          >
            {t.changeSchool}
          </button>
        </div>

        {groups.map((group) => (
          <div className="nav-group" key={group || "root"}>
            {group !== "" && <h2>{groupLabel(group, t)}</h2>}
            {SCREENS.filter((item) => item.group === group).map((item) => (
              <button
                key={item.id}
                className="nav-item"
                aria-current={screen === item.id}
                onClick={() => setScreen(item.id)}
              >
                <span>{screenLabel(item.id, t)}</span>
                <span className="count">{countFor(item.id, dashboard)}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      <main className="main">
        {screen === "dashboard" && <Dashboard data={dashboard} onNavigate={setScreen} />}
        {screen === "opening" && <OpeningBalances onChanged={refresh} />}
        {screen === "receipts" && <Receipts onChanged={refresh} />}
        {screen === "bills" && <Bills onChanged={refresh} />}
        {screen === "cheques" && <Cheques onChanged={refresh} />}
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
