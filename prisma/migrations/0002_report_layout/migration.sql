-- A school's own layout for each printed report (src/shared/report-layout.ts).

-- CreateTable
CREATE TABLE "ReportLayout" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "schoolId" INTEGER NOT NULL,
    "report" TEXT NOT NULL,
    "layoutJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReportLayout_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportLayout_schoolId_report_key" ON "ReportLayout"("schoolId", "report");
