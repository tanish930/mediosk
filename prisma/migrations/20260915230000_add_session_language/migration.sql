-- Add the clinical interview language to pre-consultation sessions.
-- Defaults to English so existing sessions (and new sessions that do not
-- specify a language) keep working unchanged.
ALTER TABLE "PreConsultationSession" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';