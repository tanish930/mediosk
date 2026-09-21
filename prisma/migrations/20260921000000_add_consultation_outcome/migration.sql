-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN "outcome" TEXT,
ADD COLUMN "outcomeNote" TEXT,
ADD COLUMN "completedAt" TIMESTAMP(3);