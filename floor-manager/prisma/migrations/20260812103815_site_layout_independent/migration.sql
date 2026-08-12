-- CreateTable
CREATE TABLE "sites" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- Default site + backfill existing layouts (data-preserving)
INSERT INTO "sites" ("id", "name") VALUES ('site-default', 'Nhà máy chính');

ALTER TABLE "layouts" ADD COLUMN "site_id" TEXT;
UPDATE "layouts" SET "site_id" = 'site-default';
ALTER TABLE "layouts" ALTER COLUMN "site_id" SET NOT NULL;

ALTER TABLE "layouts" DROP CONSTRAINT "layouts_project_id_fkey";
ALTER TABLE "layouts" DROP COLUMN "project_id";

-- AddForeignKey
ALTER TABLE "layouts" ADD CONSTRAINT "layouts_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
