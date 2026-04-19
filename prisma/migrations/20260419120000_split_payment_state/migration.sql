-- Split payment state owned by the backend/session layer.
ALTER TABLE "TableSession"
ADD COLUMN "totalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN "paidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN "remainingAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00;

ALTER TABLE "PaymentShare"
ADD COLUMN "userId" TEXT,
ADD COLUMN "tip" DECIMAL(10,2) NOT NULL DEFAULT 0.00;

UPDATE "PaymentShare"
SET "userId" = "guestId"
WHERE "userId" IS NULL AND "guestId" IS NOT NULL;

UPDATE "TableSession" AS session
SET
  "totalAmount" = payment_totals."totalAmount",
  "paidAmount" = payment_totals."paidAmount",
  "remainingAmount" = GREATEST(payment_totals."totalAmount" - payment_totals."paidAmount", 0.00)
FROM (
  SELECT
    ps."sessionId",
    MAX(ps."totalAmount") AS "totalAmount",
    COALESCE(SUM(CASE WHEN share."status" = 'PAID' THEN share."amount" ELSE 0.00 END), 0.00) AS "paidAmount"
  FROM "PaymentSession" ps
  LEFT JOIN "PaymentShare" share ON share."paymentSessionId" = ps."id"
  GROUP BY ps."sessionId"
) payment_totals
WHERE payment_totals."sessionId" = session."id";

CREATE INDEX "PaymentShare_userId_idx" ON "PaymentShare"("userId");
