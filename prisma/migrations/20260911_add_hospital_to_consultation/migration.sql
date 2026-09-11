-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN "hospitalId" TEXT;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;
