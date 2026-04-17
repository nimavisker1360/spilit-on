-- AlterTable
ALTER TABLE "TableSession" ADD COLUMN "readyToCloseAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PaymentSession"
ADD COLUMN "paidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN "remainingAmount" DECIMAL(10,2);

-- Backfill
UPDATE "PaymentSession"
SET
  "paidAmount" = 0.00,
  "remainingAmount" = "totalAmount"
WHERE "remainingAmount" IS NULL;

-- AlterTable
ALTER TABLE "PaymentSession" ALTER COLUMN "remainingAmount" SET NOT NULL;
