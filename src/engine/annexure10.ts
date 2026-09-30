/**
 * પરિશિષ્ટ ૧૦ - the annual grant statement (SPEC 6.9).
 *
 * One row per grant head in print order, plus a કુલ total row:
 *
 *   શરૂની સિલક | મળેલ ગ્રાન્ટ | કુલ | ખર્ચ | પરત કરેલ ગ્રાન્ટ | કુલ ખર્ચ | બંધ સિલક
 *
 * The client's own Annexure 10 has ખર્ચ for the cleanliness grant typed as 12,000
 * where the cash book says 15,000, which makes its ખર્ચ total 36,763 instead of
 * 39,763 (SPEC 9.2). Every figure here is computed, so that class of error cannot
 * survive.
 */
import { add, paise, type Paise, ZERO } from "../lib/money.js";
import { openingOf, receivedByHead, returnedByHead, spentByHead } from "./allocation.js";
import type { Annexure10, Annexure10Row, YearBook } from "./types.js";

export function annexure10(book: YearBook): Annexure10 {
  // Computed once and shared across the rows rather than per head, so a book with
  // many heads does not walk every cheque once per head.
  const received = receivedByHead(book);
  const spent = spentByHead(book);
  const returned = returnedByHead(book);

  const rows: Annexure10Row[] = book.heads.map((head) => {
    const openingPaise = openingOf(book, head.code);
    const receivedPaise = received.get(head.code) ?? ZERO;
    const spentPaise = spent.get(head.code) ?? ZERO;
    const returnedPaise = returned.get(head.code) ?? ZERO;

    return {
      headCode: head.code,
      nameGu: head.nameGu,
      openingPaise,
      receivedPaise,
      totalPaise: add(openingPaise, receivedPaise),
      spentPaise,
      returnedPaise,
      totalOutPaise: add(spentPaise, returnedPaise),
      closingPaise: paise(openingPaise + receivedPaise - spentPaise - returnedPaise),
    };
  });

  return { rows, totals: totalsOf(rows) };
}

function totalsOf(rows: Annexure10Row[]): Annexure10["totals"] {
  const column = (select: (row: Annexure10Row) => Paise): Paise =>
    paise(rows.reduce((total, row) => total + select(row), 0));

  return {
    openingPaise: column((row) => row.openingPaise),
    receivedPaise: column((row) => row.receivedPaise),
    totalPaise: column((row) => row.totalPaise),
    spentPaise: column((row) => row.spentPaise),
    returnedPaise: column((row) => row.returnedPaise),
    totalOutPaise: column((row) => row.totalOutPaise),
    closingPaise: column((row) => row.closingPaise),
  };
}
