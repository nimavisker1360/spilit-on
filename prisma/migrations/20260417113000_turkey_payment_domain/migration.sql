-- CreateEnum
CREATE TYPE "PaymentSessionStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentShareStatus" AS ENUM ('UNPAID', 'PENDING', 'PAID', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "PaymentSession" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "splitMode" "SplitStrategy" NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'TRY',
    "status" "PaymentSessionStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentShare" (
    "id" TEXT NOT NULL,
    "paymentSessionId" TEXT NOT NULL,
    "guestId" TEXT,
    "payerLabel" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "PaymentShareStatus" NOT NULL DEFAULT 'UNPAID',
    "provider" VARCHAR(64),
    "providerPaymentId" VARCHAR(128),
    "providerConversationId" VARCHAR(128),
    "paymentUrl" TEXT,
    "qrPayload" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "paymentShareId" TEXT NOT NULL,
    "provider" VARCHAR(64) NOT NULL,
    "requestPayload" JSONB NOT NULL,
    "callbackPayload" JSONB,
    "status" VARCHAR(32) NOT NULL,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSession_invoiceId_key" ON "PaymentSession"("invoiceId");

-- CreateIndex
CREATE INDEX "PaymentSession_sessionId_status_idx" ON "PaymentSession"("sessionId", "status");

-- CreateIndex
CREATE INDEX "PaymentSession_status_createdAt_idx" ON "PaymentSession"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentShare_paymentSessionId_status_idx" ON "PaymentShare"("paymentSessionId", "status");

-- CreateIndex
CREATE INDEX "PaymentShare_guestId_idx" ON "PaymentShare"("guestId");

-- CreateIndex
CREATE INDEX "PaymentShare_provider_providerPaymentId_idx" ON "PaymentShare"("provider", "providerPaymentId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_paymentShareId_createdAt_idx" ON "PaymentAttempt"("paymentShareId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentAttempt_provider_status_idx" ON "PaymentAttempt"("provider", "status");

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TableSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentShare" ADD CONSTRAINT "PaymentShare_paymentSessionId_fkey" FOREIGN KEY ("paymentSessionId") REFERENCES "PaymentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentShare" ADD CONSTRAINT "PaymentShare_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "SessionGuest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_paymentShareId_fkey" FOREIGN KEY ("paymentShareId") REFERENCES "PaymentShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;