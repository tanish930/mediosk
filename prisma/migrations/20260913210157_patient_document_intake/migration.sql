-- AlterTable
ALTER TABLE "MedicalDocument" ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "preConsultationSessionId" TEXT,
ADD COLUMN     "size" INTEGER;

-- AddForeignKey
ALTER TABLE "MedicalDocument" ADD CONSTRAINT "MedicalDocument_preConsultationSessionId_fkey" FOREIGN KEY ("preConsultationSessionId") REFERENCES "PreConsultationSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
