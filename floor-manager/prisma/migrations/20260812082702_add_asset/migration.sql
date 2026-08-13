-- AlterTable
ALTER TABLE "products" ADD COLUMN     "asset_id" TEXT;

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "unit_scale" DOUBLE PRECISION NOT NULL DEFAULT 0.001,
    "bbox_length_m" DOUBLE PRECISION,
    "bbox_width_m" DOUBLE PRECISION,
    "bbox_height_m" DOUBLE PRECISION,
    "area_m2" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
