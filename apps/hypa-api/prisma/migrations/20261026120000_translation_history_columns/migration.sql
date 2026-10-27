-- History now lives in "translation" only. These columns replace the
-- bookmark, feedback and thinking fields that history kept in
-- "developer_request"."data".
--
-- "translation" is shared with Lab and the Developer API, so only rows the
-- Translate product saves are Translate history. Nothing on an existing row
-- says who saved it, so every existing row stays in Translate history. The
-- column defaults to true until the last migration of this change, so a row an
-- older instance saves while these migrations run is not lost from history.
--
-- The change is split in three migrations so that none holds a lock on
-- "translation" for longer than its own work: this one only adds columns and an
-- index, the next copies rows, the last builds the unique index.
ALTER TABLE "translation" ADD COLUMN "translate_history" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "translation" ADD COLUMN "client_request_id" TEXT;
ALTER TABLE "translation" ADD COLUMN "bookmarked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "translation" ADD COLUMN "liked" BOOLEAN;
ALTER TABLE "translation" ADD COLUMN "correction" TEXT;
ALTER TABLE "translation" ADD COLUMN "thinking" TEXT;

CREATE INDEX "translation_userId_translate_history_created_at_idx" ON "translation"("userId", "translate_history", "created_at");
