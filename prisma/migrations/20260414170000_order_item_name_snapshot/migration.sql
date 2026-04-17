-- Add nullable snapshot column first for safe backfill.
ALTER TABLE "OrderItem" ADD COLUMN "itemName" TEXT;

-- Backfill existing order items from the linked menu item names.
UPDATE "OrderItem" oi
SET "itemName" = mi."name"
FROM "MenuItem" mi
WHERE oi."menuItemId" = mi."id";

-- Enforce snapshot requirement for all rows.
ALTER TABLE "OrderItem" ALTER COLUMN "itemName" SET NOT NULL;
