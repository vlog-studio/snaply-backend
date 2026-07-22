-- AlterTable
ALTER TABLE "videos" ADD COLUMN     "deleted_at" TIMESTAMPTZ(6),
ADD COLUMN     "s3_key" TEXT;
