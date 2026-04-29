-- DropForeignKey
ALTER TABLE "PaymentMethod" DROP CONSTRAINT "PaymentMethod_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "PlatformInvoice" DROP CONSTRAINT "PlatformInvoice_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "PlatformInvoice" DROP CONSTRAINT "PlatformInvoice_subscriptionId_fkey";

-- DropForeignKey
ALTER TABLE "PlatformPayment" DROP CONSTRAINT "PlatformPayment_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "PlatformPayment" DROP CONSTRAINT "PlatformPayment_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "PlatformPayment" DROP CONSTRAINT "PlatformPayment_subscriptionId_fkey";

-- DropForeignKey
ALTER TABLE "TenantSubscription" DROP CONSTRAINT "TenantSubscription_paymentMethodId_fkey";

-- AddForeignKey
ALTER TABLE "TenantSubscription" ADD CONSTRAINT "TenantSubscription_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformInvoice" ADD CONSTRAINT "PlatformInvoice_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformInvoice" ADD CONSTRAINT "PlatformInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "TenantSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformPayment" ADD CONSTRAINT "PlatformPayment_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformPayment" ADD CONSTRAINT "PlatformPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "TenantSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformPayment" ADD CONSTRAINT "PlatformPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PlatformInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
