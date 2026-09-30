-- P07: dry-run report, file hash and failure reason on import jobs
ALTER TABLE "import_job"
  ADD COLUMN "content_type" TEXT NOT NULL DEFAULT 'text/csv',
  ADD COLUMN "file_hash" TEXT,
  ADD COLUMN "report" JSONB,
  ADD COLUMN "error" TEXT,
  ADD COLUMN "validated_at" TIMESTAMPTZ(3);
