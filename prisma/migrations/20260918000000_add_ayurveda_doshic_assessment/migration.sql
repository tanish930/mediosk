-- AlterTable
ALTER TABLE "AyushAssessment" ADD COLUMN "nadiData" JSONB;
ALTER TABLE "AyushAssessment" ADD COLUMN "sleep" TEXT;

-- CreateEnum
CREATE TYPE "AyushSuggestionStatus" AS ENUM ('SUGGESTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "AyushDoshaAssessment" (
    "id" TEXT NOT NULL,
    "ayushAssessmentId" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AyushDoshaAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AyushFormulationSuggestion" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "formularyId" TEXT NOT NULL,
    "formulationName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "matchedDoshas" JSONB NOT NULL,
    "status" "AyushSuggestionStatus" NOT NULL DEFAULT 'SUGGESTED',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "reviewerNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AyushFormulationSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AyushDoshaAssessment_ayushAssessmentId_key" ON "AyushDoshaAssessment"("ayushAssessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AyushFormulationSuggestion_consultationId_formularyId_key" ON "AyushFormulationSuggestion"("consultationId", "formularyId");

-- AddForeignKey
ALTER TABLE "AyushDoshaAssessment" ADD CONSTRAINT "AyushDoshaAssessment_ayushAssessmentId_fkey" FOREIGN KEY ("ayushAssessmentId") REFERENCES "AyushAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AyushDoshaAssessment" ADD CONSTRAINT "AyushDoshaAssessment_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AyushDoshaAssessment" ADD CONSTRAINT "AyushDoshaAssessment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AyushDoshaAssessment" ADD CONSTRAINT "AyushDoshaAssessment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AyushFormulationSuggestion" ADD CONSTRAINT "AyushFormulationSuggestion_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AyushFormulationSuggestion" ADD CONSTRAINT "AyushFormulationSuggestion_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;