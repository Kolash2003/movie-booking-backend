/*
  Warnings:

  - Added the required column `stage` to the `BookingLatencyMetric` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "BookingLatencyMetric" ADD COLUMN     "stage" TEXT NOT NULL;
