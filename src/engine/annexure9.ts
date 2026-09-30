/**
 * પરિશિષ્ટ ૯ - bank reconciliation (SPEC 6.8).
 *
 *   A  rojmel bank balance on 31 March
 *   B  cheques issued but not yet encashed              (+)
 *   C  credited by the bank, not yet in the cash book   (+)
 *   D  sent to the bank, not yet credited               (−)
 *   E  bank charges not yet in the cash book            (−)
 *   passbook balance = A + B + C − D − E
 *
 * The client's Excel copies A straight into the passbook line instead of
 * computing it (SPEC 9.9), which makes the statement reconcile by definition and
 * tells nobody anything. Here the passbook figure is computed and compared with
 * what the user read off the passbook, and `matches` says whether they agree.
 */
import { paise, sum, type Paise, ZERO } from "../lib/money.js";
import { chequeAmount } from "./allocation.js";
import { yearEndBalance } from "./balances.js";
import type { Annexure9, YearBook } from "./types.js";

export function annexure9(book: YearBook): Annexure9 {
  const cashbookBankPaise = yearEndBalance(book).bankPaise;

  const reconciliation = book.reconciliation;
  const chequesIssuedNotCashedPaise = reconciliation?.chequesIssuedNotCashedPaise ?? ZERO;
  const creditsInBankNotInCashbookPaise = reconciliation?.creditsInBankNotInCashbookPaise ?? ZERO;
  const depositsNotYetCreditedPaise = reconciliation?.depositsNotYetCreditedPaise ?? ZERO;
  const bankChargesNotInCashbookPaise = reconciliation?.bankChargesNotInCashbookPaise ?? ZERO;
  const enteredPassbookPaise = reconciliation?.passbookBalancePaise ?? ZERO;

  const subtotalPaise = paise(
    cashbookBankPaise + chequesIssuedNotCashedPaise + creditsInBankNotInCashbookPaise,
  );
  const deductionsPaise = paise(depositsNotYetCreditedPaise + bankChargesNotInCashbookPaise);
  const computedPassbookPaise = paise(subtotalPaise - deductionsPaise);

  return {
    cashbookBankPaise,
    chequesIssuedNotCashedPaise,
    creditsInBankNotInCashbookPaise,
    subtotalPaise,
    depositsNotYetCreditedPaise,
    bankChargesNotInCashbookPaise,
    deductionsPaise,
    computedPassbookPaise,
    enteredPassbookPaise,
    matches: computedPassbookPaise === enteredPassbookPaise,
    suggestedUnencashedPaise: unencashedChequesOn(book, book.year.endDate),
  };
}

/**
 * B, derived from the cheques themselves: everything issued on or before 31 March
 * with no encashment date, or encashed after year end.
 *
 * SPEC 4.6 notes this can be computed rather than typed. The two are offered side
 * by side rather than one replacing the other - the school copies B off the
 * passbook, and a disagreement is worth showing instead of silently overriding.
 */
export function unencashedChequesOn(book: YearBook, date: string): Paise {
  return sum(
    book.cheques
      .filter((cheque) => cheque.cashbookDate <= date)
      .filter((cheque) => cheque.cashedDate === null || cheque.cashedDate > date)
      .map(chequeAmount),
  );
}
