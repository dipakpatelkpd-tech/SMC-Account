-- CreateTable
CREATE TABLE "School" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nameGu" TEXT NOT NULL,
    "smcLabelGu" TEXT NOT NULL,
    "diseCode" TEXT NOT NULL,
    "clusterGu" TEXT NOT NULL,
    "talukaGu" TEXT NOT NULL,
    "districtGu" TEXT NOT NULL,
    "programmeGu" TEXT NOT NULL,
    "memberSecretaryGu" TEXT NOT NULL,
    "memberSecretaryShortGu" TEXT NOT NULL,
    "memberSecretaryMobile" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "schoolId" INTEGER NOT NULL,
    "bankNameGu" TEXT NOT NULL,
    "branchGu" TEXT NOT NULL,
    "accountNo" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BankAccount_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinancialYear" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "schoolId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinancialYear_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GrantHead" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "schoolId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "nameGu" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GrantHead_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GrantHeadYear" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "financialYearId" INTEGER NOT NULL,
    "grantHeadId" INTEGER NOT NULL,
    "reportOrder" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "GrantHeadYear_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "FinancialYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GrantHeadYear_grantHeadId_fkey" FOREIGN KEY ("grantHeadId") REFERENCES "GrantHead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OpeningBalance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "financialYearId" INTEGER NOT NULL,
    "grantHeadId" INTEGER NOT NULL,
    "bankPaise" INTEGER NOT NULL DEFAULT 0,
    "cashPaise" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OpeningBalance_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "FinancialYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OpeningBalance_grantHeadId_fkey" FOREIGN KEY ("grantHeadId") REFERENCES "GrantHead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "financialYearId" INTEGER NOT NULL,
    "grantHeadId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "receivedFromGu" TEXT NOT NULL,
    "modeGu" TEXT NOT NULL,
    "ddChequeNo" TEXT,
    "ddChequeDate" TEXT,
    "allotmentOrderNo" TEXT,
    "allotmentOrderDate" TEXT,
    "bankAccountId" INTEGER NOT NULL,
    "bankLabelGu" TEXT NOT NULL,
    "depositedDate" TEXT,
    "creditedDate" TEXT,
    "remarksGu" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Receipt_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "FinancialYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Receipt_grantHeadId_fkey" FOREIGN KEY ("grantHeadId") REFERENCES "GrantHead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Receipt_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "financialYearId" INTEGER NOT NULL,
    "grantHeadId" INTEGER NOT NULL,
    "voucherNo" INTEGER NOT NULL,
    "billNo" TEXT,
    "billDate" TEXT NOT NULL,
    "descriptionGu" TEXT NOT NULL,
    "vendorGu" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "deductionPaise" INTEGER NOT NULL DEFAULT 0,
    "quantityGu" TEXT,
    "remarksGu" TEXT,
    "chequeId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Bill_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "FinancialYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Bill_grantHeadId_fkey" FOREIGN KEY ("grantHeadId") REFERENCES "GrantHead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Bill_chequeId_fkey" FOREIGN KEY ("chequeId") REFERENCES "Cheque" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Cheque" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "financialYearId" INTEGER NOT NULL,
    "chequeNo" INTEGER NOT NULL,
    "chequeDate" TEXT NOT NULL,
    "cashbookDate" TEXT NOT NULL,
    "cashedDate" TEXT,
    "voucherNo" INTEGER,
    "payeeGu" TEXT NOT NULL,
    "purposeGu" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "bankAccountId" INTEGER NOT NULL,
    "remarksGu" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Cheque_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "FinancialYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Cheque_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChequeAllocation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chequeId" INTEGER NOT NULL,
    "grantHeadId" INTEGER NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChequeAllocation_chequeId_fkey" FOREIGN KEY ("chequeId") REFERENCES "Cheque" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChequeAllocation_grantHeadId_fkey" FOREIGN KEY ("grantHeadId") REFERENCES "GrantHead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankReconciliation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "financialYearId" INTEGER NOT NULL,
    "chequesIssuedNotCashedPaise" INTEGER NOT NULL DEFAULT 0,
    "creditsInBankNotInCashbookPaise" INTEGER NOT NULL DEFAULT 0,
    "depositsNotYetCreditedPaise" INTEGER NOT NULL DEFAULT 0,
    "bankChargesNotInCashbookPaise" INTEGER NOT NULL DEFAULT 0,
    "passbookBalancePaise" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BankReconciliation_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "FinancialYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "School_diseCode_key" ON "School"("diseCode");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_schoolId_accountNo_key" ON "BankAccount"("schoolId", "accountNo");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialYear_schoolId_label_key" ON "FinancialYear"("schoolId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "GrantHead_schoolId_code_key" ON "GrantHead"("schoolId", "code");

-- CreateIndex
CREATE INDEX "GrantHeadYear_financialYearId_reportOrder_idx" ON "GrantHeadYear"("financialYearId", "reportOrder");

-- CreateIndex
CREATE UNIQUE INDEX "GrantHeadYear_financialYearId_grantHeadId_key" ON "GrantHeadYear"("financialYearId", "grantHeadId");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningBalance_financialYearId_grantHeadId_key" ON "OpeningBalance"("financialYearId", "grantHeadId");

-- CreateIndex
CREATE INDEX "Receipt_financialYearId_date_idx" ON "Receipt"("financialYearId", "date");

-- CreateIndex
CREATE INDEX "Bill_financialYearId_voucherNo_idx" ON "Bill"("financialYearId", "voucherNo");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_financialYearId_voucherNo_billNo_key" ON "Bill"("financialYearId", "voucherNo", "billNo");

-- CreateIndex
CREATE INDEX "Cheque_financialYearId_cashbookDate_idx" ON "Cheque"("financialYearId", "cashbookDate");

-- CreateIndex
CREATE UNIQUE INDEX "Cheque_financialYearId_chequeNo_key" ON "Cheque"("financialYearId", "chequeNo");

-- CreateIndex
CREATE UNIQUE INDEX "ChequeAllocation_chequeId_grantHeadId_key" ON "ChequeAllocation"("chequeId", "grantHeadId");

-- CreateIndex
CREATE UNIQUE INDEX "BankReconciliation_financialYearId_key" ON "BankReconciliation"("financialYearId");

