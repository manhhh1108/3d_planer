-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "snapshots" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;
