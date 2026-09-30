/**
 * Print every report the engine can currently compute, to the terminal.
 *
 * Numbers only - no page layout, no Gujarati digits, no PDF. Those come with the
 * report layer. This exists so the calculations can be read and checked against
 * reference/ by eye before any of that is built.
 *
 * Run with: npm run show:reports
 */
import { createPrismaClient } from "../src/lib/db.js";
import { formatAmount } from "../src/lib/money.js";
import { formatDate } from "../src/lib/dates.js";
import {
  annexure9,
  annexure10,
  balancesByDate,
  chequeAmount,
  grantRegister,
  ledger,
  loadYearBookByLabel,
  validate,
  yearEndBalance,
} from "../src/engine/index.js";

const prisma = createPrismaClient();

const YEAR_LABEL = process.argv[2] ?? "2025-26";

function heading(title: string): void {
  console.log(`\n${"=".repeat(78)}\n${title}\n${"=".repeat(78)}`);
}

function money(amount: number, width = 11): string {
  return formatAmount(amount).padStart(width);
}

async function main(): Promise<void> {
  const book = await loadYearBookByLabel(prisma, YEAR_LABEL);

  console.log(`${book.school.smcLabelGu}`);
  console.log(`${book.school.bankNameGu} ${book.school.bankBranchGu} - ${book.school.bankAccountNo}`);
  console.log(`વર્ષ ${book.year.label}  (${formatDate(book.year.startDate)} - ${formatDate(book.year.endDate)})`);

  // ------------------------------------------------------------ Annexure 10
  heading("પરિશિષ્ટ ૧૦ - annual grant statement");
  const summary = annexure10(book);
  const header = ["opening", "received", "total", "spent", "returned", "total out", "closing"];
  console.log(`${"".padEnd(22)}${header.map((column) => column.padStart(11)).join("")}`);
  for (const row of summary.rows) {
    console.log(
      `${row.nameGu.padEnd(22)}` +
        [
          row.openingPaise,
          row.receivedPaise,
          row.totalPaise,
          row.spentPaise,
          row.returnedPaise,
          row.totalOutPaise,
          row.closingPaise,
        ]
          .map((amount) => money(amount))
          .join(""),
    );
  }
  const totals = summary.totals;
  console.log(
    `${"કુલ".padEnd(22)}` +
      [
        totals.openingPaise,
        totals.receivedPaise,
        totals.totalPaise,
        totals.spentPaise,
        totals.returnedPaise,
        totals.totalOutPaise,
        totals.closingPaise,
      ]
        .map((amount) => money(amount))
        .join(""),
  );

  // ------------------------------------------------------- cash-book balances
  heading("રોજમેળ - balance after each cash-book date");
  console.log(`${"date".padEnd(14)}${"cash".padStart(12)}${"bank".padStart(12)}${"total".padStart(12)}`);
  for (const balance of balancesByDate(book)) {
    console.log(
      `${formatDate(balance.date).padEnd(14)}` +
        money(balance.cashPaise, 12) +
        money(balance.bankPaise, 12) +
        money(balance.totalPaise, 12),
    );
  }
  const yearEnd = yearEndBalance(book);
  console.log(
    `\nતારીખ ${formatDate(book.year.endDate)} ના રોજ બંધ સિલક રૂપિયા ${formatAmount(yearEnd.totalPaise)} રહે છે.`,
  );

  // ------------------------------------------------------------ cheque register
  heading("ચેક રજીસ્ટર - cheques");
  console.log(
    `${"no".padEnd(6)}${"cash-book".padEnd(13)}${"type".padEnd(15)}${"amount".padStart(11)}  payee`,
  );
  for (const cheque of [...book.cheques].sort((a, b) => a.chequeNo - b.chequeNo)) {
    console.log(
      `${String(cheque.chequeNo).padEnd(6)}` +
        `${formatDate(cheque.cashbookDate).padEnd(13)}` +
        `${cheque.type.toLowerCase().padEnd(15)}` +
        money(chequeAmount(cheque)) +
        `  ${cheque.payeeGu}`,
    );
  }

  // ------------------------------------------------------------ grant register
  heading("ગ્રાન્ટ રજીસ્ટર - receipts, with how much of each was spent");
  console.log(
    `${"date".padEnd(13)}${"head".padEnd(22)}${"amount".padStart(11)}${"ખર્ચેલ".padStart(12)}${"બચત".padStart(12)}`,
  );
  for (const row of grantRegister(book)) {
    console.log(
      `${formatDate(row.receipt.date).padEnd(13)}` +
        `${row.headNameGu.padEnd(22)}` +
        money(row.receipt.amountPaise) +
        money(row.spentPaise, 12) +
        money(row.savingPaise, 12),
    );
  }

  // ------------------------------------------------------------------ ledgers
  heading("ખાતાવહી - ledgers");
  for (const head of book.heads) {
    const account = ledger(book, head.code);
    console.log(`\n${account.nameGu}`);
    console.log(
      `  ${"date".padEnd(13)}${"જમા".padStart(11)}${"ઉધાર".padStart(11)}${"balance".padStart(11)}  વિગત`,
    );
    for (const row of account.rows) {
      console.log(
        `  ${formatDate(row.date).padEnd(13)}` +
          money(row.creditPaise) +
          money(row.debitPaise) +
          money(row.creditBalancePaise - row.debitBalancePaise) +
          `  ${row.descriptionGu}`,
      );
    }
    console.log(
      `  ${"બંધ સિલક".padEnd(13)}` +
        money(account.totalCreditPaise) +
        money(account.totalDebitPaise) +
        money(account.closingPaise),
    );
  }

  // --------------------------------------------------------------- Annexure 9
  heading("પરિશિષ્ટ ૯ - bank reconciliation");
  const reconciliation = annexure9(book);
  console.log(`  રોજમેળ પ્રમાણે સિલક (A)            ${money(reconciliation.cashbookBankPaise)}`);
  console.log(`  + ચેક ઈસ્યુ પણ વટાવેલ નહીં (B)      ${money(reconciliation.chequesIssuedNotCashedPaise)}`);
  console.log(`  + બેંકમાં જમા, રોજમેળમાં નહીં (C)    ${money(reconciliation.creditsInBankNotInCashbookPaise)}`);
  console.log(`  કુલ                                ${money(reconciliation.subtotalPaise)}`);
  console.log(`  - બેંકમાં જમા ન થયેલ (D)            ${money(reconciliation.depositsNotYetCreditedPaise)}`);
  console.log(`  - બેંક ચાર્જિસ (E)                  ${money(reconciliation.bankChargesNotInCashbookPaise)}`);
  console.log(`  પાસબુક પ્રમાણે સિલક (ગણતરી)        ${money(reconciliation.computedPassbookPaise)}`);
  console.log(`  પાસબુક પ્રમાણે સિલક (દાખલ કરેલ)     ${money(reconciliation.enteredPassbookPaise)}`);
  console.log(`  મેળ ખાય છે?                        ${reconciliation.matches ? "હા" : "ના"}`);

  // ------------------------------------------------------------- validation
  heading("ચકાસણી - validation");
  const result = validate(book);
  if (result.issues.length === 0) {
    console.log("  No issues.");
  } else {
    for (const issue of result.issues) {
      console.log(`  [${issue.severity === "error" ? "ERROR  " : "warning"}] ${issue.detail}`);
    }
    console.log(`\n  ${result.errors.length} error(s), ${result.warnings.length} warning(s).`);
  }
  console.log("");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
