-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'READY', 'COMPLETED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_guestId_fkey";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "status" "OrderStatus" NOT NULL DEFAULT 'PENDING';

-- Guard: enforce MVP rule before setting NOT NULL.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "OrderItem" WHERE "guestId" IS NULL) THEN
        RAISE EXCEPTION 'Cannot enforce OrderItem.guestId NOT NULL: found unassigned order items';
    END IF;
END $$;

-- AlterTable
ALTER TABLE "OrderItem" ALTER COLUMN "guestId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Table" ADD COLUMN "status" "TableStatus" NOT NULL DEFAULT 'AVAILABLE';

UPDATE "Table"
SET "status" = 'OUT_OF_SERVICE'
WHERE "isActive" = false;

UPDATE "Table" t
SET "status" = 'OCCUPIED'
WHERE t."isActive" = true
  AND EXISTS (
    SELECT 1
    FROM "TableSession" s
    WHERE s."tableId" = t."id"
      AND s."status" = 'OPEN'
  );

ALTER TABLE "Table" DROP COLUMN "isActive";

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "guestId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'TRY',
    "method" VARCHAR(32) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reference_key" ON "Payment"("reference");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_createdAt_idx" ON "Payment"("invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_guestId_idx" ON "Payment"("guestId");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_sessionId_status_createdAt_idx" ON "Order"("sessionId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Table_branchId_status_idx" ON "Table"("branchId", "status");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "SessionGuest"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "SessionGuest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
