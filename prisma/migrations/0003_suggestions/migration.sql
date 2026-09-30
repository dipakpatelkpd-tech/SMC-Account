-- What was typed into each kind of field before, offered again as a suggestion
-- (src/shared/suggestions.ts). Saved in the books so the pen drive carries it.

-- CreateTable
CREATE TABLE "Suggestion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "field" TEXT NOT NULL,
    "valueKey" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "useCount" INTEGER NOT NULL,
    "lastUsedAt" TEXT NOT NULL,
    "removedAt" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "Suggestion_field_valueKey_key" ON "Suggestion"("field", "valueKey");
