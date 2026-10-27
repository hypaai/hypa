-- Carries the history that was only visible through "developer_request" into
-- "translation". "developer_request" rows are read, never changed.
--
-- A Hypa translation was written to both tables, so a row that has a
-- "translation" twin (same user, same text ignoring surrounding and repeated
-- whitespace, created within five minutes, nearest first, each row used once)
-- only hands its client id, bookmark, feedback and thinking to that twin. The
-- time window is the join condition, so only a user's rows near each source row
-- are compared, through the ("userId", "translate_history", "created_at") index. Every other visible row becomes a new "translation"
-- row under its own id, so ids already held by clients keep working.
WITH source AS (
  SELECT
    dr."id",
    dr."userId",
    dr."model",
    dr."provider"::text AS "provider",
    dr."created_at",
    dr."updated_at",
    dr."data",
    COALESCE(dr."data"->>'input_text', dr."data"->>'text', '') AS "input_text",
    btrim(regexp_replace(
      COALESCE(dr."data"->>'input_text', dr."data"->>'text', ''), '\s+', ' ', 'g'
    )) AS "normalized_input",
    COALESCE(dr."data"->>'output_text', '') AS "output_text"
  FROM "developer_request" dr
  WHERE dr."type" = 'machine_translation'
    AND (
      dr."data"->>'exclude_from_history' IS NULL
      OR dr."data"->>'exclude_from_history' = 'false'
    )
    AND COALESCE(dr."data"->>'input_text', dr."data"->>'text', '') <> ''
    AND COALESCE(dr."data"->>'output_text', '') <> ''
),
pairs AS (
  SELECT
    s."id" AS "source_id",
    t."id" AS "translation_id",
    ABS(EXTRACT(EPOCH FROM (t."created_at" - s."created_at"))) AS "gap"
  FROM source s
  JOIN "translation" t
    ON t."userId" = s."userId"
    AND t."translate_history"
    AND t."created_at" BETWEEN s."created_at" - interval '5 minutes'
      AND s."created_at" + interval '5 minutes'
  WHERE btrim(regexp_replace(t."input_text", '\s+', ' ', 'g')) = s."normalized_input"
),
nearest_translation AS (
  SELECT DISTINCT ON ("source_id") *
  FROM pairs
  ORDER BY "source_id", "gap", "translation_id"
),
matched AS (
  SELECT DISTINCT ON ("translation_id") *
  FROM nearest_translation
  ORDER BY "translation_id", "gap", "source_id"
),
updated AS (
  UPDATE "translation" t
  SET
    "client_request_id" = s."data"->>'client_request_id',
    "bookmarked" = COALESCE(s."data"->>'bookmarked' = 'true', false),
    "liked" = CASE s."data"->>'liked'
      WHEN 'true' THEN true
      WHEN 'false' THEN false
    END,
    "correction" = NULLIF(s."data"->>'correction', ''),
    "thinking" = NULLIF(btrim(s."data"->>'thinking'), '')
  FROM matched m
  JOIN source s ON s."id" = m."source_id"
  WHERE t."id" = m."translation_id"
  RETURNING t."id"
)
INSERT INTO "translation" (
  "id",
  "input_text",
  "output_text",
  "source_lang",
  "target_lang",
  "created_at",
  "updated_at",
  "model",
  "provider",
  "translate_history",
  "client_request_id",
  "bookmarked",
  "liked",
  "correction",
  "thinking",
  "userId"
)
SELECT
  s."id",
  s."input_text",
  s."output_text",
  COALESCE(s."data"->>'source_lang', s."data"->>'detected_source_lang'),
  s."data"->>'target_lang',
  s."created_at",
  s."updated_at",
  s."model",
  s."provider",
  true,
  s."data"->>'client_request_id',
  COALESCE(s."data"->>'bookmarked' = 'true', false),
  CASE s."data"->>'liked'
    WHEN 'true' THEN true
    WHEN 'false' THEN false
  END,
  NULLIF(s."data"->>'correction', ''),
  NULLIF(btrim(s."data"->>'thinking'), ''),
  s."userId"
FROM source s
WHERE NOT EXISTS (SELECT 1 FROM matched m WHERE m."source_id" = s."id");
