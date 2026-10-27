-- A retried request saved the same client id twice. The newest row keeps the id
-- the client knows; older ones stay in history under their own ids.
UPDATE "translation" t
SET "client_request_id" = NULL
FROM (
  SELECT "id", row_number() OVER (
    PARTITION BY "userId", "client_request_id"
    ORDER BY "created_at" DESC, "id" DESC
  ) AS "rank"
  FROM "translation"
  WHERE "client_request_id" IS NOT NULL
) duplicates
WHERE t."id" = duplicates."id" AND duplicates."rank" > 1;

CREATE UNIQUE INDEX "translation_userId_client_request_id_key" ON "translation"("userId", "client_request_id");

ALTER TABLE "translation" ALTER COLUMN "translate_history" SET DEFAULT false;
