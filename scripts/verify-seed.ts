/**
 * Read the seeded year back out of the database and prove it reproduces the
 * oracle in reference/sample_data_2025-26.json.
 *
 * This is a check on the SEED and the SCHEMA, not on the report engine - it
 * touches nothing but stored rows, and it recomputes every derived figure the
 * schema deliberately refuses to store:
 *
 *   - a bill's net amount      = amount - deduction
 *   - a cheque's allocation    = its bills' net amounts grouped by head,
 *                                except a grant return, which is typed
 *   - a cheque's amount        = the total of that allocation
 *   - Annexure 10, per head    = Opening + Received - Spent - Returned
 *
 * If this passes, the facts are in the database faithfully and step 2 can build
 * the real engine on top of them. Run with: npm run verify:seed
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPrismaClient } from "../src/lib/db.js";
import { formatAmount, rupeesToPaise } from "../src/lib/money.js";
import { isAllocationComputed, type ChequeType } from "../src/lib/types.js";
import { sampleDataSchema } from "../prisma/sample-data.js";

const prisma = createPrismaClient();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = path.resolve(HERE, "../reference/sample_data_2025-26.json");

let failures = 0;
let checks = 0;

function expect(label: string, actual: number, expected: number): void {
  checks += 1;
  if (actual !== expected) {
    failures += 1;
    console.error(
      `  FAIL  ${label}: got ${formatAmount(actual)}, expected ${formatAmount(expected)}`,
    );
  }
}

function expectCount(label: string, actual: number, expected: number): void {
  checks += 1;
  if (actual !== expected) {
    failures += 1;
    console.error(`  FAIL  ${label}: got ${actual}, expected ${expected}`);
  }
}

async function main(): Promise<void> {
  const sample = sampleDataSchema.parse(JSON.parse(await readFile(SAMPLE_PATH, "utf8")));

  const year = await prisma.financialYear.findFirst({
    where: { label: sample.financial_year.label },
    include: {
      school: true,
      grantHeadYears: { include: { grantHead: true }, orderBy: { reportOrder: "asc" } },
      openingBalances: { include: { grantHead: true } },
      receipts: { include: { grantHead: true } },
      bills: { include: { grantHead: true } },
      cheques: {
        include: {
          bills: { include: { grantHead: true } },
          allocations: { include: { grantHead: true } },
        },
        orderBy: { chequeNo: "asc" },
      },
      reconciliation: true,
    },
  });

  if (!year) throw new Error(`no seeded financial year "${sample.financial_year.label}"`);

  console.log(`Verifying ${year.school.nameGu} - ${year.label} from the database\n`);

  // ------------------------------------------------------------ row counts
  expectCount("grant heads", year.grantHeadYears.length, sample.grant_heads.length);
  expectCount("opening balances", year.openingBalances.length, Object.keys(sample.opening_balances.by_head).length);
  expectCount("receipts", year.receipts.length, sample.receipts.length);
  expectCount("bills", year.bills.length, sample.bills.length);
  expectCount("cheques", year.cheques.length, sample.cheques.length);

  // -------------------------------------- cheque amounts and allocations
  // Recomputed from bills; the schema stores neither.
  const spentByHead = new Map<string, number>();
  const returnedByHead = new Map<string, number>();

  const sampleChequeByNo = new Map(sample.cheques.map((cheque) => [cheque.cheque_no, cheque]));

  for (const cheque of year.cheques) {
    const type = cheque.type as ChequeType;
    const allocation = new Map<string, number>();

    if (isAllocationComputed(type)) {
      for (const bill of cheque.bills) {
        const net = bill.amountPaise - bill.deductionPaise;
        allocation.set(bill.grantHead.code, (allocation.get(bill.grantHead.code) ?? 0) + net);
      }
      expectCount(
        `cheque ${cheque.chequeNo} has no typed allocation rows`,
        cheque.allocations.length,
        0,
      );
    } else {
      for (const row of cheque.allocations) {
        allocation.set(row.grantHead.code, (allocation.get(row.grantHead.code) ?? 0) + row.amountPaise);
      }
      expectCount(`cheque ${cheque.chequeNo} links no bills`, cheque.bills.length, 0);
    }

    const amount = [...allocation.values()].reduce((total, value) => total + value, 0);
    const expected = sampleChequeByNo.get(cheque.chequeNo);
    if (!expected) throw new Error(`cheque ${cheque.chequeNo} is not in the sample file`);
    expect(`cheque ${cheque.chequeNo} amount`, amount, rupeesToPaise(expected.amount));

    // Each head's share must match the file's allocation, head by head.
    const stated = new Map(expected.allocation.map((row) => [row.grant_head, rupeesToPaise(row.amount)]));
    for (const head of new Set([...allocation.keys(), ...stated.keys()])) {
      expect(
        `cheque ${cheque.chequeNo} allocation to ${head}`,
        allocation.get(head) ?? 0,
        stated.get(head) ?? 0,
      );
    }

    const bucket = type === "GRANT_RETURN" ? returnedByHead : spentByHead;
    for (const [head, value] of allocation) {
      bucket.set(head, (bucket.get(head) ?? 0) + value);
    }
  }

  // ------------------------------------------------------------ Annexure 10
  const openingByHead = new Map(
    year.openingBalances.map((row) => [row.grantHead.code, row.bankPaise + row.cashPaise]),
  );
  const receivedByHead = new Map<string, number>();
  for (const receipt of year.receipts) {
    receivedByHead.set(
      receipt.grantHead.code,
      (receivedByHead.get(receipt.grantHead.code) ?? 0) + receipt.amountPaise,
    );
  }

  console.log("Annexure 10, recomputed from stored rows:\n");
  const columns = ["opening", "received", "total", "spent", "returned", "total out", "closing"];
  console.log(`  ${"head".padEnd(14)}${columns.map((c) => c.padStart(11)).join("")}`);

  const running = { opening: 0, received: 0, spent: 0, returned: 0, closing: 0 };

  for (const { grantHead } of year.grantHeadYears) {
    const code = grantHead.code;
    const opening = openingByHead.get(code) ?? 0;
    const received = receivedByHead.get(code) ?? 0;
    const spent = spentByHead.get(code) ?? 0;
    const returned = returnedByHead.get(code) ?? 0;
    const closing = opening + received - spent - returned;

    const expected = sample.expected_results.annexure_10_rows.find((row) => row.grant_head === code);
    if (!expected) throw new Error(`no expected Annexure 10 row for ${code}`);

    expect(`${code} opening`, opening, rupeesToPaise(expected.opening));
    expect(`${code} received`, received, rupeesToPaise(expected.received));
    expect(`${code} total`, opening + received, rupeesToPaise(expected.total));
    expect(`${code} spent`, spent, rupeesToPaise(expected.spent));
    expect(`${code} returned`, returned, rupeesToPaise(expected.returned));
    expect(`${code} total out`, spent + returned, rupeesToPaise(expected.total_out));
    expect(`${code} closing`, closing, rupeesToPaise(expected.closing));

    running.opening += opening;
    running.received += received;
    running.spent += spent;
    running.returned += returned;
    running.closing += closing;

    const cells = [opening, received, opening + received, spent, returned, spent + returned, closing];
    console.log(`  ${code.padEnd(14)}${cells.map((c) => formatAmount(c).padStart(11)).join("")}`);
  }

  const totals = sample.expected_results.annexure_10_totals;
  expect("total opening", running.opening, rupeesToPaise(totals.opening));
  expect("total received", running.received, rupeesToPaise(totals.received));
  expect("total", running.opening + running.received, rupeesToPaise(totals.total));
  expect("total spent", running.spent, rupeesToPaise(totals.spent));
  expect("total returned", running.returned, rupeesToPaise(totals.returned));
  expect("total out", running.spent + running.returned, rupeesToPaise(totals.total_out));
  expect("total closing", running.closing, rupeesToPaise(totals.closing));

  const totalCells = [
    running.opening,
    running.received,
    running.opening + running.received,
    running.spent,
    running.returned,
    running.spent + running.returned,
    running.closing,
  ];
  console.log(`  ${"કુલ".padEnd(14)}${totalCells.map((c) => formatAmount(c).padStart(11)).join("")}`);

  // ----------------------------------------------- year-end bank balance
  // Opening bank, plus every receipt, less every cheque. Cash is untouched by
  // anything except a reimbursement, which returns it to 0 the same day.
  const openingBank = year.openingBalances.reduce((total, row) => total + row.bankPaise, 0);
  const totalReceived = year.receipts.reduce((total, row) => total + row.amountPaise, 0);
  const totalOut = running.spent + running.returned;
  expect("year-end bank balance", openingBank + totalReceived - totalOut, rupeesToPaise(sample.expected_results.year_end.bank));

  // ----------------------------------------------------------- Annexure 9
  const reconciliation = year.reconciliation;
  if (!reconciliation) throw new Error("no reconciliation row was seeded");
  const passbook =
    openingBank +
    totalReceived -
    totalOut +
    reconciliation.chequesIssuedNotCashedPaise +
    reconciliation.creditsInBankNotInCashbookPaise -
    reconciliation.depositsNotYetCreditedPaise -
    reconciliation.bankChargesNotInCashbookPaise;
  expect("Annexure 9 passbook balance", passbook, reconciliation.passbookBalancePaise);

  console.log("");
  if (failures === 0) {
    console.log(`All ${checks} checks passed. The seeded database reproduces expected_results.`);
  } else {
    console.error(`${failures} of ${checks} checks FAILED.`);
    process.exit(1);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
