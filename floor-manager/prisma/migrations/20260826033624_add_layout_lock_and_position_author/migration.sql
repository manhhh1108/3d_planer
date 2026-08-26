-- AlterTable
ALTER TABLE "positions" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_by" TEXT;

-- CreateTable
CREATE TABLE "layout_locks" (
    "id" TEXT NOT NULL,
    "layout_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_email" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "layout_locks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "layout_locks_layout_id_date_key" ON "layout_locks"("layout_id", "date");

-- AddForeignKey
ALTER TABLE "layout_locks" ADD CONSTRAINT "layout_locks_layout_id_fkey" FOREIGN KEY ("layout_id") REFERENCES "layouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
