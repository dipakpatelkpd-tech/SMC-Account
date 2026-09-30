/**
 * The values that stand in for database enums.
 *
 * Prisma cannot declare enums on SQLite, so the columns are String. These unions
 * plus the Zod schemas are what actually enforce the allowed values, and they are
 * the single place to change if the provider ever moves to Postgres.
 */
import { z } from "zod";

// --------------------------------------------------------------- cheque type

/**
 * REIMBURSEMENT - to the member secretary for bills he already paid from his own
 *                 pocket. In the rojmel the money goes bank -> cash and each bill
 *                 is then a cash payment, so cash returns to 0 the same day.
 * DIRECT        - straight to a supplier or worker. Bank only.
 * GRANT_RETURN  - unspent balance sent back to the CRC coordinator. Bank only,
 *                 and the only type whose per-head split is typed by the user.
 */
export const CHEQUE_TYPES = ["REIMBURSEMENT", "DIRECT", "GRANT_RETURN"] as const;
export type ChequeType = (typeof CHEQUE_TYPES)[number];
export const chequeTypeSchema = z.enum(CHEQUE_TYPES);

/** True when this cheque's allocation is computed from bills rather than typed. */
export function isAllocationComputed(type: ChequeType): boolean {
  return type === "REIMBURSEMENT" || type === "DIRECT";
}

/** True when this cheque moves money bank -> cash before paying the bills. */
export function movesMoneyThroughCash(type: ChequeType): boolean {
  return type === "REIMBURSEMENT";
}

// ------------------------------------------------------- financial year status

export const FINANCIAL_YEAR_STATUSES = ["OPEN", "CLOSED"] as const;
export type FinancialYearStatus = (typeof FINANCIAL_YEAR_STATUSES)[number];
export const financialYearStatusSchema = z.enum(FINANCIAL_YEAR_STATUSES);

// -------------------------------------------------------------- shared shapes

/** ISO date-only, the form every date column is stored in. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be ISO YYYY-MM-DD")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), {
    message: "date is not a real calendar date",
  });

/**
 * A bill number such as "1/2". Text, always - Excel turned these into dates in the
 * client's workbook (SPEC section 9.7) and that is the bug this type prevents.
 */
export const billNoSchema = z
  .string()
  .min(1)
  .regex(/^[^\s]+$/, "bill number must not contain spaces");

/** A non-negative amount in paise. */
export const paiseSchema = z.number().int().nonnegative();
