-- DropIndex
DROP INDEX "positions_snapshot_id_product_id_key";

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1;
