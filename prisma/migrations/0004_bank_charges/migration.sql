-- Money the bank takes out of the account itself, with no cheque and no
-- voucher (a service charge). Shown in the rojmel and the head's ledger only.

-- CreateTable
CREATE TABLE "BankCharge" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "financialYearId" INTEGER NOT NULL,
    "grantHeadId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "descriptionGu" TEXT NOT NULL,
    "remarksGu" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BankCharge_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "FinancialYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankCharge_grantHeadId_fkey" FOREIGN KEY ("grantHeadId") REFERENCES "GrantHead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BankCharge_financialYearId_date_idx" ON "BankCharge"("financialYearId", "date");
