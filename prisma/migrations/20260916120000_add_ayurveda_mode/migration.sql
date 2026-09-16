-- AlterTable
ALTER TABLE "PreConsultationSession" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'GENERAL';

-- AlterTable
ALTER TABLE "PreConsultationReport" ADD COLUMN "ayush" JSONB;

-- AlterTable
ALTER TABLE "AyushAssessment" ADD COLUMN "koshtha" TEXT;
