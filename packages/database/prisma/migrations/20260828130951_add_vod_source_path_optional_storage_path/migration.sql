/*
  Warnings:

  - Added the required column `sourcePath` to the `VOD` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "VOD" ADD COLUMN     "sourcePath" TEXT NOT NULL,
ALTER COLUMN "storagePath" DROP NOT NULL;
