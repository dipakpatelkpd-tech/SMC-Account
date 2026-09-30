/**
 * The contract between the user interface and the data.
 *
 * This interface is the seam that keeps a future website cheap. The React
 * screens depend on THIS, never on `window.electron` or on Prisma:
 *
 *   desktop today   renderer -> IPC   -> main process -> engine -> SQLite
 *   web later       browser  -> fetch -> HTTP server  -> engine -> SQLite/Postgres
 *
 * Both are implementations of AccountsApi. The screens, the engine and the
 * schema do not change between them.
 *
 * Everything crossing this boundary is JSON-safe on purpose. Electron's IPC
 * could carry a Map or a Date through structured clone, but HTTP cannot, so
 * using only plain objects, arrays, strings and numbers keeps the web
 * implementation a drop-in rather than a rewrite.
 *
 * Money is always an integer of paise. Dates are always ISO "YYYY-MM-DD".
 */
import type {
  Annexure9,
  Annexure10,
  DayBalance,
  Ledger,
} from "../engine/types.js";
import type { Rojmel } from "../engine/rojmel.js";
import type {
  BillRegisterRow,
  ChequeRegisterRow,
  PatrakDRow,
  Voucher,
} from "../engine/registers.js";
import type { Issue } from "../engine/validation.js";
import type { ChequeType } from "../lib/types.js";
import type { LegacyImportPlan } from "./legacy.js";
import type { ReportLayout } from "./report-layout.js";
import type { SuggestionRow } from "./suggestions.js";

// ------------------------------------------------------------------ reading

export interface SchoolDto {
  nameGu: string;
  smcLabelGu: string;
  diseCode: string;
  clusterGu: string;
  talukaGu: string;
  districtGu: string;
  programmeGu: string;
  memberSecretaryGu: string;
  memberSecretaryShortGu: string;
  memberSecretaryMobile: string | null;
  bankNameGu: string;
  bankBranchGu: string;
  bankAccountNo: string;
}

export interface FinancialYearDto {
  id: number;
  label: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface GrantHeadDto {
  id: number;
  code: string;
  nameGu: string;
  reportOrder: number;
  active: boolean;
}

export interface OpeningBalanceDto {
  grantHeadId: number;
  headCode: string;
  headNameGu: string;
  bankPaise: number;
  cashPaise: number;
}

export interface ReceiptDto {
  id: number;
  date: string;
  grantHeadId: number;
  headNameGu: string;
  amountPaise: number;
  receivedFromGu: string;
  modeGu: string;
  bankLabelGu: string;
  ddChequeNo: string | null;
  ddChequeDate: string | null;
  allotmentOrderNo: string | null;
  allotmentOrderDate: string | null;
  depositedDate: string | null;
  creditedDate: string | null;
  remarksGu: string | null;
}

export interface BillDto {
  id: number;
  voucherNo: number;
  billNo: string | null;
  billDate: string;
  descriptionGu: string;
  vendorGu: string;
  grantHeadId: number;
  headNameGu: string;
  amountPaise: number;
  deductionPaise: number;
  /** Computed: amountPaise − deductionPaise. Never stored. */
  netPaise: number;
  quantityGu: string | null;
  remarksGu: string | null;
  chequeId: number | null;
  chequeNo: number | null;
}

export interface ChequeAllocationDto {
  grantHeadId: number;
  headCode: string;
  headNameGu: string;
  amountPaise: number;
}

export interface ChequeDto {
  id: number;
  chequeNo: number;
  chequeDate: string;
  cashbookDate: string;
  cashedDate: string | null;
  voucherNo: number | null;
  payeeGu: string;
  purposeGu: string;
  type: ChequeType;
  remarksGu: string | null;
  /** Computed from the linked bills, or typed for a grant return. */
  allocation: ChequeAllocationDto[];
  /** Computed: the total of the allocation. Never stored. */
  amountPaise: number;
  billCount: number;
}

export interface ReconciliationDto {
  chequesIssuedNotCashedPaise: number;
  creditsInBankNotInCashbookPaise: number;
  depositsNotYetCreditedPaise: number;
  bankChargesNotInCashbookPaise: number;
  passbookBalancePaise: number;
}

// --------------------------------------------------------- legacy import

/**
 * What the importer read from an old workbook, and what it is unsure about.
 *
 * The plan travels to the screen and back: the school reviews it, chooses the
 * grant head for each bill and the type of each cheque, and the same plan is
 * handed to applyLegacyImport. Sending it back rather than re-reading the file
 * means what gets written is exactly what was reviewed.
 */
export interface LegacyImportPreviewDto {
  plan: LegacyImportPlan;
  /** Each head name in the file, matched to one of this school's heads if it can be. */
  headMatches: { fileName: string; grantHeadId: number | null }[];
  /** True when the year already holds entries; the import would be refused. */
  yearHasData: boolean;
}

export interface LegacyImportSelection {
  plan: LegacyImportPlan;
  /** Only the rows listed here are imported, each with its head decided. */
  receipts: { sourceRow: number; grantHeadId: number }[];
  bills: { sourceRow: number; grantHeadId: number }[];
  cheques: { sourceRow: number; type: ChequeType; grantHeadId: number | null }[];
}

export interface LegacyImportResultDto {
  receipts: number;
  bills: number;
  cheques: number;
  /** Rows that were asked for but could not be written, and why. */
  skipped: { kind: "receipt" | "bill" | "cheque"; sourceRow: number; reasonGu: string }[];
}

// ------------------------------------------------------------ year closing

/**
 * What closing this year would carry into the next one.
 *
 * Shown before anything is written. Closing a year is the one action in this
 * application that creates a second year of books, so the school sees the exact
 * opening balances it will produce, and what is standing in the way.
 */
export interface YearEndPreviewDto {
  year: FinancialYearDto;
  /** The year that would be created: this label + 1. */
  suggestedNextLabel: string;
  /** Already-existing years, so a label cannot be reused by accident. */
  existingLabels: string[];
  /** Cash in hand on 31 March. Must be zero to close - see closeYear. */
  cashPaise: number;
  rows: {
    grantHeadId: number;
    headCode: string;
    headNameGu: string;
    /** Becomes next year's opening bank balance for this head. */
    closingPaise: number;
  }[];
  totalClosingPaise: number;
  /** Validation errors in this year. Closing is refused while any remain. */
  blocking: Issue[];
}

export interface CloseYearInput {
  nextLabel: string;
}

// -------------------------------------------------------------------- setup

/** Whether this installation has been set up, and what it holds. */
export interface SetupStateDto {
  needsSetup: boolean;
  schoolNameGu: string | null;
  yearLabel: string | null;
}

export interface SetupInput {
  school: {
    nameGu: string;
    smcLabelGu: string;
    diseCode: string;
    clusterGu: string;
    talukaGu: string;
    districtGu: string;
    programmeGu: string;
    memberSecretaryGu: string;
    memberSecretaryShortGu: string;
    memberSecretaryMobile?: string | null;
  };
  bank: { bankNameGu: string; branchGu: string; accountNo: string };
  /** startDate and endDate may be blank; they are derived from the label. */
  year: { label: string; startDate: string; endDate: string };
  grantHeads: { code: string; nameGu: string; reportOrder: number }[];
  openingBalances: { code: string; bankPaise: number; cashPaise: number }[];
}

// ------------------------------------------------------------------ writing

export interface ReceiptInput {
  date: string;
  grantHeadId: number;
  amountPaise: number;
  receivedFromGu: string;
  modeGu: string;
  bankLabelGu: string;
  ddChequeNo?: string | null;
  ddChequeDate?: string | null;
  allotmentOrderNo?: string | null;
  allotmentOrderDate?: string | null;
  depositedDate?: string | null;
  creditedDate?: string | null;
  remarksGu?: string | null;
}

export interface BillInput {
  voucherNo: number;
  billNo: string | null;
  billDate: string;
  descriptionGu: string;
  vendorGu: string;
  grantHeadId: number;
  amountPaise: number;
  deductionPaise: number;
  quantityGu?: string | null;
  remarksGu?: string | null;
  /** The cheque that pays this bill, if it is already known. */
  chequeId?: number | null;
}

export interface ChequeInput {
  chequeNo: number;
  chequeDate: string;
  cashbookDate: string;
  cashedDate?: string | null;
  voucherNo?: number | null;
  payeeGu: string;
  purposeGu: string;
  type: ChequeType;
  remarksGu?: string | null;
  /** Bills this cheque pays. Must be empty for a grant return. */
  billIds: number[];
  /**
   * The per-head split. Only read for a grant return - for the other two types
   * it is computed from the bills and anything passed here is ignored.
   */
  typedAllocation?: { grantHeadId: number; amountPaise: number }[];
}

/**
 * The school's own details, as the masters screen edits them.
 *
 * The same shape it is read back as: every field on the screen is editable, so
 * a separate input type would only be the DTO copied out by hand.
 */
export type SchoolInput = SchoolDto;

export interface GrantHeadInput {
  nameGu: string;
  reportOrder: number;
  active: boolean;
}

export interface OpeningBalanceInput {
  grantHeadId: number;
  bankPaise: number;
  cashPaise: number;
}

// ------------------------------------------------------------------ reports

/** Everything the dashboard shows, in one round trip. */
export interface DashboardDto {
  school: SchoolDto;
  year: FinancialYearDto;
  annexure10: Annexure10;
  yearEnd: DayBalance;
  counts: { receipts: number; bills: number; cheques: number; unpaidBills: number };
  issues: Issue[];
}

export interface GrantRegisterRowDto {
  receipt: ReceiptDto;
  spentPaise: number;
  savingPaise: number;
}

/**
 * A write that the domain rules rejected.
 *
 * Returned rather than thrown so the renderer can show the Gujarati message
 * beside the offending field instead of an error dialog.
 */
export interface ApiFailure {
  ok: false;
  issues: Issue[];
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

// -------------------------------------------------- account, schools, backup

/** Which cloud this build talks to. "fake" only ever appears in development. */
export interface CloudInfoDto {
  kind: "supabase" | "fake";
  /** Shown under the login form in development, so nobody mistakes it for the real thing. */
  note: string | null;
}

export interface UserDto {
  id: string;
  email: string;
}

/** The school whose books are open. */
export interface OpenSchoolDto {
  profileId: string;
  schoolNameGu: string;
  diseCode: string;
  /** Where its data folder is right now, e.g. F:\SMC Accounts\24160203401. */
  folder: string;
}

/**
 * Where the application is: the one question the renderer asks first.
 *
 *   unavailable   cannot run at all (no cloud settings in this build)
 *   signedOut     show the login
 *   chooseSchool  signed in, no school open: show the school list
 *   open          a school's books are open (needsSetup: its database is empty)
 *   dataMissing   the open school's pen drive was pulled out
 */
export type AppStateDto =
  | { phase: "unavailable"; reason: string }
  | { phase: "signedOut"; cloud: CloudInfoDto }
  | { phase: "chooseSchool"; cloud: CloudInfoDto; user: UserDto }
  | { phase: "open"; cloud: CloudInfoDto; user: UserDto; school: OpenSchoolDto; needsSetup: boolean }
  | { phase: "dataMissing"; cloud: CloudInfoDto; user: UserDto; school: OpenSchoolDto };

/**
 *   ready         its folder is reachable on this PC
 *   notConnected  this PC knows it, but the pen drive is not in
 *   notOnThisPc   the account has it, this PC has never opened it
 */
export type SchoolAvailability = "ready" | "notConnected" | "notOnThisPc";

export interface SchoolListItemDto {
  profileId: string;
  schoolNameGu: string;
  diseCode: string;
  folder: string | null;
  availability: SchoolAvailability;
  lastOpenedAt: string | null;
}

export interface SchoolListDto {
  schools: SchoolListItemDto[];
  /** False when the account's list could not be fetched (offline). */
  cloudReachable: boolean;
  /** Unencrypted books from before schools had their own folders, if any. */
  legacyBooks: { schoolNameGu: string | null; developmentCopy: boolean } | null;
}

/** What a chosen folder contains. */
export interface FolderInspectionDto {
  folder: string;
  schools: {
    profileId: string;
    schoolNameGu: string;
    diseCode: string;
    folder: string;
    /** False when the folder belongs to a different account. */
    ownedByMe: boolean;
  }[];
}

export type OpenSchoolResultDto =
  | { opened: true; state: AppStateDto }
  /** Another PC's lock is on the folder; open anyway with force. */
  | { opened: false; lockedBy: { deviceName: string; openedAt: string } };

export type BackupStateDto =
  | "upToDate"
  | "pending"
  | "uploading"
  | "offline"
  | "failed"
  | "signedOut"
  | "never";

export interface BackupStatusDto {
  state: BackupStateDto;
  pendingSince: string | null;
  lastBackupAt: string | null;
  lastBackupDevice: string | null;
  lastError: string | null;
}

export interface CloudBackupDto {
  id: string;
  createdAt: string;
  sizeBytes: number;
  deviceName: string;
  appVersion: string;
}

export type FolderPurpose = "newSchool" | "openSchool" | "restoreSchool";

/**
 * Everything before and around a school's books: the account on this PC, the
 * list of schools, where their data lives, and their cloud backups.
 *
 * Answered from the moment the app starts, with or without a school open.
 */
export interface SessionApi {
  getAppState(): Promise<AppStateDto>;

  signIn(email: string, password: string): Promise<ApiResult<AppStateDto>>;
  /** needsCode: a 6-digit code was emailed; call verifySignUp with it. */
  signUp(email: string, password: string): Promise<ApiResult<{ needsCode: boolean }>>;
  verifySignUp(email: string, code: string): Promise<ApiResult<AppStateDto>>;
  requestPasswordReset(email: string): Promise<ApiResult<null>>;
  completePasswordReset(email: string, code: string, password: string): Promise<ApiResult<AppStateDto>>;
  signOut(): Promise<AppStateDto>;

  listSchools(): Promise<SchoolListDto>;
  /** A folder dialog. Returns null when cancelled. */
  pickFolder(purpose: FolderPurpose): Promise<string | null>;
  inspectFolder(folder: string): Promise<ApiResult<FolderInspectionDto>>;
  /** Create a school's data folder inside `folder`, set it up and open it. */
  createSchool(folder: string, setup: SetupInput): Promise<ApiResult<AppStateDto>>;
  /** `folder` when the user just picked it; otherwise the remembered place is searched. */
  openSchool(
    profileId: string,
    options?: { folder?: string; force?: boolean },
  ): Promise<ApiResult<OpenSchoolResultDto>>;
  closeSchool(): Promise<AppStateDto>;
  /** Remove from this PC's list only. The data and the cloud copy are untouched. */
  forgetSchool(profileId: string): Promise<SchoolListDto>;
  /** After the pen drive is put back in. */
  reconnectSchool(): Promise<ApiResult<AppStateDto>>;
  /** Open the school's data folder in the file manager. */
  showDataFolder(): Promise<void>;

  getBackupStatus(): Promise<BackupStatusDto>;
  backupNow(): Promise<ApiResult<BackupStatusDto>>;
  listCloudBackups(profileId: string): Promise<ApiResult<CloudBackupDto[]>>;
  /** Replace the open school's books with a cloud backup. The current books are kept locally first. */
  restoreBackup(backupId: string): Promise<ApiResult<AppStateDto>>;
  /** Bring a school back from the cloud into a new folder - the lost pen drive case. */
  restoreSchool(profileId: string, backupId: string, folder: string): Promise<ApiResult<AppStateDto>>;
  /** Encrypt the pre-profile books into a school folder inside `folder`, and open it. */
  moveLegacyBooks(folder: string): Promise<ApiResult<AppStateDto>>;
}

// --------------------------------------------------------------- the contract

/**
 * What can be answered before anything exists.
 *
 * Kept separate because these two are the only calls a brand-new installation
 * can make: there is no school, no year, and nothing for BooksApi to read. The
 * main process registers these always and the rest only once a year exists.
 */
export interface SetupApi {
  getSetupState(): Promise<SetupStateDto>;
  completeSetup(input: SetupInput): Promise<ApiResult<SetupStateDto>>;
}

/** Everything that needs a school and an open financial year. */
export interface BooksApi {
  // masters
  getDashboard(): Promise<DashboardDto>;
  getSchool(): Promise<SchoolDto>;
  listFinancialYears(): Promise<FinancialYearDto[]>;
  listGrantHeads(): Promise<GrantHeadDto[]>;
  saveSchool(input: SchoolInput): Promise<ApiResult<SchoolDto>>;
  createGrantHead(input: { nameGu: string }): Promise<ApiResult<GrantHeadDto>>;
  updateGrantHead(id: number, input: GrantHeadInput): Promise<ApiResult<GrantHeadDto>>;
  /** Refused once the head has been used; deactivate it instead. */
  deleteGrantHead(id: number): Promise<ApiResult<null>>;

  // opening balances
  listOpeningBalances(): Promise<OpeningBalanceDto[]>;
  saveOpeningBalance(input: OpeningBalanceInput): Promise<ApiResult<OpeningBalanceDto>>;

  // receipts
  listReceipts(): Promise<ReceiptDto[]>;
  createReceipt(input: ReceiptInput): Promise<ApiResult<ReceiptDto>>;
  updateReceipt(id: number, input: ReceiptInput): Promise<ApiResult<ReceiptDto>>;
  deleteReceipt(id: number): Promise<ApiResult<null>>;

  // bills
  listBills(): Promise<BillDto[]>;
  createBill(input: BillInput): Promise<ApiResult<BillDto>>;
  updateBill(id: number, input: BillInput): Promise<ApiResult<BillDto>>;
  deleteBill(id: number): Promise<ApiResult<null>>;

  // cheques
  listCheques(): Promise<ChequeDto[]>;
  createCheque(input: ChequeInput): Promise<ApiResult<ChequeDto>>;
  updateCheque(id: number, input: ChequeInput): Promise<ApiResult<ChequeDto>>;
  deleteCheque(id: number): Promise<ApiResult<null>>;

  // reconciliation
  getReconciliation(): Promise<ReconciliationDto | null>;
  saveReconciliation(input: ReconciliationDto): Promise<ApiResult<ReconciliationDto>>;

  // year closing
  getYearEndPreview(): Promise<YearEndPreviewDto>;
  closeYear(input: CloseYearInput): Promise<ApiResult<FinancialYearDto>>;
  /** Make another year the one every screen shows. Printing an old year needs it. */
  openYear(id: number): Promise<ApiResult<FinancialYearDto>>;

  // legacy import
  /** Ask the user for an old workbook. Returns null when they cancelled. */
  pickLegacyFile(): Promise<ApiResult<string | null>>;
  previewLegacyImport(filePath: string): Promise<ApiResult<LegacyImportPreviewDto>>;
  applyLegacyImport(selection: LegacyImportSelection): Promise<ApiResult<LegacyImportResultDto>>;

  // printing
  /**
   * Render a report to PDF and save it. Returns the path written, or null when
   * the user cancelled the save dialog.
   */
  exportPdf(report: PrintableReportId): Promise<ApiResult<string | null>>;
  /**
   * Save a report - or the whole year, with "all" - as an Excel workbook.
   * Returns the path written, or null when the user cancelled the save dialog.
   */
  exportExcel(report: ExcelReportId): Promise<ApiResult<string | null>>;

  // report layouts
  /** The school's layout for a report; an empty one when it prints the default. */
  getReportLayout(report: PrintableReportId): Promise<ReportLayout>;
  /** Save it. Saving an empty layout puts the report back to its default. */
  saveReportLayout(report: PrintableReportId, layout: ReportLayout): Promise<ApiResult<ReportLayout>>;

  // suggestions
  /**
   * Merge the suggestions the app holds with the ones saved in this school's
   * books, save the result there, and return it. Called when a school opens
   * and after suggestions change; the pen drive carries them to other PCs.
   *
   * Not in MUTATING_METHODS on purpose: a suggestion is a convenience, not a
   * change to the accounts, and a backup owed after every typed word would be
   * a backup on every keystroke.
   */
  syncSuggestions(rows: SuggestionRow[]): Promise<SuggestionRow[]>;

  // reports
  getRojmel(): Promise<Rojmel>;
  getChequeRegister(): Promise<ChequeRegisterRow[]>;
  getBillRegister(): Promise<BillRegisterRow[]>;
  getVouchers(): Promise<Voucher[]>;
  getPatrakD(): Promise<PatrakDRow[]>;
  getAnnexure10(): Promise<Annexure10>;
  getAnnexure9(): Promise<Annexure9>;
  getBalances(): Promise<DayBalance[]>;
  getLedgers(): Promise<Ledger[]>;
  getGrantRegister(): Promise<GrantRegisterRowDto[]>;
  getValidation(): Promise<Issue[]>;
}

export type AccountsApi = SessionApi & SetupApi & BooksApi;

/** Every method name, used to wire the IPC channels without repeating them. */
/** Reports that currently have a print layout. */
export const PRINTABLE_REPORTS = [
  "rojmel",
  "khatavahi",
  "grantRegister",
  "chequeRegister",
  "billRegister",
  "vouchers",
  "patrakD",
  "annexure9",
  "annexure10",
] as const;
export type PrintableReportId = (typeof PRINTABLE_REPORTS)[number];

/** Excel covers the same reports, plus "all" for one workbook of everything. */
export const EXCEL_REPORTS = ["all", ...PRINTABLE_REPORTS] as const;
export type ExcelReportId = (typeof EXCEL_REPORTS)[number];

/** SessionApi's methods, answered by the app controller rather than the books. */
export const SESSION_METHODS = [
  "getAppState",
  "signIn",
  "signUp",
  "verifySignUp",
  "requestPasswordReset",
  "completePasswordReset",
  "signOut",
  "listSchools",
  "pickFolder",
  "inspectFolder",
  "createSchool",
  "openSchool",
  "closeSchool",
  "forgetSchool",
  "reconnectSchool",
  "showDataFolder",
  "getBackupStatus",
  "backupNow",
  "listCloudBackups",
  "restoreBackup",
  "restoreSchool",
  "moveLegacyBooks",
] as const satisfies readonly (keyof SessionApi)[];

/**
 * The calls that change the books. Each success marks a cloud backup as owed.
 * A method missing here would change data without it ever being backed up, so
 * the test in tests/app-controller.test.ts checks every BooksApi write is listed.
 */
export const MUTATING_METHODS = [
  "completeSetup",
  "saveSchool",
  "createGrantHead",
  "updateGrantHead",
  "deleteGrantHead",
  "saveOpeningBalance",
  "createReceipt",
  "updateReceipt",
  "deleteReceipt",
  "createBill",
  "updateBill",
  "deleteBill",
  "createCheque",
  "updateCheque",
  "deleteCheque",
  "saveReconciliation",
  "closeYear",
  "applyLegacyImport",
  "saveReportLayout",
] as const satisfies readonly (keyof (SetupApi & BooksApi))[];

export const API_METHODS = [
  ...SESSION_METHODS,
  "getSetupState",
  "completeSetup",
  "getDashboard",
  "getSchool",
  "listFinancialYears",
  "listGrantHeads",
  "saveSchool",
  "createGrantHead",
  "updateGrantHead",
  "deleteGrantHead",
  "listOpeningBalances",
  "saveOpeningBalance",
  "listReceipts",
  "createReceipt",
  "updateReceipt",
  "deleteReceipt",
  "listBills",
  "createBill",
  "updateBill",
  "deleteBill",
  "listCheques",
  "createCheque",
  "updateCheque",
  "deleteCheque",
  "pickLegacyFile",
  "previewLegacyImport",
  "applyLegacyImport",
  "getYearEndPreview",
  "closeYear",
  "openYear",
  "getReconciliation",
  "saveReconciliation",
  "exportPdf",
  "exportExcel",
  "getReportLayout",
  "saveReportLayout",
  "syncSuggestions",
  "getRojmel",
  "getChequeRegister",
  "getBillRegister",
  "getVouchers",
  "getPatrakD",
  "getAnnexure10",
  "getAnnexure9",
  "getBalances",
  "getLedgers",
  "getGrantRegister",
  "getValidation",
] as const satisfies readonly (keyof AccountsApi)[];

export type ApiMethod = (typeof API_METHODS)[number];

/** The IPC channel a method is exposed on. */
export const IPC_PREFIX = "accounts:";
export function channelFor(method: ApiMethod): string {
  return `${IPC_PREFIX}${method}`;
}
