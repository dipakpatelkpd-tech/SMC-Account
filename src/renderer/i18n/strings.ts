/**
 * Interface strings, in Gujarati and English.
 *
 * Both dictionaries implement the same `Strings` interface, so a translation
 * that is missing or misspelled is a compile error rather than a blank label
 * discovered by a user.
 *
 * SCOPE — this covers the INTERFACE only. Two things deliberately stay Gujarati
 * whichever language is selected:
 *
 *  1. **The printed reports.** Rojmel, Khatavahi, the registers and the
 *     annexures are statutory forms submitted to the CRC/BRC for audit. An
 *     English one would be rejected. See CLAUDE.md.
 *  2. **The school's own data** - grant head names, vendor names, cheque
 *     purposes, bill descriptions. Those are facts the school typed, not
 *     interface chrome, and translating them would be inventing data.
 *
 * So English mode gives an English shell around Gujarati content. That is the
 * honest boundary: it helps someone who cannot read Gujarati navigate and
 * operate the app, without pretending the books are in English.
 */

export interface Strings {
  // ------------------------------------------------------------ app shell
  appName: string;
  year: string;
  groupData: string;
  groupPrinting: string;
  groupSettings: string;
  navDashboard: string;
  navOpening: string;
  navReceipts: string;
  navBills: string;
  navCheques: string;
  navBankCharges: string;
  bankChargesTitle: string;
  bankChargesSubtitle: string;
  bankChargesNote: string;
  newBankCharge: string;
  editBankCharge: string;
  noBankCharges: string;
  bankChargeDescription: string;
  bankChargeDefaultDescription: string;
  confirmDeleteBankCharge: (date: string, head: string) => string;
  navReports: string;
  navReconciliation: string;
  navMasters: string;
  navYearEnd: string;
  navImport: string;
  navSettings: string;

  // --------------------------------------------------------------- common
  loading: string;
  calculating: string;
  couldNotLoad: string;
  save: string;
  cancel: string;
  edit: string;
  delete: string;
  total: string;
  date: string;
  amount: string;
  remarks: string;
  suggestRemove: string;
  phoneticOn: string;
  phoneticOff: string;
  phoneticTitle: string;
  phoneticHelp: string;
  phoneticHelpNote: string;
  suggestHelp: string;
  grantHead: string;
  grantHeadNewOption: string;
  grantHeadNewPlaceholder: string;
  grantHeadNewAdd: string;
  bank: string;
  cash: string;
  none: string;
  noIssues: string;
  errorCount: (count: number) => string;

  // ------------------------------------------------------------ dashboard
  diseCode: string;
  closingBank: string;
  closingCash: string;
  receivedInYear: string;
  totalSpent: string;
  annexure10Title: string;
  colParticulars: string;
  colOpening: string;
  colReceived: string;
  colTotal: string;
  colSpent: string;
  colReturned: string;
  colTotalOut: string;
  colClosing: string;
  validation: string;
  unpaidBillsNote: (count: number) => string;
  viewBills: string;

  // ----------------------------------------------------- opening balances
  openingTitle: string;
  openingSubtitle: string;

  // -------------------------------------------------------------- receipts
  receiptsTitle: string;
  receiptsSubtitle: string;
  newReceipt: string;
  editReceipt: string;
  noReceipts: string;
  cashbookDate: string;
  receivedFrom: string;
  mode: string;
  bankName: string;
  creditedDate: string;
  confirmDeleteReceipt: (date: string, head: string) => string;

  // ----------------------------------------------------------------- bills
  billsTitle: string;
  billsSubtitle: string;
  newBill: string;
  editBill: string;
  noBills: string;
  voucher: string;
  voucherNo: string;
  billNo: string;
  billDate: string;
  billDescription: string;
  billFrom: string;
  billAmount: string;
  deduction: string;
  netAmount: string;
  netAmountShort: string;
  voucherTotal: (voucherNo: number) => string;
  linkedToCheque: (chequeNo: number) => string;
  notLinkedToCheque: string;
  billsSummary: (count: number) => string;
  deductionTooLarge: string;
  confirmDeleteBill: (label: string) => string;

  // --------------------------------------------------------------- cheques
  chequesTitle: string;
  chequesSubtitle: string;
  newCheque: string;
  editCheque: (chequeNo: number) => string;
  noCheques: string;
  chequeNo: string;
  chequeDate: string;
  cashedDate: string;
  chequeType: string;
  payee: string;
  chequePurpose: string;
  allocation: string;
  whichBillsPaid: string;
  noBillsAvailable: string;
  whichHeadsReturned: string;
  computedChequeAmount: string;
  totalChequeAmount: string;
  confirmDeleteCheque: (chequeNo: number) => string;
  typeReimbursement: string;
  typeDirect: string;
  typeGrantReturn: string;

  // --------------------------------------------------------------- reports
  reportsTitle: string;
  reportsSubtitle: string;
  tabBalances: string;
  tabLedgers: string;
  tabGrants: string;
  tabAnnexure9: string;
  balancesTitle: string;
  grantRegisterTitle: string;
  colCredit: string;
  colDebit: string;
  colCreditBalance: string;
  colDebitBalance: string;
  colDescription: string;
  colSpentOfReceipt: string;
  colSavingOfReceipt: string;
  colPurpose: string;
  reconciliationTitle: string;
  recCashbook: string;
  recUncashed: string;
  recCreditsNotInBook: string;
  recDepositsNotCredited: string;
  recBankCharges: string;
  recComputedPassbook: string;
  recEnteredPassbook: string;
  recMismatch: string;
  reconciliationSubtitle: string;
  recCashbookNote: string;
  recSubtotal: string;
  recFromCheques: string;
  recUseComputed: string;
  recComputedNote: string;
  recEnteredNote: string;
  recAgrees: string;
  recDifference: string;

  // -------------------------------------------------------------- printing
  tabAnnexure10: string;
  tabRojmel: string;
  tabGrantRegisterPrint: string;
  tabChequeRegister: string;
  tabBillRegister: string;
  tabVouchers: string;
  tabPatrakD: string;
  groupPrintable: string;
  groupFigures: string;
  rojmelPages: (count: number) => string;
  savePdf: string;
  savingPdf: string;
  saveExcel: string;
  saveExcelAll: string;
  savingExcel: string;
  excelSaved: (path: string) => string;
  pdfSaved: (path: string) => string;
  printPreviewNote: string;

  // --------------------------------------------------------- report layout
  layoutEdit: string;
  layoutEditNote: string;
  layoutDone: string;
  layoutSave: string;
  layoutSaving: string;
  layoutSaved: string;
  layoutUndo: string;
  layoutDiscard: string;
  layoutDiscardConfirm: string;
  layoutHint: string;
  layoutWholeReport: string;
  layoutFont: string;
  layoutFontDefault: string;
  layoutSize: string;
  layoutPaddingX: string;
  layoutPaddingY: string;
  layoutRowHeight: string;
  layoutAuto: string;
  layoutResetWidths: string;
  layoutResetAll: string;
  layoutSelection: string;
  layoutNothingSelected: string;
  layoutColumn: (name: string) => string;
  layoutHeadRow: string;
  layoutApplyTo: string;
  layoutScopeCell: string;
  layoutScopeRow: string;
  layoutScopeColumn: string;
  layoutWidth: string;
  layoutHighlight: string;
  layoutNoHighlight: string;
  layoutOtherColour: string;
  layoutWeight: string;
  layoutWeightDefault: string;
  layoutBold: string;
  layoutRegular: string;
  layoutGapAfter: string;
  layoutClearFormat: string;
  layoutOverflow: (sheets: string) => string;
  layoutCellsOverflow: (count: number) => string;
  layoutPart: (name: string) => string;
  layoutPartHeight: string;
  layoutPartWidth: string;
  layoutSelectParent: (name: string) => string;
  layoutThisRowHeight: string;
  layoutFillDefault: string;
  layoutFillBlank: string;
  layoutFillHelp: string;
  layoutAlign: string;
  layoutFormColours: string;
  layoutNoColour: string;
  layoutPickFromScreen: string;
  layoutAlignLeft: string;
  layoutAlignCenter: string;
  layoutAlignRight: string;
  layoutPlain: string;
  layoutRojmelNote: string;
  layoutTextColour: string;
  layoutGroupNote: string;
  layoutLineColour: string;
  layoutColourDefault: string;
  layoutColourHelp: string;
  printOpen: string;
  printTitle: (report: string) => string;
  printPaper: string;
  printOrientation: string;
  printPortrait: string;
  printLandscape: string;
  printScale: string;
  printFit: string;
  printMargin: string;
  printDefaultIs: (text: string) => string;
  printReset: string;
  printSave: string;
  printSaving: string;
  printSaved: string;
  printNow: string;
  printing: string;
  printSent: string;
  printClose: string;
  printSheets: (count: number) => string;
  printUnsavedNote: string;
  printDiscardConfirm: string;
  printPaperSizeMm: (width: number, height: number) => string;
  printRememberNote: string;
  layoutExcelNote: string;
  layoutUnsavedExport: string;
  mm: string;
  pt: string;

  // ----------------------------------------------------------------- setup
  setupTitle: string;
  setupSubtitle: string;
  setupSchoolSection: string;
  setupSchoolName: string;
  setupCluster: string;
  setupTaluka: string;
  setupDistrict: string;
  setupHeadTeacher: string;
  setupHeadTeacherShort: string;
  setupHeadTeacherShortHint: string;
  setupMobile: string;
  setupBankSection: string;
  setupBranch: string;
  setupAccountNo: string;
  setupYearSection: string;
  setupYearLabel: string;
  setupYearHint: string;
  setupYearRange: string;
  setupHeadsSection: string;
  setupHeadsHint: string;
  setupOpeningBank: string;
  setupOpeningCash: string;
  setupAddHead: string;
  setupSubmit: string;
  setupSaving: string;
  setupIncomplete: string;

  // --------------------------------------------------------------- masters
  mastersTitle: string;
  mastersSubtitle: string;
  mastersSmcLabel: string;
  mastersSmcLabelHint: string;
  mastersProgramme: string;
  mastersProgrammeHint: string;
  mastersHeadsSection: string;
  mastersHeadsHint: string;
  mastersOrder: string;
  mastersActive: string;
  mastersInUse: string;
  mastersClosed: string;
  mastersMoveUp: string;
  mastersMoveDown: string;
  mastersAddHead: string;
  mastersNewHeadPlaceholder: string;
  mastersConfirmDelete: (name: string) => string;

  // --------------------------------------------------------- legacy import
  importTitle: string;
  importSubtitle: string;
  importExplainer: string;
  importChooseFile: string;
  importYearNotEmpty: string;
  importReceipts: (count: number) => string;
  importBills: (count: number) => string;
  importCheques: (count: number) => string;
  importInclude: string;
  importFileHead: string;
  importNotes: string;
  importFromBills: string;
  importMissingHeads: (count: number) => string;
  importRun: string;
  importConfirm: (receipts: number, bills: number, cheques: number) => string;
  importDone: (receipts: number, bills: number, cheques: number) => string;
  importSourceRow: string;
  importSkippedReason: string;

  // ------------------------------------------------------------ year closing
  yearEndTitle: string;
  yearEndSubtitle: string;
  yearEndClosingSection: (label: string, date: string) => string;
  yearEndClosing: string;
  yearEndNextOpening: string;
  yearEndNextOpeningHint: string;
  yearEndOpeningChanged: string;
  yearEndOpeningReset: string;
  yearEndCloseSection: string;
  yearNextLabel: string;
  yearLabelTaken: string;
  yearCloseExplainer: string;
  yearCloseButton: string;
  yearConfirmClose: (from: string, to: string) => string;
  yearBlockedByErrors: string;
  yearBlockedByCash: string;
  yearAlreadyClosed: (label: string) => string;
  yearListSection: string;
  yearListHint: string;
  yearStatus: string;
  yearOpen: string;
  yearClosed: string;
  yearCurrent: string;
  yearSwitchTo: string;

  // -------------------------------------------------------------- settings
  settingsTitle: string;
  settingsSubtitle: string;
  language: string;
  languageHelp: string;
  languageGujarati: string;
  languageEnglish: string;
  reportsAlwaysGujarati: string;
  aboutTitle: string;
  aboutSchool: string;
  aboutBank: string;
  aboutDatabase: string;

  // ------------------------------------------------------- account & login
  authSubtitle: string;
  authEmail: string;
  authPassword: string;
  authPasswordAgain: string;
  authSignIn: string;
  authSigningIn: string;
  authCreateAccount: string;
  authHaveAccount: string;
  authForgot: string;
  authSignUpTitle: string;
  authSignUpHint: string;
  authSignUpSubmit: string;
  authCodeTitle: string;
  authCodeHint: (email: string) => string;
  authCode: string;
  authVerify: string;
  authResetTitle: string;
  authResetHint: string;
  authSendCode: string;
  authNewPassword: string;
  authSetPassword: string;
  authBack: string;
  authPasswordsDiffer: string;
  authPasswordShort: string;
  authInternetNote: string;
  authUnavailableTitle: string;
  authUnavailableHint: string;
  authDevCloud: string;
  working: string;

  // --------------------------------------------------------------- schools
  schoolsTitle: string;
  schoolsSubtitle: string;
  schoolsSignedInAs: (email: string) => string;
  schoolsSignOut: string;
  schoolsNew: string;
  schoolsNewHint: string;
  schoolsOpenExisting: string;
  schoolsOpenExistingHint: string;
  schoolsEmpty: string;
  schoolsOpen: string;
  schoolsReady: string;
  schoolsNotConnected: string;
  schoolsNotOnThisPc: string;
  schoolsFindFolder: string;
  schoolsRestore: string;
  schoolsForget: string;
  schoolsLastOpened: string;
  schoolsOffline: string;
  schoolsRefresh: string;
  schoolsLocked: (device: string, since: string) => string;
  schoolsOpenAnyway: string;
  schoolsFoundInFolder: string;
  schoolsOtherAccount: string;
  legacyTitle: string;
  legacyHint: string;
  legacyDevNote: string;
  legacyMove: string;
  restoreTitle: (school: string) => string;
  restoreHint: string;
  restoreChooseLocation: string;
  restoreNoBackups: string;
  restoreLatest: string;

  // --------------------------------------------------- new school's folder
  setupNewTitle: string;
  setupNewSubtitle: string;
  setupLocationSection: string;
  setupLocationHint: string;
  setupLocationBrowse: string;
  setupLocationNone: string;
  setupLocationWillCreate: (folder: string) => string;
  setupBackToSchools: string;

  // --------------------------------------------------------- open school
  changeSchool: string;
  backupUpToDate: (when: string) => string;
  backupPending: string;
  backupUploading: string;
  backupOffline: string;
  backupFailed: string;
  backupSignedOut: string;
  backupNever: string;
  missingTitle: string;
  missingBody: (school: string, folder: string) => string;
  missingReconnect: string;
  missingClose: string;

  // ------------------------------------------- settings: account & backup
  accountSection: string;
  accountEmail: string;
  dataFolder: string;
  openDataFolder: string;
  encryptionNote: string;
  backupStatus: string;
  backupNow: string;
  backupList: string;
  backupListHint: string;
  backupShowList: string;
  backupRestore: string;
  backupRestoreConfirm: (when: string) => string;
  backupRestored: string;
  backupWhen: string;
  backupDevice: string;
  backupSize: string;
  signOutHint: string;
  reportFontNote: string;

  // ------------------------------------------------------------- UI polish
  searchPlaceholder: string;
  filterAll: string;
  statusPaid: string;
  statusUnpaid: string;
  clearFilters: string;
  groupStatutory: string;
  groupRegisters: string;
  netPayable: string;
  noMatchingRecords: string;
  viewPreview: string;
  hidePreview: string;
  previewPrompt: string;
}

export const gu: Strings = {
  appName: "SMC હિસાબ",
  year: "વર્ષ",
  groupData: "માહિતી",
  groupPrinting: "છાપકામ",
  groupSettings: "સેટિંગ",
  navDashboard: "ડેશબોર્ડ",
  navOpening: "ઉઘડતી સિલક",
  navReceipts: "ગ્રાન્ટ આવક",
  navBills: "બિલ",
  navCheques: "ચેક",
  navBankCharges: "બેન્ક ચાર્જ",
  bankChargesTitle: "બેન્ક ચાર્જ",
  bankChargesSubtitle: "બેન્કે ખાતામાંથી સીધા કાપેલા નાણાં — ચેક કે વાઉચર વગર",
  bankChargesNote:
    "બેન્ક ચાર્જ ફક્ત રોજમેળ અને ખાતાવહીમાં આવે છે. ચેક રજીસ્ટર, બિલ રજીસ્ટર, વાઉચર, પત્રક-D કે પરિશિષ્ટ ૧૦ માં આવતો નથી, અને તેને વાઉચર નંબર નથી.",
  newBankCharge: "+ નવો બેન્ક ચાર્જ",
  editBankCharge: "બેન્ક ચાર્જમાં ફેરફાર",
  noBankCharges: "હજુ કોઈ બેન્ક ચાર્જ નોંધાયો નથી.",
  bankChargeDescription: "વિગત (રોજમેળ અને ખાતાવહીમાં છપાશે)",
  bankChargeDefaultDescription: "બેન્ક ચાર્જ",
  confirmDeleteBankCharge: (date, head) => `${date} નો ${head} નો બેન્ક ચાર્જ કાઢી નાખવો છે?`,
  navReports: "રિપોર્ટ",
  navReconciliation: "પરિશિષ્ટ ૯ મેળવણું",
  navMasters: "શાળા અને ગ્રાન્ટ હેડ",
  navYearEnd: "વર્ષ બંધ કરો",
  navImport: "જૂની ફાઈલ લાવો",
  navSettings: "સેટિંગ",

  loading: "લોડ થઈ રહ્યું છે…",
  calculating: "ગણતરી થઈ રહી છે…",
  couldNotLoad: "માહિતી વાંચી શકાઈ નહીં.",
  save: "સાચવો",
  cancel: "રદ કરો",
  edit: "ફેરફાર",
  delete: "કાઢો",
  total: "કુલ",
  date: "તારીખ",
  amount: "રકમ",
  remarks: "રીમાર્કસ",
  grantHeadNewOption: "+ નવો ગ્રાન્ટ હેડ (કસ્ટમ)…",
  grantHeadNewPlaceholder: "નવા ગ્રાન્ટ હેડનું નામ",
  grantHeadNewAdd: "ઉમેરો",
  suggestRemove: "આ સૂચન ભૂલી જાઓ (Shift+Delete)",
  phoneticOn: "ગુજરાતી ટાઇપિંગ ચાલુ",
  phoneticOff: "ગુજરાતી ટાઇપિંગ બંધ",
  phoneticTitle: "ચાલુ હોય ત્યારે અંગ્રેજી અક્ષરોથી ગુજરાતી (યુનિકોડ) લખાય: shaaLaa → શાળા",
  phoneticHelp: "કઈ કી થી કયો અક્ષર",
  phoneticHelpNote: "વ્યંજન પછી a લખો તો પૂરો અક્ષર (ka → ક), નહીં તો જોડાક્ષર (gr → ગ્ર). રકમ, તારીખ અને નંબરના ખાનાં અંગ્રેજીમાં જ રહે છે.",
  suggestHelp: "↑↓ પસંદ કરો · Tab / Enter ભરો · Esc બંધ",
  grantHead: "ગ્રાન્ટ હેડ",
  bank: "બેન્ક",
  cash: "રોકડ",
  none: "—",
  noIssues: "કોઈ વાંધો નથી. બધા આંકડા મેળ ખાય છે.",
  errorCount: (count) => `(${count} ભૂલ)`,

  diseCode: "ડાયસ કોડ",
  closingBank: "બંધ સિલક (બેન્ક)",
  closingCash: "બંધ સિલક (રોકડ)",
  receivedInYear: "વર્ષ દરમ્યાન મળેલ",
  totalSpent: "કુલ ખર્ચ",
  annexure10Title: "પરિશિષ્ટ ૧૦ – વાર્ષિક ગ્રાન્ટ પત્રક",
  colParticulars: "વિગત",
  colOpening: "શરૂની સિલક",
  colReceived: "મળેલ ગ્રાન્ટ",
  colTotal: "કુલ",
  colSpent: "ખર્ચ",
  colReturned: "પરત",
  colTotalOut: "કુલ ખર્ચ",
  colClosing: "બંધ સિલક",
  validation: "ચકાસણી",
  unpaidBillsNote: (count) => `${count} બિલ હજુ કોઈ ચેક સાથે જોડાયેલ નથી.`,
  viewBills: "બિલ જુઓ",

  openingTitle: "ઉઘડતી સિલક",
  openingSubtitle: "ગયા વર્ષની બંધ સિલક, દરેક ગ્રાન્ટ હેડ પ્રમાણે",

  receiptsTitle: "ગ્રાન્ટ આવક",
  receiptsSubtitle: "બેન્કમાં જમા થયેલ ગ્રાન્ટ અને વ્યાજ",
  newReceipt: "+ નવી આવક",
  editReceipt: "આવકમાં ફેરફાર",
  noReceipts: "હજુ કોઈ આવક નોંધાઈ નથી.",
  cashbookDate: "તારીખ (રોજમેળ)",
  receivedFrom: "કોના તરફથી મળી",
  mode: "રીત",
  bankName: "બેંકનું નામ",
  creditedDate: "જમા થયા તારીખ",
  confirmDeleteReceipt: (date, head) => `${date} ની ${head} ની આવક કાઢી નાખવી છે?`,

  billsTitle: "બિલ",
  billsSubtitle: "વાઉચર પ્રમાણે. ચોખ્ખી રકમ = બિલની રકમ − કપાત",
  newBill: "+ નવું બિલ",
  editBill: "બિલમાં ફેરફાર",
  noBills: "હજુ કોઈ બિલ નોંધાયું નથી.",
  voucher: "વાઉચર",
  voucherNo: "વાઉચર નંબર",
  billNo: "બીલ નંબર",
  billDate: "બીલની તારીખ",
  billDescription: "બીલ વિગત",
  billFrom: "કોના તરફથી મળેલ",
  billAmount: "બીલની રકમ",
  deduction: "કપાત",
  netAmount: "ચુકવવાની ચોખ્ખી રકમ",
  netAmountShort: "ચોખ્ખી",
  voucherTotal: (voucherNo) => `વાઉચર ${voucherNo} કુલ`,
  linkedToCheque: (chequeNo) => `— ચેક ${chequeNo}`,
  notLinkedToCheque: "— ચેક સાથે જોડાયેલ નથી",
  billsSummary: (count) => `કુલ ${count} બિલ, ચોખ્ખી રકમ`,
  deductionTooLarge: "કપાત બિલની રકમ કરતાં વધારે ન હોઈ શકે.",
  confirmDeleteBill: (label) => `બિલ ${label} કાઢી નાખવું છે?`,

  chequesTitle: "ચેક",
  chequesSubtitle: "ચેકની રકમ તેના બિલ પરથી ગણાય છે — ટાઈપ કરવાની જરૂર નથી",
  newCheque: "+ નવો ચેક",
  editCheque: (chequeNo) => `ચેક ${chequeNo} માં ફેરફાર`,
  noCheques: "હજુ કોઈ ચેક નોંધાયો નથી.",
  chequeNo: "ચેક નં",
  chequeDate: "ચેકની તારીખ",
  cashedDate: "ચેક વટાવ્યાં તારીખ",
  chequeType: "પ્રકાર",
  payee: "જેના તરફેણમાં ચેક લખ્યો",
  chequePurpose: "બિલની વિગત",
  allocation: "ગ્રાન્ટ હેડ વહેંચણી",
  whichBillsPaid: "કયા બિલ આ ચેકથી ચુકવાયા?",
  noBillsAvailable: "કોઈ બિલ બાકી નથી. પહેલાં બિલ નોંધો.",
  whichHeadsReturned: "કયા ગ્રાન્ટ હેડમાંથી કેટલું પરત?",
  computedChequeAmount: "ચેકની રકમ (ગણતરી પ્રમાણે)",
  totalChequeAmount: "કુલ ચેકની રકમ",
  confirmDeleteCheque: (chequeNo) => `ચેક ${chequeNo} કાઢી નાખવો છે? તેના બિલ છૂટા થઈ જશે.`,
  typeReimbursement: "પદર ખર્ચ પરત (સભ્ય સચિવને)",
  typeDirect: "સીધું ચુકવણું",
  typeGrantReturn: "બચત ગ્રાન્ટ પરત",

  reportsTitle: "રિપોર્ટ",
  reportsSubtitle: "આંકડા — છાપવાનું પાનું હવે પછી",
  tabBalances: "રોજમેળ સિલક",
  tabLedgers: "ખાતાવહી",
  tabGrants: "ગ્રાન્ટ રજીસ્ટર",
  tabAnnexure9: "પરિશિષ્ટ ૯",
  balancesTitle: "દરેક રોજમેળ તારીખ પછીની સિલક",
  grantRegisterTitle: "ગ્રાન્ટ રજીસ્ટર",
  colCredit: "જમા",
  colDebit: "ઉધાર",
  colCreditBalance: "જમા બાકી",
  colDebitBalance: "ઉધાર બાકી",
  colDescription: "વિગત",
  colSpentOfReceipt: "ખર્ચેલ રકમ",
  colSavingOfReceipt: "બચત રહેલ",
  colPurpose: "કયા કામે મળ્યો",
  reconciliationTitle: "બેંક સાથે મેળવણું – રીકન્સીલિએશન",
  recCashbook: "રોજમેળ પ્રમાણે સિલક",
  recUncashed: "(+) ચેક ઈસ્યુ થયા પણ વટાવેલ નથી",
  recCreditsNotInBook: "(+) બેંકમાં જમા, રોજમેળમાં નથી",
  recDepositsNotCredited: "(−) બેંકમાં જમા ન થયેલ",
  recBankCharges: "(−) બેંક ચાર્જિસ",
  recComputedPassbook: "પાસબુક પ્રમાણે સિલક (ગણતરી)",
  recEnteredPassbook: "પાસબુક પ્રમાણે સિલક (દાખલ કરેલ)",
  recMismatch: "પાસબુક સિલક મેળ ખાતી નથી. ઉપરની વિગતો તપાસો.",
  reconciliationSubtitle: "૩૧ માર્ચની પાસબુક સામે રોજમેળની બેન્ક સિલક મેળવો",
  recCashbookNote: "૩૧ માર્ચની રોજમેળ પ્રમાણે બેન્ક સિલક – ગણતરીથી",
  recSubtotal: "કુલ (A + B + C)",
  recFromCheques: "ચેક પ્રમાણે ગણતરી:",
  recUseComputed: "આ રકમ લો",
  recComputedNote: "A + B + C − D − E",
  recEnteredNote: "પાસબુકમાં ૩૧ માર્ચે જે સિલક લખેલ છે તે",
  recAgrees: "પાસબુક સિલક મેળ ખાય છે.",
  recDifference: "ફરક:",

  tabAnnexure10: "પરિશિષ્ટ ૧૦",
  tabRojmel: "રોજમેળ",
  tabGrantRegisterPrint: "ગ્રાન્ટ રજીસ્ટર",
  tabChequeRegister: "ચેક રજીસ્ટર",
  tabBillRegister: "બિલ રજીસ્ટર",
  tabVouchers: "વાઉચર",
  tabPatrakD: "પત્રક – D",
  groupPrintable: "છાપવાનાં પત્રકો",
  groupFigures: "આંકડા",
  rojmelPages: (count) => `${count} પાનાં`,
  savePdf: "PDF સાચવો",
  saveExcel: "Excel સાચવો",
  saveExcelAll: "આખું વર્ષ Excel માં",
  savingExcel: "Excel બની રહ્યું છે…",
  excelSaved: (path) => `Excel ફાઈલ સાચવાઈ: ${path}`,
  savingPdf: "બની રહ્યું છે…",
  pdfSaved: (path) => `PDF સાચવ્યું: ${path}`,
  printPreviewNote: "છાપવાનું પાનું — હંમેશાં ગુજરાતીમાં, ગુજરાતી અંકો સાથે.",

  layoutEdit: "ગોઠવણી બદલો",
  layoutEditNote: "ખાનાંની પહોળાઈ, અક્ષર, જગ્યા અને રંગ બદલો. ફેરફાર PDF અને Excel બંનેમાં આવશે.",
  layoutDone: "બંધ કરો",
  layoutSave: "ગોઠવણી સાચવો",
  layoutSaving: "સાચવી રહ્યા છીએ…",
  layoutSaved: "ગોઠવણી સાચવી.",
  layoutUndo: "પાછું લો",
  layoutDiscard: "ફેરફાર રદ કરો",
  layoutDiscardConfirm: "ગોઠવણીના ફેરફાર સાચવ્યા નથી. તેને રદ કરવા છે?",
  layoutHint:
    "પાના પર કોઈ ખાનું કે મથાળું (જેમ કે Cash Book પટ્ટી) ક્લિક કરો. બે કોલમ વચ્ચેની લીટી ખેંચીને પહોળાઈ બદલો.",
  layoutWholeReport: "આખું પત્રક",
  layoutFont: "અક્ષરનો પ્રકાર (ફોન્ટ)",
  layoutFontDefault: "મૂળ પ્રમાણે",
  layoutSize: "અક્ષરનું માપ",
  layoutPaddingX: "કોલમ વચ્ચે જગ્યા",
  layoutPaddingY: "લાઈનમાં ઉપર-નીચે જગ્યા",
  layoutRowHeight: "લાઈનની ઊંચાઈ",
  layoutAuto: "જરૂર મુજબ",
  layoutResetWidths: "પહોળાઈ મૂળ પ્રમાણે",
  layoutResetAll: "આખું પત્રક મૂળ પ્રમાણે",
  layoutSelection: "પસંદ કરેલ ખાનું",
  layoutNothingSelected: "હજુ કોઈ ખાનું પસંદ કર્યું નથી.",
  layoutColumn: (name) => `કોલમ: ${name}`,
  layoutHeadRow: "મથાળાની લાઈન",
  layoutApplyTo: "ફેરફાર લાગુ કરો",
  layoutScopeCell: "આ ખાનું",
  layoutScopeRow: "આખી લાઈન",
  layoutScopeColumn: "આખી કોલમ",
  layoutWidth: "કોલમની પહોળાઈ",
  layoutHighlight: "રંગ (હાઈલાઈટ)",
  layoutNoHighlight: "રંગ નહીં",
  layoutOtherColour: "બીજો રંગ",
  layoutWeight: "ઘાટા અક્ષર",
  layoutWeightDefault: "મૂળ",
  layoutBold: "ઘાટા",
  layoutRegular: "સાદા",
  layoutGapAfter: "આ લાઈન પછી જગ્યા",
  layoutClearFormat: "આ ફેરફાર દૂર કરો",
  layoutOverflow: (sheets) =>
    `પાના ${sheets} કાગળમાં સમાતાં નથી — PDF માં કપાઈ જશે. અક્ષર નાના કરો અથવા જગ્યા ઓછી કરો.`,
  layoutPart: (name) => `મથાળું: ${name}`,
  layoutPartHeight: "ઊંચાઈ",
  layoutPartWidth: "પહોળાઈ",
  layoutSelectParent: (name) => `← ${name} પસંદ કરો`,
  layoutThisRowHeight: "આ લાઈનની ઊંચાઈ",
  layoutFillDefault: "મૂળ રંગ",
  layoutFillBlank: "કોરું (રંગ વગર)",
  layoutFillHelp:
    "↺ = મૂળ રંગ, સફેદ = કોરું. નીચેનું રંગનું ખાનું પસંદ કરેલ ખાનાનો હાલનો રંગ બતાવે છે.",
  layoutAlign: "લખાણની ગોઠવણી",
  layoutFormColours: "આ પત્રકમાં વપરાયેલા રંગ:",
  layoutNoColour: "રંગ નથી",
  layoutPickFromScreen: "પાના પરથી રંગ લો",
  layoutAlignLeft: "ડાબે",
  layoutAlignCenter: "વચ્ચે",
  layoutAlignRight: "જમણે",
  layoutPlain: "પત્રકના પોતાના રંગ વગર છાપો (બધું કોરું)",
  layoutCellsOverflow: (count) =>
    `${count} ખાનાંમાં લખાણ કોલમ કરતાં પહોળું છે અને બાજુના ખાનામાં જાય છે. તે કોલમ પહોળી કરો.`,
  layoutTextColour: "અક્ષરનો રંગ",
  layoutGroupNote: "આખી લાઈનનો ફેરફાર (ઊંચાઈ, રંગ, અક્ષર, પછીની જગ્યા) દરેક બ્લોક અને દરેક પાનાની આ જ લાઈનમાં લાગશે.",
  layoutLineColour: "લાઈનનો રંગ (ખાનાંની કિનારી)",
  layoutColourDefault: "મૂળ પ્રમાણે (કાળો)",
  layoutColourHelp: "↺ = મૂળ રંગ. આ ફેરફાર PDF, પ્રિન્ટ અને Excel ત્રણેયમાં આવશે.",
  printOpen: "પ્રિન્ટ",
  printTitle: (report) => `પ્રિન્ટ – ${report}`,
  printPaper: "કાગળની સાઈઝ",
  printOrientation: "કાગળ કઈ રીતે",
  printPortrait: "ઊભો (Portrait)",
  printLandscape: "આડો (Landscape)",
  printScale: "ઝૂમ (%)",
  printFit: "પાનામાં સમાવો",
  printMargin: "કિનારી / માર્જિન (મિમી)",
  printDefaultIs: (text) => `મૂળ: ${text}`,
  printReset: "મૂળ પ્રમાણે કરો",
  printSave: "આ સેટિંગ યાદ રાખો",
  printSaving: "સાચવી રહ્યા છીએ…",
  printSaved: "સેટિંગ સાચવ્યું. આ પત્રક હવેથી આ રીતે જ છપાશે.",
  printNow: "પ્રિન્ટ કરો",
  printing: "છાપી રહ્યા છીએ…",
  printSent: "પ્રિન્ટર પર મોકલ્યું.",
  printClose: "બંધ કરો",
  printSheets: (count) => `કુલ ${count} પાના`,
  printUnsavedNote: "PDF, પ્રિન્ટ કે Excel બનાવતાં પહેલાં આ સેટિંગ સાચવો — તે સાચવેલ સેટિંગથી જ બને છે.",
  printDiscardConfirm: "પ્રિન્ટ સેટિંગના ફેરફાર સાચવ્યા નથી. તેને રદ કરવા છે?",
  printPaperSizeMm: (width, height) => `${width} × ${height} મિમી`,
  printRememberNote: "દરેક પત્રકનું સેટિંગ અલગ યાદ રહે છે, અને પેન ડ્રાઈવ સાથે બીજા કમ્પ્યુટર પર પણ જાય છે.",
  layoutRojmelNote:
    "રોજમેળના દરેક પાનામાં ૨૬ લાઈન જ આવે છે (ખાતાવહીમાં પાના નંબર છપાય છે), એટલે મોટા અક્ષર કે વધારે જગ્યાથી પાનું કાગળની બહાર જઈ શકે.",
  layoutExcelNote:
    "Excel માં પહોળાઈ, ફોન્ટ, માપ, રંગ અને લાઈન પછીની જગ્યા આવે છે; ખાનાંની અંદરની જગ્યા Excel પોતે નક્કી કરે છે.",
  layoutUnsavedExport: "PDF કે Excel બનાવતાં પહેલાં ગોઠવણી સાચવો અથવા રદ કરો.",
  mm: "મિમી",
  pt: "pt",

  setupTitle: "SMC હિસાબ — શરૂઆત",
  setupSubtitle: "પહેલી વાર વાપરતાં પહેલાં શાળાની માહિતી ભરો. આ એક જ વાર કરવાનું છે.",
  setupSchoolSection: "શાળાની માહિતી",
  setupSchoolName: "શાળાનું નામ",
  setupCluster: "ક્લસ્ટર",
  setupTaluka: "તાલુકો",
  setupDistrict: "જિલ્લો",
  setupHeadTeacher: "મુખ્ય શિક્ષક (સભ્ય સચિવ)",
  setupHeadTeacherShort: "ચેક પર લખાતું ટૂંકું નામ",
  setupHeadTeacherShortHint: "ખાલી રાખશો તો આપોઆપ બનશે.",
  setupMobile: "મોબાઈલ નંબર",
  setupBankSection: "બેંક ખાતું",
  setupBranch: "શાખા",
  setupAccountNo: "ખાતા નંબર",
  setupYearSection: "નાણાકીય વર્ષ",
  setupYearLabel: "વર્ષ",
  setupYearHint: "જેમ કે 2025-26",
  setupYearRange: "વર્ષની અવધિ",
  setupHeadsSection: "ગ્રાન્ટ હેડ અને ઉઘડતી સિલક",
  setupHeadsHint:
    "સામાન્ય ગ્રાન્ટ હેડ પહેલેથી ભરેલા છે. નામ બદલી શકો, કાઢી શકો કે નવા ઉમેરી શકો. ગયા વર્ષની બંધ સિલક અહીં ભરો.",
  setupOpeningBank: "ઉઘડતી સિલક (બેન્ક)",
  setupOpeningCash: "ઉઘડતી સિલક (રોકડ)",
  setupAddHead: "+ નવું ગ્રાન્ટ હેડ",
  setupSubmit: "શરૂ કરો",
  setupSaving: "સાચવી રહ્યું છે…",
  setupIncomplete: "તારાંકિત ખાનાં ભરવાં જરૂરી છે.",

  mastersTitle: "શાળા અને ગ્રાન્ટ હેડ",
  mastersSubtitle: "રિપોર્ટમાં છપાતી શાળાની વિગત અને ગ્રાન્ટ હેડની યાદી",
  mastersSmcLabel: "રિપોર્ટના મથાળાની લીટી",
  mastersSmcLabelHint: "દરેક પાના પર ઉપર છપાય છે, જેમ કે SMCE ... પ્રા. શાળા",
  mastersProgramme: "યોજનાની લીટી (પરિશિષ્ટ ૯ અને ૧૦)",
  mastersProgrammeHint: "બંને પરિશિષ્ટની ઉપર છપાય છે",
  mastersHeadsSection: "ગ્રાન્ટ હેડ",
  mastersHeadsHint:
    "ક્રમ એ રિપોર્ટમાં લીટીઓનો ક્રમ છે. જે હેડ આ વર્ષે નથી તેને બંધ કરો – જૂના વર્ષના રિપોર્ટમાં તે રહેશે.",
  mastersOrder: "ક્રમ",
  mastersActive: "આ વર્ષે",
  mastersInUse: "ચાલુ",
  mastersClosed: "બંધ",
  mastersMoveUp: "ઉપર લઈ જાઓ",
  mastersMoveDown: "નીચે લઈ જાઓ",
  mastersAddHead: "+ ગ્રાન્ટ હેડ ઉમેરો",
  mastersNewHeadPlaceholder: "નવા ગ્રાન્ટ હેડનું નામ",
  mastersConfirmDelete: (name) => `${name} કાઢી નાખવું છે?`,

  importTitle: "જૂની Excel ફાઈલમાંથી માહિતી લાવો",
  importSubtitle: "જૂના ચોપડાની ફાઈલ વાંચીને આ વર્ષમાં ઉમેરો",
  importExplainer:
    "જૂની ફાઈલ પસંદ કરો. તેમાંથી ગ્રાન્ટ આવક, બિલ અને ચેક વંચાશે અને તમને બતાવાશે. દરેક બિલનું ગ્રાન્ટ હેડ તમારે પસંદ કરવાનું રહેશે – જૂની ફાઈલમાં તે લખેલું નથી. તમે ‘લાવો’ દબાવો ત્યાં સુધી કશું સેવ થતું નથી.",
  importChooseFile: "ફાઈલ પસંદ કરો",
  importYearNotEmpty:
    "આ વર્ષમાં પહેલેથી એન્ટ્રી છે. જૂની ફાઈલ ફક્ત ખાલી વર્ષમાં જ લાવી શકાય.",
  importReceipts: (count) => `ગ્રાન્ટ આવક (${count})`,
  importBills: (count) => `બિલ (${count})`,
  importCheques: (count) => `ચેક (${count})`,
  importInclude: "લાવવું?",
  importFileHead: "ફાઈલમાં લખેલ હેડ",
  importNotes: "નોંધ / તપાસવાનું",
  importFromBills: "બિલ પ્રમાણે",
  importMissingHeads: (count) => `${count} લીટીનું ગ્રાન્ટ હેડ પસંદ કરવાનું બાકી છે.`,
  importRun: "લાવો",
  importConfirm: (receipts, bills, cheques) =>
    `${receipts} આવક, ${bills} બિલ અને ${cheques} ચેક આ વર્ષમાં ઉમેરવા છે?`,
  importDone: (receipts, bills, cheques) =>
    `${receipts} આવક, ${bills} બિલ અને ${cheques} ચેક ઉમેરાયા. હવે તારીખ અને રકમ તપાસી લો.`,
  importSourceRow: "ફાઈલની લીટી",
  importSkippedReason: "કેમ ઉમેરાયું નહીં",

  yearEndTitle: "વર્ષ બંધ કરો",
  yearEndSubtitle: "આ વર્ષની બંધ સિલક આવતા વર્ષની ઉઘડતી સિલક બને છે",
  yearEndClosingSection: (label, date) => `${label} ની બંધ સિલક (${date})`,
  yearEndClosing: "બંધ સિલક",
  yearEndNextOpening: "આવતા વર્ષની ઉઘડતી સિલક",
  yearEndNextOpeningHint:
    "બંધ સિલક આપોઆપ આવતા વર્ષની શરૂ સિલક બને છે. જરૂર હોય તો અહીં રકમ બદલી શકો છો; વર્ષ બંધ થયા પછી પણ \"ઉઘડતી સિલક\" પાના પર બદલી શકાશે.",
  yearEndOpeningChanged: "બદલેલ",
  yearEndOpeningReset: "બંધ સિલક પ્રમાણે કરો",
  yearEndCloseSection: "નવું વર્ષ શરૂ કરો",
  yearNextLabel: "નવું નાણાકીય વર્ષ",
  yearLabelTaken: "આ વર્ષ પહેલેથી છે.",
  yearCloseExplainer:
    "વર્ષ બંધ કરતાં આ વર્ષ ‘બંધ’ થશે (રિપોર્ટ છાપી શકાશે, નવી એન્ટ્રી નહીં), નવું વર્ષ બનશે, અને ચાલુ દરેક ગ્રાન્ટ હેડની બંધ સિલક તેની ઉઘડતી સિલક તરીકે લખાશે.",
  yearCloseButton: "વર્ષ બંધ કરો અને નવું વર્ષ શરૂ કરો",
  yearConfirmClose: (from, to) => `${from} બંધ કરીને ${to} શરૂ કરવું છે?`,
  yearBlockedByErrors: "વર્ષ બંધ કરતાં પહેલાં નીચેની ભૂલો સુધારો.",
  yearBlockedByCash:
    "૩૧ માર્ચે રોકડ સિલક બાકી છે. કોઈ ગ્રાન્ટ હેડની રોકડ છે તે નક્કી થઈ શકતું નથી, તેથી પહેલાં તે બેન્કમાં જમા કરો અથવા તેનો ખર્ચ નોંધો.",
  yearAlreadyClosed: (label) => `${label} પહેલેથી બંધ થયેલ છે.`,
  yearListSection: "નાણાકીય વર્ષ",
  yearListHint: "જૂનું વર્ષ ખોલીને તેના રિપોર્ટ ફરી છાપી શકાય છે.",
  yearStatus: "સ્થિતિ",
  yearOpen: "ચાલુ",
  yearClosed: "બંધ",
  yearCurrent: "ચાલુ વર્ષ",
  yearSwitchTo: "આ વર્ષ ખોલો",

  settingsTitle: "સેટિંગ",
  settingsSubtitle: "સોફ્ટવેરની પસંદગીઓ",
  language: "ભાષા",
  languageHelp: "આ સોફ્ટવેરના મેનુ અને લેબલની ભાષા બદલે છે.",
  languageGujarati: "ગુજરાતી",
  languageEnglish: "English (અંગ્રેજી)",
  reportsAlwaysGujarati:
    "છાપવાના રિપોર્ટ હંમેશાં ગુજરાતીમાં જ રહેશે — તે ઓડિટ માટેનાં સરકારી પત્રકો છે.",
  aboutTitle: "માહિતી",
  aboutSchool: "શાળા",
  aboutBank: "બેંક ખાતું",
  aboutDatabase: "માહિતી ક્યાં સચવાય છે",

  authSubtitle: "તમારા ખાતાથી લૉગિન કરો. એક ખાતામાં એક કરતાં વધુ શાળાઓ રાખી શકાય છે.",
  authEmail: "ઈમેલ",
  authPassword: "પાસવર્ડ",
  authPasswordAgain: "પાસવર્ડ ફરીથી",
  authSignIn: "લૉગિન",
  authSigningIn: "લૉગિન થાય છે…",
  authCreateAccount: "નવું ખાતું બનાવો",
  authHaveAccount: "ખાતું છે? લૉગિન કરો",
  authForgot: "પાસવર્ડ ભૂલી ગયા?",
  authSignUpTitle: "નવું ખાતું",
  authSignUpHint: "ઈમેલ પર 6 આંકડાનો કોડ આવશે. પાસવર્ડ ઓછામાં ઓછા 8 અક્ષરનો રાખો.",
  authSignUpSubmit: "ખાતું બનાવો",
  authCodeTitle: "ઈમેલમાં આવેલો કોડ",
  authCodeHint: (email) => `${email} પર મોકલેલો કોડ લખો.`,
  authCode: "કોડ",
  authVerify: "ચકાસો",
  authResetTitle: "નવો પાસવર્ડ",
  authResetHint: "તમારો ઈમેલ લખો. તેના પર કોડ આવશે.",
  authSendCode: "કોડ મોકલો",
  authNewPassword: "નવો પાસવર્ડ",
  authSetPassword: "પાસવર્ડ બદલો",
  authBack: "પાછા",
  authPasswordsDiffer: "બંને પાસવર્ડ સરખા નથી.",
  authPasswordShort: "પાસવર્ડ ઓછામાં ઓછા 8 અક્ષરનો રાખો.",
  authInternetNote: "આ PC પર પહેલી વાર લૉગિન કરવા ઇન્ટરનેટ જરૂરી છે. પછી ઇન્ટરનેટ વગર પણ ચાલશે.",
  authUnavailableTitle: "સોફ્ટવેર શરૂ થઈ શક્યું નહીં",
  authUnavailableHint: "આ નકલ ક્લાઉડના સેટિંગ વગર બનેલી છે. સોફ્ટવેર આપનારનો સંપર્ક કરો.",
  authDevCloud: "વિકાસ માટેનું ક્લાઉડ",
  working: "થઈ રહ્યું છે…",

  schoolsTitle: "શાળા પસંદ કરો",
  schoolsSubtitle: "દરેક શાળાનો ડેટા તમે પસંદ કરેલી જગ્યાએ — મોટે ભાગે પેન ડ્રાઈવ પર — રહે છે.",
  schoolsSignedInAs: (email) => `${email} તરીકે લૉગિન`,
  schoolsSignOut: "લૉગઆઉટ",
  schoolsNew: "નવી શાળા",
  schoolsNewHint: "શાળાની માહિતી ભરો અને ડેટા ક્યાં (પેન ડ્રાઈવ પર) સાચવવો તે પસંદ કરો.",
  schoolsOpenExisting: "હાલનો ડેટા ખોલો",
  schoolsOpenExistingHint: "બીજા PC પર બનાવેલી શાળાનો ડેટા પેન ડ્રાઈવ પર હોય તો આ વાપરો.",
  schoolsEmpty: "હજી કોઈ શાળા નથી. નવી શાળા બનાવો અથવા પેન ડ્રાઈવ પરનો ડેટા ખોલો.",
  schoolsOpen: "ખોલો",
  schoolsReady: "ઉપલબ્ધ",
  schoolsNotConnected: "પેન ડ્રાઈવ જોડાયેલી નથી",
  schoolsNotOnThisPc: "આ PC પર ક્યારેય ખોલી નથી",
  schoolsFindFolder: "ફોલ્ડર પસંદ કરો",
  schoolsRestore: "ક્લાઉડ બેકઅપમાંથી પાછી લાવો",
  schoolsForget: "આ PC ની યાદીમાંથી કાઢો",
  schoolsLastOpened: "છેલ્લે ખોલી",
  schoolsOffline: "ઇન્ટરનેટ નથી: ફક્ત આ PC પર ખોલેલી શાળાઓ બતાવી છે.",
  schoolsRefresh: "ફરી તપાસો",
  schoolsLocked: (device, since) =>
    `આ ડેટા ${device} પર ${since} થી ખુલ્લો છે. ત્યાં સોફ્ટવેર બંધ કર્યા વગર પેન ડ્રાઈવ કાઢી હોય તો "છતાં ખોલો" દબાવો.`,
  schoolsOpenAnyway: "છતાં ખોલો",
  schoolsFoundInFolder: "આ ફોલ્ડરમાં આ શાળાઓ મળી:",
  schoolsOtherAccount: "બીજા ખાતાની",
  legacyTitle: "આ PC પર જૂના સંસ્કરણનો ડેટા મળ્યો",
  legacyHint:
    "તેને પેન ડ્રાઈવ અથવા ફોલ્ડરમાં ખસેડો. ખસેડતી વખતે તે એન્ક્રિપ્ટ થશે અને તેનો ક્લાઉડ બેકઅપ થશે.",
  legacyDevNote: "(વિકાસ માટેનો નમૂનાનો ડેટા — મૂળ ફાઈલ બદલાતી નથી)",
  legacyMove: "ડેટા ખસેડો",
  restoreTitle: (school) => `${school} — ક્લાઉડ બેકઅપમાંથી પાછી લાવો`,
  restoreHint: "બેકઅપ પસંદ કરો, પછી શાળા ક્યાં મૂકવી (પેન ડ્રાઈવ) તે પસંદ કરો.",
  restoreChooseLocation: "જગ્યા પસંદ કરીને પાછી લાવો",
  restoreNoBackups: "આ શાળાનો કોઈ બેકઅપ નથી.",
  restoreLatest: "સૌથી નવો",

  setupNewTitle: "નવી શાળા",
  setupNewSubtitle: "શાળાની માહિતી એક જ વાર ભરવાની છે. નવી શાળા બનાવવા ઇન્ટરનેટ જરૂરી છે.",
  setupLocationSection: "ડેટા ક્યાં સાચવવો",
  setupLocationHint:
    'પેન ડ્રાઈવ (અથવા કોઈ પણ ફોલ્ડર) પસંદ કરો. ત્યાં "SMC Accounts" નામનું ફોલ્ડર બનશે. બીજા PC પર કામ કરવું હોય ત્યારે એ જ પેન ડ્રાઈવ લઈ જાઓ.',
  setupLocationBrowse: "જગ્યા પસંદ કરો…",
  setupLocationNone: "હજી પસંદ કરી નથી",
  setupLocationWillCreate: (folder) => `ડેટા અહીં બનશે: ${folder}`,
  setupBackToSchools: "શાળાઓની યાદી",

  changeSchool: "શાળા બદલો",
  backupUpToDate: (when) => `ક્લાઉડ બેકઅપ ${when}`,
  backupPending: "ક્લાઉડ બેકઅપ બાકી",
  backupUploading: "ક્લાઉડ બેકઅપ થાય છે…",
  backupOffline: "ઇન્ટરનેટ નથી — બેકઅપ બાકી",
  backupFailed: "બેકઅપ ન થયો — ફરી પ્રયત્ન થશે",
  backupSignedOut: "બેકઅપ માટે ફરી લૉગિન કરો",
  backupNever: "હજી ક્લાઉડ બેકઅપ નથી",
  missingTitle: "પેન ડ્રાઈવ મળતી નથી",
  missingBody: (school, folder) =>
    `${school} નો ડેટા ${folder} માં હતો. પેન ડ્રાઈવ ફરી લગાવો અને "ફરી જોડો" દબાવો. અત્યાર સુધી સાચવેલો દરેક ફેરફાર સુરક્ષિત છે.`,
  missingReconnect: "ફરી જોડો",
  missingClose: "શાળા બંધ કરો",

  accountSection: "ખાતું અને ક્લાઉડ બેકઅપ",
  accountEmail: "ખાતું",
  dataFolder: "ડેટાનું ફોલ્ડર",
  openDataFolder: "ફોલ્ડર ખોલો",
  encryptionNote: "આ શાળાનો ડેટા એન્ક્રિપ્ટ થયેલો છે: પેન ડ્રાઈવ ખોવાય તો પણ કોઈ તે વાંચી શકે નહીં.",
  backupStatus: "બેકઅપની સ્થિતિ",
  backupNow: "હમણાં બેકઅપ લો",
  backupList: "ક્લાઉડ બેકઅપ",
  backupListHint:
    'બેકઅપ ક્યારેય બદલાતા કે ભૂંસાતા નથી. જૂનો બેકઅપ પાછો લાવતાં પહેલાં હાલનો ડેટા શાળાના "backups" ફોલ્ડરમાં સચવાય છે.',
  backupShowList: "બેકઅપની યાદી બતાવો",
  backupRestore: "પાછો લાવો",
  backupRestoreConfirm: (when) =>
    `${when} નો બેકઅપ પાછો લાવવો છે? તે પછીના ફેરફારો આ ડેટામાંથી જશે (તેની નકલ "backups" ફોલ્ડરમાં રહેશે).`,
  backupRestored: "બેકઅપ પાછો આવ્યો.",
  backupWhen: "ક્યારે",
  backupDevice: "કયા PC પરથી",
  backupSize: "કદ",
  signOutHint:
    "લૉગઆઉટ કરવાથી આ PC પરથી લૉગિન અને શાળાઓની ચાવીઓ દૂર થાય છે. પેન ડ્રાઈવ પરનો ડેટા અને ક્લાઉડ બેકઅપ સલામત રહે છે.",
  reportFontNote: "છાપવાનાં પત્રકો (PDF અને Excel) 14 ના ફોન્ટમાં બને છે.",

  searchPlaceholder: "શોધો... (નંબર, નામ અથવા વિગત)",
  filterAll: "બધા",
  statusPaid: "ચૂકવાયેલ",
  statusUnpaid: "બાકી",
  clearFilters: "ફિલ્ટર સાફ કરો",
  groupStatutory: "સરકારી પત્રકો",
  groupRegisters: "રજિસ્ટર",
  netPayable: "ચૂકવવાપાત્ર ચોખ્ખી રકમ",
  noMatchingRecords: "કોઈ મેળ ખાતી વિગત મળી નથી.",
  viewPreview: "પ્રિવ્યૂ જુઓ",
  hidePreview: "પ્રિવ્યૂ છુપાવો",
  previewPrompt: "દસ્તાવેજ પ્રિન્ટમાં કેવો દેખાશે તે જોવા માટે 'પ્રિવ્યૂ જુઓ' બટન પર ક્લિક કરો. અથવા સીધું PDF / Excel ડાઉનલોડ કરો.",
};

export const en: Strings = {
  appName: "SMC Accounts",
  year: "Year",
  groupData: "Data entry",
  groupPrinting: "Printing",
  groupSettings: "Settings",
  navDashboard: "Dashboard",
  navOpening: "Opening balances",
  navReceipts: "Grant receipts",
  navBills: "Bills",
  navCheques: "Cheques",
  navBankCharges: "Bank charges",
  bankChargesTitle: "Bank charges",
  bankChargesSubtitle: "Money the bank took from the account itself — no cheque, no voucher",
  bankChargesNote:
    "A bank charge appears only in the rojmel and the ledger. It is not in the cheque register, the bill register, the vouchers, પત્રક-D or Annexure 10, and it has no voucher number.",
  newBankCharge: "+ New bank charge",
  editBankCharge: "Edit bank charge",
  noBankCharges: "No bank charges recorded yet.",
  bankChargeDescription: "Description (printed in the rojmel and the ledger)",
  bankChargeDefaultDescription: "બેન્ક ચાર્જ",
  confirmDeleteBankCharge: (date, head) => `Delete the ${head} bank charge dated ${date}?`,
  navReports: "Reports",
  navReconciliation: "Reconciliation",
  navMasters: "School & grant heads",
  navYearEnd: "Year closing",
  navImport: "Import old file",
  navSettings: "Settings",

  loading: "Loading…",
  calculating: "Calculating…",
  couldNotLoad: "Could not read the data.",
  save: "Save",
  cancel: "Cancel",
  edit: "Edit",
  delete: "Delete",
  total: "Total",
  date: "Date",
  amount: "Amount",
  remarks: "Remarks",
  grantHeadNewOption: "+ New grant head (custom)…",
  grantHeadNewPlaceholder: "Name of the new grant head",
  grantHeadNewAdd: "Add",
  suggestRemove: "Forget this suggestion (Shift+Delete)",
  phoneticOn: "Gujarati typing on",
  phoneticOff: "Gujarati typing off",
  phoneticTitle: "When on, English letters type Gujarati (Unicode): shaaLaa → શાળા",
  phoneticHelp: "Which keys give which letters",
  phoneticHelpNote: "Two consonants in a row join (gr → ગ્ર); a word can end in a consonant (kharch → ખર્ચ). Amount, date and number boxes stay in English.",
  suggestHelp: "↑↓ choose · Tab / Enter fill in · Esc close",
  grantHead: "Grant head",
  bank: "Bank",
  cash: "Cash",
  none: "—",
  noIssues: "No problems. Every figure reconciles.",
  errorCount: (count) => `(${count} ${count === 1 ? "error" : "errors"})`,

  diseCode: "DISE code",
  closingBank: "Closing balance (bank)",
  closingCash: "Closing balance (cash)",
  receivedInYear: "Received during the year",
  totalSpent: "Total spent",
  annexure10Title: "Annexure 10 – annual grant statement",
  colParticulars: "Particulars",
  colOpening: "Opening",
  colReceived: "Received",
  colTotal: "Total",
  colSpent: "Spent",
  colReturned: "Returned",
  colTotalOut: "Total out",
  colClosing: "Closing",
  validation: "Checks",
  unpaidBillsNote: (count) =>
    `${count} ${count === 1 ? "bill is" : "bills are"} not linked to any cheque yet.`,
  viewBills: "View bills",

  openingTitle: "Opening balances",
  openingSubtitle: "Last year's closing balance, per grant head",

  receiptsTitle: "Grant receipts",
  receiptsSubtitle: "Grants and interest credited to the bank",
  newReceipt: "+ New receipt",
  editReceipt: "Edit receipt",
  noReceipts: "No receipts recorded yet.",
  cashbookDate: "Date (cash book)",
  receivedFrom: "Received from",
  mode: "Mode",
  bankName: "Bank name",
  creditedDate: "Credited on",
  confirmDeleteReceipt: (date, head) => `Delete the ${head} receipt dated ${date}?`,

  billsTitle: "Bills",
  billsSubtitle: "Grouped by voucher. Net amount = bill amount − deduction",
  newBill: "+ New bill",
  editBill: "Edit bill",
  noBills: "No bills recorded yet.",
  voucher: "Voucher",
  voucherNo: "Voucher number",
  billNo: "Bill number",
  billDate: "Bill date",
  billDescription: "Description",
  billFrom: "Received from",
  billAmount: "Bill amount",
  deduction: "Deduction",
  netAmount: "Net amount payable",
  netAmountShort: "Net",
  voucherTotal: (voucherNo) => `Voucher ${voucherNo} total`,
  linkedToCheque: (chequeNo) => `— cheque ${chequeNo}`,
  notLinkedToCheque: "— not linked to a cheque",
  billsSummary: (count) => `${count} bills, net amount`,
  deductionTooLarge: "The deduction cannot exceed the bill amount.",
  confirmDeleteBill: (label) => `Delete bill ${label}?`,

  chequesTitle: "Cheques",
  chequesSubtitle: "A cheque's amount is computed from its bills — no need to type it",
  newCheque: "+ New cheque",
  editCheque: (chequeNo) => `Edit cheque ${chequeNo}`,
  noCheques: "No cheques recorded yet.",
  chequeNo: "Cheque no",
  chequeDate: "Cheque date",
  cashedDate: "Encashed on",
  chequeType: "Type",
  payee: "Payee",
  chequePurpose: "Purpose",
  allocation: "Split by grant head",
  whichBillsPaid: "Which bills did this cheque pay?",
  noBillsAvailable: "No unpaid bills. Record the bills first.",
  whichHeadsReturned: "How much is returned from each grant head?",
  computedChequeAmount: "Cheque amount (computed)",
  totalChequeAmount: "Total cheque amount",
  confirmDeleteCheque: (chequeNo) =>
    `Delete cheque ${chequeNo}? Its bills will be released.`,
  typeReimbursement: "Reimbursement (to the member secretary)",
  typeDirect: "Direct payment",
  typeGrantReturn: "Grant return",

  reportsTitle: "Reports",
  reportsSubtitle: "The figures — printed pages come later",
  tabBalances: "Cash-book balances",
  tabLedgers: "Ledgers",
  tabGrants: "Grant register",
  tabAnnexure9: "Annexure 9",
  balancesTitle: "Balance after each cash-book date",
  grantRegisterTitle: "Grant register",
  colCredit: "Credit",
  colDebit: "Debit",
  colCreditBalance: "Credit balance",
  colDebitBalance: "Debit balance",
  colDescription: "Description",
  colSpentOfReceipt: "Spent",
  colSavingOfReceipt: "Unspent",
  colPurpose: "Purpose",
  reconciliationTitle: "Bank reconciliation",
  recCashbook: "Balance per the cash book",
  recUncashed: "(+) Cheques issued but not encashed",
  recCreditsNotInBook: "(+) Credited by the bank, not in the cash book",
  recDepositsNotCredited: "(−) Deposited but not yet credited",
  recBankCharges: "(−) Bank charges",
  recComputedPassbook: "Passbook balance (computed)",
  recEnteredPassbook: "Passbook balance (entered)",
  recMismatch: "The passbook balance does not reconcile. Check the figures above.",
  reconciliationSubtitle: "Reconcile the cash book's bank balance with the passbook on 31 March",
  recCashbookNote: "From the cash book on 31 March – computed, not typed",
  recSubtotal: "Total (A + B + C)",
  recFromCheques: "From the cheques entered:",
  recUseComputed: "Use this figure",
  recComputedNote: "A + B + C − D − E",
  recEnteredNote: "What the passbook itself says on 31 March",
  recAgrees: "The passbook balance reconciles.",
  recDifference: "Difference:",

  tabAnnexure10: "Annexure 10",
  tabRojmel: "Cash book",
  tabGrantRegisterPrint: "Grant register",
  tabChequeRegister: "Cheque register",
  tabBillRegister: "Bill register",
  tabVouchers: "Vouchers",
  tabPatrakD: "Statement D",
  groupPrintable: "Printable forms",
  groupFigures: "Figures",
  rojmelPages: (count) => `${count} pages`,
  savePdf: "Save PDF",
  saveExcel: "Save Excel",
  saveExcelAll: "Whole year in Excel",
  savingExcel: "Building the Excel file…",
  excelSaved: (path) => `Excel file saved: ${path}`,
  savingPdf: "Creating…",
  pdfSaved: (path) => `PDF saved to ${path}`,
  printPreviewNote: "Print layout — always Gujarati, with Gujarati digits.",

  layoutEdit: "Edit layout",
  layoutEditNote: "Change column widths, fonts, spacing and highlights. Changes apply to both the PDF and Excel.",
  layoutDone: "Close",
  layoutSave: "Save layout",
  layoutSaving: "Saving…",
  layoutSaved: "Layout saved.",
  layoutUndo: "Undo",
  layoutDiscard: "Discard changes",
  layoutDiscardConfirm: "The layout changes are not saved. Discard them?",
  layoutHint:
    "Click any cell or heading (such as the Cash Book band) on the page. Drag the line between two columns to change their widths.",
  layoutWholeReport: "Whole report",
  layoutFont: "Font",
  layoutFontDefault: "Default",
  layoutSize: "Text size",
  layoutPaddingX: "Space between columns",
  layoutPaddingY: "Space above and below text",
  layoutRowHeight: "Row height",
  layoutAuto: "automatic",
  layoutResetWidths: "Default widths",
  layoutResetAll: "Reset whole report",
  layoutSelection: "Selected cell",
  layoutNothingSelected: "No cell selected yet.",
  layoutColumn: (name) => `Column: ${name}`,
  layoutHeadRow: "Heading row",
  layoutApplyTo: "Apply changes to",
  layoutScopeCell: "This cell",
  layoutScopeRow: "Whole row",
  layoutScopeColumn: "Whole column",
  layoutWidth: "Column width",
  layoutHighlight: "Highlight",
  layoutNoHighlight: "None",
  layoutOtherColour: "Other colour",
  layoutWeight: "Bold",
  layoutWeightDefault: "Default",
  layoutBold: "Bold",
  layoutRegular: "Regular",
  layoutGapAfter: "Space after this row",
  layoutClearFormat: "Clear these changes",
  layoutOverflow: (sheets) =>
    `Sheet ${sheets} no longer fits the paper — the PDF would cut it off. Use smaller text or less space.`,
  layoutPart: (name) => `Heading: ${name}`,
  layoutPartHeight: "Height",
  layoutPartWidth: "Width",
  layoutSelectParent: (name) => `← Select ${name}`,
  layoutThisRowHeight: "This row's height",
  layoutFillDefault: "Form's own colour",
  layoutFillBlank: "Blank (no colour)",
  layoutFillHelp:
    "↺ = the form's own colour, white = blank. The colour box shows the selected cell's current colour.",
  layoutAlign: "Text alignment",
  layoutFormColours: "Colours used on this form:",
  layoutNoColour: "no colour",
  layoutPickFromScreen: "Pick from page",
  layoutAlignLeft: "Left",
  layoutAlignCenter: "Centre",
  layoutAlignRight: "Right",
  layoutPlain: "Print without the form's own colours (all blank)",
  layoutCellsOverflow: (count) =>
    `${count} ${count === 1 ? "cell holds" : "cells hold"} text wider than its column, running into the next cell. Widen that column.`,
  layoutTextColour: "Text colour",
  layoutGroupNote: "A change to the whole row (height, colour, font, space after) applies to this same row in every block, on every page.",
  layoutLineColour: "Line colour (cell borders)",
  layoutColourDefault: "Default (black)",
  layoutColourHelp: "↺ = the default colour. The change goes into the PDF, the print and Excel.",
  printOpen: "Print",
  printTitle: (report) => `Print – ${report}`,
  printPaper: "Paper size",
  printOrientation: "Orientation",
  printPortrait: "Portrait",
  printLandscape: "Landscape",
  printScale: "Zoom (%)",
  printFit: "Fit to page",
  printMargin: "Margins (mm)",
  printDefaultIs: (text) => `Default: ${text}`,
  printReset: "Back to default",
  printSave: "Remember these settings",
  printSaving: "Saving…",
  printSaved: "Settings saved. This report will print this way from now on.",
  printNow: "Print",
  printing: "Printing…",
  printSent: "Sent to the printer.",
  printClose: "Close",
  printSheets: (count) => `${count} ${count === 1 ? "page" : "pages"}`,
  printUnsavedNote: "Save these settings before making a PDF, printing or saving Excel — those use the saved settings.",
  printDiscardConfirm: "The print settings have not been saved. Discard the changes?",
  printPaperSizeMm: (width, height) => `${width} × ${height} mm`,
  printRememberNote: "Each report remembers its own settings, and they travel to other PCs on the pen drive.",
  layoutRojmelNote:
    "Every cash-book page holds exactly 26 rows (the ledger prints its page numbers), so larger text or more space can push a page past the paper's edge.",
  layoutExcelNote:
    "Excel gets the widths, fonts, sizes, highlights and the space after rows; Excel sizes the space inside cells itself.",
  layoutUnsavedExport: "Save or discard the layout before making a PDF or Excel file.",
  mm: "mm",
  pt: "pt",

  setupTitle: "SMC Accounts — first run",
  setupSubtitle: "Enter the school's details before using the software. This is done once.",
  setupSchoolSection: "School details",
  setupSchoolName: "School name",
  setupCluster: "Cluster",
  setupTaluka: "Taluka",
  setupDistrict: "District",
  setupHeadTeacher: "Head teacher (member secretary)",
  setupHeadTeacherShort: "Short name written on cheques",
  setupHeadTeacherShortHint: "Left blank, one is derived.",
  setupMobile: "Mobile number",
  setupBankSection: "Bank account",
  setupBranch: "Branch",
  setupAccountNo: "Account number",
  setupYearSection: "Financial year",
  setupYearLabel: "Year",
  setupYearHint: "For example 2025-26",
  setupYearRange: "Year runs",
  setupHeadsSection: "Grant heads and opening balances",
  setupHeadsHint:
    "The usual grant heads are filled in. Rename, remove or add as your school needs, and enter last year's closing balance against each.",
  setupOpeningBank: "Opening (bank)",
  setupOpeningCash: "Opening (cash)",
  setupAddHead: "+ Add grant head",
  setupSubmit: "Start",
  setupSaving: "Saving…",
  setupIncomplete: "Fields marked * are required.",

  mastersTitle: "School & grant heads",
  mastersSubtitle: "The school details printed on every report, and the list of grant heads",
  mastersSmcLabel: "Report heading line",
  mastersSmcLabelHint: "Printed at the top of every page, e.g. SMCE … Pra. Shala",
  mastersProgramme: "Programme line (Annexures 9 and 10)",
  mastersProgrammeHint: "Printed above both annexures",
  mastersHeadsSection: "Grant heads",
  mastersHeadsHint:
    "The order is the row order on the reports. Close a head that this year does not have - earlier years keep printing it.",
  mastersOrder: "Order",
  mastersActive: "This year",
  mastersInUse: "Open",
  mastersClosed: "Closed",
  mastersMoveUp: "Move up",
  mastersMoveDown: "Move down",
  mastersAddHead: "+ Add grant head",
  mastersNewHeadPlaceholder: "Name of the new grant head",
  mastersConfirmDelete: (name) => `Delete ${name}?`,

  importTitle: "Import from an old Excel file",
  importSubtitle: "Read the old workbook and add its entries to this year",
  importExplainer:
    "Choose the old file. Its grant receipts, bills and cheques are read and shown to you first. You will have to pick the grant head for each bill - the old file does not record one. Nothing is saved until you press Import.",
  importChooseFile: "Choose file",
  importYearNotEmpty: "This year already has entries. An old file can only be imported into an empty year.",
  importReceipts: (count) => `Grant receipts (${count})`,
  importBills: (count) => `Bills (${count})`,
  importCheques: (count) => `Cheques (${count})`,
  importInclude: "Import?",
  importFileHead: "Head as written in the file",
  importNotes: "Notes / check these",
  importFromBills: "From its bills",
  importMissingHeads: (count) => `${count} row(s) still need a grant head.`,
  importRun: "Import",
  importConfirm: (receipts, bills, cheques) =>
    `Add ${receipts} receipts, ${bills} bills and ${cheques} cheques to this year?`,
  importDone: (receipts, bills, cheques) =>
    `Imported ${receipts} receipts, ${bills} bills and ${cheques} cheques. Check the dates and amounts now.`,
  importSourceRow: "Row in the file",
  importSkippedReason: "Why it was not imported",

  yearEndTitle: "Year closing",
  yearEndSubtitle: "This year's closing balances become next year's opening balances",
  yearEndClosingSection: (label, date) => `Closing balances for ${label} (${date})`,
  yearEndClosing: "Closing balance",
  yearEndNextOpening: "Next year's opening",
  yearEndNextOpeningHint:
    "Each closing balance becomes next year's opening balance by itself. Change an amount here if you need to; it can still be changed on the Opening balances screen after the year is closed.",
  yearEndOpeningChanged: "changed",
  yearEndOpeningReset: "Use the closing balance",
  yearEndCloseSection: "Start the next year",
  yearNextLabel: "New financial year",
  yearLabelTaken: "That year already exists.",
  yearCloseExplainer:
    "Closing marks this year closed (reports can still be printed, new entries cannot be made), creates the new year, and writes each open grant head's closing balance as its opening balance.",
  yearCloseButton: "Close the year and start the next",
  yearConfirmClose: (from, to) => `Close ${from} and start ${to}?`,
  yearBlockedByErrors: "Fix the errors below before closing the year.",
  yearBlockedByCash:
    "There is cash in hand on 31 March. Which grant head it belongs to cannot be worked out from the books, so deposit it or record what it paid for first.",
  yearAlreadyClosed: (label) => `${label} is already closed.`,
  yearListSection: "Financial years",
  yearListHint: "Open an earlier year to reprint its reports.",
  yearStatus: "Status",
  yearOpen: "Open",
  yearClosed: "Closed",
  yearCurrent: "Current year",
  yearSwitchTo: "Open this year",

  settingsTitle: "Settings",
  settingsSubtitle: "Application preferences",
  language: "Language",
  languageHelp: "Changes the language of this application's menus and labels.",
  languageGujarati: "ગુજરાતી (Gujarati)",
  languageEnglish: "English",
  reportsAlwaysGujarati:
    "Printed reports always stay in Gujarati — they are the government audit forms.",
  aboutTitle: "About",
  aboutSchool: "School",
  aboutBank: "Bank account",
  aboutDatabase: "Where the data is stored",

  authSubtitle: "Log in with your account. One account can hold several schools.",
  authEmail: "Email",
  authPassword: "Password",
  authPasswordAgain: "Password again",
  authSignIn: "Log in",
  authSigningIn: "Logging in…",
  authCreateAccount: "Create an account",
  authHaveAccount: "Have an account? Log in",
  authForgot: "Forgot password?",
  authSignUpTitle: "New account",
  authSignUpHint: "A 6-digit code will be emailed to you. Use a password of at least 8 characters.",
  authSignUpSubmit: "Create account",
  authCodeTitle: "Code from your email",
  authCodeHint: (email) => `Enter the code sent to ${email}.`,
  authCode: "Code",
  authVerify: "Verify",
  authResetTitle: "New password",
  authResetHint: "Enter your email. A code will be sent to it.",
  authSendCode: "Send code",
  authNewPassword: "New password",
  authSetPassword: "Change password",
  authBack: "Back",
  authPasswordsDiffer: "The two passwords are not the same.",
  authPasswordShort: "Use at least 8 characters.",
  authInternetNote: "The first login on this PC needs the internet. After that the app works offline too.",
  authUnavailableTitle: "The software cannot start",
  authUnavailableHint: "This copy was built without its cloud settings. Contact whoever supplied the software.",
  authDevCloud: "Development cloud",
  working: "Working…",

  schoolsTitle: "Choose a school",
  schoolsSubtitle: "Each school's data lives where you chose — usually on a pen drive.",
  schoolsSignedInAs: (email) => `Logged in as ${email}`,
  schoolsSignOut: "Log out",
  schoolsNew: "New school",
  schoolsNewHint: "Fill in the school's details and choose where (on a pen drive) to keep its data.",
  schoolsOpenExisting: "Open existing data",
  schoolsOpenExistingHint: "Use this for a school whose data is on a pen drive from another PC.",
  schoolsEmpty: "No schools yet. Create a new school, or open data from a pen drive.",
  schoolsOpen: "Open",
  schoolsReady: "Available",
  schoolsNotConnected: "Pen drive not connected",
  schoolsNotOnThisPc: "Never opened on this PC",
  schoolsFindFolder: "Choose folder",
  schoolsRestore: "Restore from cloud backup",
  schoolsForget: "Remove from this PC's list",
  schoolsLastOpened: "Last opened",
  schoolsOffline: "No internet: only schools opened on this PC are shown.",
  schoolsRefresh: "Check again",
  schoolsLocked: (device, since) =>
    `This data has been open on ${device} since ${since}. If the pen drive was removed there without closing the software, choose "Open anyway".`,
  schoolsOpenAnyway: "Open anyway",
  schoolsFoundInFolder: "These schools were found in the folder:",
  schoolsOtherAccount: "Another account's",
  legacyTitle: "Books from the earlier version were found on this PC",
  legacyHint:
    "Move them to a pen drive or folder. On the way they are encrypted and backed up to the cloud.",
  legacyDevNote: "(development sample data — the original file is not changed)",
  legacyMove: "Move the books",
  restoreTitle: (school) => `${school} — restore from a cloud backup`,
  restoreHint: "Choose a backup, then choose where to put the school (a pen drive).",
  restoreChooseLocation: "Choose location and restore",
  restoreNoBackups: "This school has no backups.",
  restoreLatest: "latest",

  setupNewTitle: "New school",
  setupNewSubtitle: "Fill in the school's details once. Creating a new school needs the internet.",
  setupLocationSection: "Where to keep the data",
  setupLocationHint:
    'Choose a pen drive (or any folder). An "SMC Accounts" folder is made there. To work on another PC, take the same pen drive.',
  setupLocationBrowse: "Choose location…",
  setupLocationNone: "Not chosen yet",
  setupLocationWillCreate: (folder) => `The data will be created in: ${folder}`,
  setupBackToSchools: "School list",

  changeSchool: "Change school",
  backupUpToDate: (when) => `Cloud backup ${when}`,
  backupPending: "Cloud backup pending",
  backupUploading: "Backing up to the cloud…",
  backupOffline: "Offline — backup pending",
  backupFailed: "Backup failed — will retry",
  backupSignedOut: "Log in again to back up",
  backupNever: "Not backed up yet",
  missingTitle: "The pen drive is not connected",
  missingBody: (school, folder) =>
    `${school}'s data was in ${folder}. Plug the pen drive back in and press "Reconnect". Every change saved so far is safe.`,
  missingReconnect: "Reconnect",
  missingClose: "Close the school",

  accountSection: "Account and cloud backup",
  accountEmail: "Account",
  dataFolder: "Data folder",
  openDataFolder: "Open folder",
  encryptionNote: "This school's data is encrypted: if the pen drive is lost, nobody can read it.",
  backupStatus: "Backup status",
  backupNow: "Back up now",
  backupList: "Cloud backups",
  backupListHint:
    'Backups are never changed or deleted. Before an older backup is restored, the current books are kept in the school\'s "backups" folder.',
  backupShowList: "Show backups",
  backupRestore: "Restore",
  backupRestoreConfirm: (when) =>
    `Restore the backup from ${when}? Changes made after it leave these books (a copy is kept in the "backups" folder).`,
  backupRestored: "The backup was restored.",
  backupWhen: "When",
  backupDevice: "From PC",
  backupSize: "Size",
  signOutHint:
    "Logging out removes the login and the schools' keys from this PC. The data on the pen drive and the cloud backups stay safe.",
  reportFontNote: "Printed reports (PDF and Excel) use font size 14.",

  searchPlaceholder: "Search... (number, payee or description)",
  filterAll: "All",
  statusPaid: "Paid",
  statusUnpaid: "Unpaid",
  clearFilters: "Clear filter",
  groupStatutory: "Statutory forms",
  groupRegisters: "Registers",
  netPayable: "Net payable amount",
  noMatchingRecords: "No matching records found.",
  viewPreview: "View Preview",
  hidePreview: "Hide Preview",
  previewPrompt: "Click 'View Preview' to see how this document prints, or download PDF / Excel directly.",
};
