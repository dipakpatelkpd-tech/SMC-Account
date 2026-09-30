/**
 * The shape of reference/sample_data_2025-26.json, validated rather than trusted.
 *
 * The file is the corrected sample year and the oracle every report is tested
 * against (SPEC section 8), so a typo in it would surface as a mysterious test
 * failure three steps later. Parsing it through Zod turns that into one clear
 * error at seed time.
 */
import { z } from "zod";
import { isoDateSchema, billNoSchema } from "../src/lib/types.js";

/** Amounts in the sample file are whole rupees, not paise. */
const rupees = z.number().int().nonnegative();

const grantHeadCode = z.string().regex(/^[A-Z][A-Z0-9_]*$/, "grant head code must be SCREAMING_SNAKE");

export const sampleDataSchema = z.object({
  _about: z.string().optional(),

  school: z.object({
    name_gu: z.string().min(1),
    smc_label: z.string().min(1),
    dise_code: z.string().min(1),
    cluster_gu: z.string().min(1),
    taluka_gu: z.string().min(1),
    district_gu: z.string().min(1),
    programme_gu: z.string().min(1),
    bank_name: z.string().min(1),
    bank_branch_gu: z.string().min(1),
    bank_account_no: z.string().min(1),
    member_secretary_gu: z.string().min(1),
    member_secretary_short_gu: z.string().min(1),
    member_secretary_mobile: z.string().optional(),
  }),

  financial_year: z.object({
    label: z.string().min(1),
    start: isoDateSchema,
    end: isoDateSchema,
  }),

  grant_heads: z
    .array(
      z.object({
        code: grantHeadCode,
        name_gu: z.string().min(1),
        report_order: z.number().int().positive(),
      }),
    )
    .min(1),

  opening_balances: z.object({
    date: isoDateSchema,
    cash: rupees,
    by_head: z.record(grantHeadCode, z.object({ bank: rupees, cash: rupees })),
  }),

  receipts: z
    .array(
      z.object({
        id: z.string().min(1),
        date: isoDateSchema,
        grant_head: grantHeadCode,
        amount: rupees,
        received_from: z.string().min(1),
        mode_gu: z.string().min(1),
        bank_gu: z.string().min(1),
        dd_cheque_no: z.string().optional(),
        dd_cheque_date: isoDateSchema.optional(),
        allotment_order_no: z.string().optional(),
        allotment_order_date: isoDateSchema.optional(),
        deposited_date: isoDateSchema.optional(),
        credited_date: isoDateSchema.optional(),
        remarks_gu: z.string().optional(),
      }),
    )
    .min(1),

  bills: z
    .array(
      z.object({
        id: z.string().min(1),
        voucher_no: z.number().int().positive(),
        bill_no: billNoSchema.nullable(), // null for a direct-payment cheque's bill
        bill_date: isoDateSchema,
        description_gu: z.string().min(1),
        vendor_gu: z.string().min(1),
        amount: rupees,
        deduction: rupees,
        net_amount: rupees,
        grant_head: grantHeadCode,
        quantity_gu: z.string().optional(),
        remarks_gu: z.string().optional(),
      }),
    )
    .min(1),

  cheques: z
    .array(
      z.object({
        cheque_no: z.number().int().positive(),
        voucher_no: z.number().int().positive().optional(),
        cheque_date: isoDateSchema,
        cashbook_date: isoDateSchema,
        cashed_date: isoDateSchema.optional(),
        payee_gu: z.string().min(1),
        type: z.enum(["reimbursement", "direct", "grant_return"]),
        purpose_gu: z.string().min(1),
        amount: rupees,
        bill_ids: z.array(z.string()),
        allocation: z.array(z.object({ grant_head: grantHeadCode, amount: rupees })),
        remarks_gu: z.string().optional(),
      }),
    )
    .min(1),

  year_end_bank_reconciliation: z.object({
    cheques_issued_not_cashed: rupees,
    credits_in_bank_not_in_cashbook: rupees,
    deposits_not_yet_credited: rupees,
    bank_charges_not_in_cashbook: rupees,
    passbook_balance_on_31_03_2026: rupees,
  }),

  expected_results: z.object({
    annexure_10_rows: z.array(
      z.object({
        grant_head: grantHeadCode,
        opening: rupees,
        received: rupees,
        total: rupees,
        spent: rupees,
        returned: rupees,
        total_out: rupees,
        closing: rupees,
      }),
    ),
    annexure_10_totals: z.object({
      opening: rupees,
      received: rupees,
      total: rupees,
      spent: rupees,
      returned: rupees,
      total_out: rupees,
      closing: rupees,
    }),
    closing_balance_after_each_cashbook_date: z.record(
      isoDateSchema,
      z.object({ bank: rupees, cash: rupees }),
    ),
    year_end: z.object({ bank: rupees, cash: rupees, total: rupees }),
  }),
});

export type SampleData = z.infer<typeof sampleDataSchema>;
export type SampleCheque = SampleData["cheques"][number];
export type SampleBill = SampleData["bills"][number];

/** Map the JSON's lowercase cheque type onto the stored ChequeType. */
export const CHEQUE_TYPE_FROM_SAMPLE = {
  reimbursement: "REIMBURSEMENT",
  direct: "DIRECT",
  grant_return: "GRANT_RETURN",
} as const;
