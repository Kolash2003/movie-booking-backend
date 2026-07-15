-- DropForeignKey
ALTER TABLE "ShowSeat" DROP CONSTRAINT "ShowSeat_bookingId_fkey";

-- AlterTable
ALTER TABLE "ShowSeat" ALTER COLUMN "bookingId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ShowSeat" ADD CONSTRAINT "ShowSeat_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
