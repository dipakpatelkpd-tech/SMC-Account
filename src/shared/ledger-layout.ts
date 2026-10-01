/**
 * Which ledger accounts share a sheet, and where on it each one goes.
 *
 * The client's book prints the ખાતાવહી four accounts to a landscape sheet, two
 * across and two down. Accounts differ a lot in length - an interest account
 * has three entries, the cleanliness grant a dozen - so which four share a
 * sheet, and which sits on top, is chosen by size rather than by print order
 * (the client: "order is not important; four to a page is"):
 *
 *   - Sheets are filled four at a time, so every sheet but the last is full.
 *     Each takes the largest and the smallest accounts left, then the next
 *     largest and next smallest, so long and short accounts share a sheet and
 *     no sheet is all long ones.
 *   - On a sheet the largest and the smallest share one column and the middle
 *     two the other, so the two columns come out about equally tall; in each
 *     column the larger account is on top.
 *
 * Pure, so the arrangement is tested without a browser (tests/ledger-layout.test.ts).
 */

export const ACCOUNTS_PER_SHEET = 4;

/** One sheet: two columns, each the accounts top to bottom, as indexes into the input. */
export type LedgerSheet = [number[], number[]];

/** Arrange accounts of the given sizes (any measure of height: rows will do). */
export function arrangeLedgers(sizes: readonly number[]): LedgerSheet[] {
  // Largest first; equal sizes keep their print order.
  const order = sizes
    .map((size, index) => ({ size, index }))
    .sort((a, b) => b.size - a.size || a.index - b.index)
    .map((entry) => entry.index);

  const sheets: LedgerSheet[] = [];
  let low = 0;
  let high = order.length - 1;
  while (low <= high) {
    const chosen: number[] = [];
    // Largest, smallest, next largest, next smallest.
    for (let pick = 0; pick < ACCOUNTS_PER_SHEET && low <= high; pick += 1) {
      chosen.push(pick % 2 === 0 ? order[low++]! : order[high--]!);
    }
    sheets.push(columnsOf(chosen, sizes));
  }
  return sheets;
}

/** Up to four accounts into two columns of about equal height, larger on top. */
function columnsOf(accounts: number[], sizes: readonly number[]): LedgerSheet {
  const bySize = [...accounts].sort((a, b) => sizes[b]! - sizes[a]! || a - b);
  const [a, b, c, d] = bySize;
  const column = (...indexes: (number | undefined)[]): number[] =>
    indexes.filter((index): index is number => index !== undefined);
  // a ≥ b ≥ c ≥ d: a with d and b with c balance best.
  if (bySize.length === 4) return [column(a, d), column(b, c)];
  if (bySize.length === 3) return [column(a), column(b, c)];
  return [column(a), column(b)];
}
