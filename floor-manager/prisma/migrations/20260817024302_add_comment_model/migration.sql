-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "layout_id" TEXT NOT NULL,
    "snapshot_id" TEXT,
    "position_x" DOUBLE PRECISION,
    "position_y" DOUBLE PRECISION,
    "text" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comments_layout_id_idx" ON "comments"("layout_id");

-- CreateIndex
CREATE INDEX "comments_snapshot_id_idx" ON "comments"("snapshot_id");

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_layout_id_fkey" FOREIGN KEY ("layout_id") REFERENCES "layouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
