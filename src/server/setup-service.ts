/**
 * First-run setup: turning an empty database into a usable set of books.
 *
 * Separate from AccountsService because that one is constructed with a financial
 * year id, and at this point there is no year - no school either. This runs once
 * on a new installation and creates everything the rest of the application
 * assumes exists.
 *
 * Everything happens in ONE transaction. A half-created school - masters but no
 * year, or heads but no opening balances - would leave the app in a state no
 * screen knows how to show and no migration would repair.
 *
 * Like AccountsService, this knows nothing about Electron, so a future web build
 * can run the same setup behind an HTTP handler.
 */
import type { PrismaClient } from "@prisma/client";
import { financialYearEnd, financialYearStart, isIsoDate } from "../lib/dates.js";
import type { ApiResult, SetupInput, SetupStateDto } from "../shared/api.js";
import type { Issue } from "../engine/validation.js";

function problem(code: string, messageGu: string, detail: string): ApiResult<never> {
  const issue: Issue = { severity: "error", code, messageGu, messageEn: detail, detail };
  return { ok: false, issues: [issue] };
}

export class SetupService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Whether anything has been set up yet, and what year is open. */
  async getSetupState(): Promise<SetupStateDto> {
    const school = await this.prisma.school.findFirst();
    const year = await this.prisma.financialYear.findFirst({ orderBy: { label: "desc" } });
    return {
      needsSetup: school === null || year === null,
      schoolNameGu: school?.nameGu ?? null,
      yearLabel: year?.label ?? null,
    };
  }

  /**
   * Create the school, its bank account, the first financial year, the grant
   * heads and their opening balances.
   */
  async completeSetup(input: SetupInput): Promise<ApiResult<SetupStateDto>> {
    const invalid = validateSetupInput(input);
    if (invalid) return invalid;

    // Refuse to run twice. Setting up over an existing school would orphan a
    // year of books behind a second school nobody can see.
    const existing = await this.prisma.school.findFirst();
    if (existing) {
      return problem(
        "already_set_up",
        "આ સોફ્ટવેર પહેલેથી સેટ થયેલ છે.",
        `a school (${existing.nameGu}) already exists; setup cannot run again`,
      );
    }

    const startDate = input.year.startDate || financialYearStart(input.year.label);
    const endDate = input.year.endDate || financialYearEnd(input.year.label);

    await this.prisma.$transaction(async (tx) => {
      const school = await tx.school.create({
        data: {
          nameGu: input.school.nameGu.trim(),
          smcLabelGu: input.school.smcLabelGu.trim(),
          diseCode: input.school.diseCode.trim(),
          clusterGu: input.school.clusterGu.trim(),
          talukaGu: input.school.talukaGu.trim(),
          districtGu: input.school.districtGu.trim(),
          programmeGu: input.school.programmeGu.trim(),
          memberSecretaryGu: input.school.memberSecretaryGu.trim(),
          memberSecretaryShortGu: input.school.memberSecretaryShortGu.trim(),
          memberSecretaryMobile: input.school.memberSecretaryMobile?.trim() || null,
        },
      });

      await tx.bankAccount.create({
        data: {
          schoolId: school.id,
          bankNameGu: input.bank.bankNameGu.trim(),
          branchGu: input.bank.branchGu.trim(),
          accountNo: input.bank.accountNo.trim(),
          isPrimary: true,
        },
      });

      const year = await tx.financialYear.create({
        data: {
          schoolId: school.id,
          label: input.year.label.trim(),
          startDate,
          endDate,
          status: "OPEN",
        },
      });

      // Opening balances are keyed by head code in the input, so the heads have
      // to exist before they can be attached.
      const idByCode = new Map<string, number>();

      for (const head of input.grantHeads) {
        const created = await tx.grantHead.create({
          data: { schoolId: school.id, code: head.code, nameGu: head.nameGu.trim() },
        });
        idByCode.set(head.code, created.id);

        await tx.grantHeadYear.create({
          data: {
            financialYearId: year.id,
            grantHeadId: created.id,
            reportOrder: head.reportOrder,
            active: true,
          },
        });
      }

      for (const balance of input.openingBalances) {
        const grantHeadId = idByCode.get(balance.code);
        // A balance for a head that was removed mid-form is simply dropped
        // rather than failing the whole setup.
        if (grantHeadId === undefined) continue;

        await tx.openingBalance.create({
          data: {
            financialYearId: year.id,
            grantHeadId,
            bankPaise: balance.bankPaise,
            cashPaise: balance.cashPaise,
          },
        });
      }

      // An empty reconciliation so Annexure 9 has something to read. Its five
      // figures are zero until the school fills them in at year end.
      await tx.bankReconciliation.create({ data: { financialYearId: year.id } });
    });

    return { ok: true, data: await this.getSetupState() };
  }
}

/**
 * The setup form's rules, without a database.
 *
 * Exported so a new school can be checked BEFORE its data folder or its cloud
 * record exist: a form rejected for a missing DISE code must leave nothing
 * behind on the pen drive.
 */
export function validateSetupInput(input: SetupInput): ApiResult<never> | null {
  const required: [string, string, string][] = [
    [input.school.nameGu, "શાળાનું નામ ભરવું જરૂરી છે", "school name is required"],
    [input.school.diseCode, "ડાયસ કોડ ભરવો જરૂરી છે", "DISE code is required"],
    [input.school.clusterGu, "ક્લસ્ટર ભરવું જરૂરી છે", "cluster is required"],
    [input.school.talukaGu, "તાલુકો ભરવો જરૂરી છે", "taluka is required"],
    [input.school.districtGu, "જિલ્લો ભરવો જરૂરી છે", "district is required"],
    [
      input.school.memberSecretaryGu,
      "મુખ્ય શિક્ષકનું નામ ભરવું જરૂરી છે",
      "head teacher name is required",
    ],
    [input.bank.bankNameGu, "બેંકનું નામ ભરવું જરૂરી છે", "bank name is required"],
    [input.bank.accountNo, "બેંક ખાતા નંબર ભરવો જરૂરી છે", "bank account number is required"],
  ];

  for (const [value, messageGu, detail] of required) {
    if (!value || value.trim() === "") return problem("required_field", messageGu, detail);
  }

  if (!/^\d{4}-\d{2}$/.test(input.year.label.trim())) {
    return problem(
      "bad_year_label",
      "નાણાકીય વર્ષ ૨૦૨૫-૨૬ ના સ્વરૂપમાં લખો, જેમ કે 2025-26",
      `financial year label "${input.year.label}" must look like 2025-26`,
    );
  }

  for (const field of [input.year.startDate, input.year.endDate]) {
    if (field && !isIsoDate(field)) {
      return problem(
        "bad_year_date",
        "નાણાકીય વર્ષની તારીખ ખોટી છે",
        `"${field}" is not an ISO date`,
      );
    }
  }

  if (input.grantHeads.length === 0) {
    return problem(
      "no_grant_heads",
      "ઓછામાં ઓછું એક ગ્રાન્ટ હેડ જરૂરી છે",
      "at least one grant head is required",
    );
  }

  const codes = new Set<string>();
  for (const head of input.grantHeads) {
    if (!head.nameGu || head.nameGu.trim() === "") {
      return problem(
        "grant_head_without_name",
        "દરેક ગ્રાન્ટ હેડનું નામ ભરવું જરૂરી છે",
        `grant head ${head.code} has no name`,
      );
    }
    if (codes.has(head.code)) {
      return problem(
        "duplicate_grant_head",
        `ગ્રાન્ટ હેડ ${head.nameGu} એક કરતાં વધુ વાર છે`,
        `duplicate grant head code ${head.code}`,
      );
    }
    codes.add(head.code);
  }

  for (const balance of input.openingBalances) {
    if (balance.bankPaise < 0 || balance.cashPaise < 0) {
      return problem(
        "negative_opening_balance",
        "ઉઘડતી સિલક ઋણ ન હોઈ શકે",
        `opening balance for ${balance.code} is negative`,
      );
    }
  }

  return null;
}
