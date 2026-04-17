-- Add nullable token column first for safe backfill.
ALTER TABLE "Table" ADD COLUMN "publicToken" TEXT;

-- Backfill existing rows with high-entropy tokens.
UPDATE "Table"
SET "publicToken" = md5("id" || random()::text || clock_timestamp()::text)
WHERE "publicToken" IS NULL;

-- Enforce token requirements for all rows.
ALTER TABLE "Table" ALTER COLUMN "publicToken" SET NOT NULL;
CREATE UNIQUE INDEX "Table_publicToken_key" ON "Table"("publicToken");
