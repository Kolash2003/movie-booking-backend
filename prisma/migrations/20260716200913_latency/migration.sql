/*
  Warnings:

  - You are about to drop the column `latencyMs` on the `BookingLatencyMetric` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "BookingLatencyMetric" DROP COLUMN "latencyMs";
