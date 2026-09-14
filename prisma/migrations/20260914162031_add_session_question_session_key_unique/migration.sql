-- Deduplicate SessionQuestion rows created by the old non-idempotent
-- adaptive next-question flow (same sessionId + key can appear more than once).
-- Keep the first row per (sessionId, key); delete duplicate questions and their answers.
DELETE FROM "SessionAnswer"
WHERE "questionId" IN (
  SELECT "id" FROM (
    SELECT
      "id",
      ROW_NUMBER() OVER (PARTITION BY "sessionId", "key" ORDER BY "order", "id") AS rn
    FROM "SessionQuestion"
    WHERE "key" IS NOT NULL
  ) t
  WHERE t.rn > 1
);

DELETE FROM "SessionQuestion"
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT
      "id",
      ROW_NUMBER() OVER (PARTITION BY "sessionId", "key" ORDER BY "order", "id") AS rn
    FROM "SessionQuestion"
    WHERE "key" IS NOT NULL
  ) t
  WHERE t.rn > 1
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionQuestion_sessionId_key_key" ON "SessionQuestion"("sessionId", "key");