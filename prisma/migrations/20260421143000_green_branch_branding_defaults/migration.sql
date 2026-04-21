ALTER TABLE "Branch" ALTER COLUMN "primaryColor" SET DEFAULT '#16a34a';
ALTER TABLE "Branch" ALTER COLUMN "accentColor" SET DEFAULT '#bbf7d0';

UPDATE "Branch"
SET "primaryColor" = '#16a34a'
WHERE "primaryColor" = '#f28c28';

UPDATE "Branch"
SET "accentColor" = '#bbf7d0'
WHERE "accentColor" = '#ffd6b5';
