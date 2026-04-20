-- Add course-scoped and versioned RAG ingestion metadata
ALTER TABLE content_chunks
  ADD COLUMN IF NOT EXISTS course_id uuid,
  ADD COLUMN IF NOT EXISTS chunk_index integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chunk_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS content_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS embedding_model text DEFAULT 'text-embedding-3-small',
  ADD COLUMN IF NOT EXISTS embedding_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS embedding_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS source_ref text,
  ADD COLUMN IF NOT EXISTS ingested_at timestamptz DEFAULT now();

DROP INDEX IF EXISTS content_chunks_source_hash_unique;

CREATE UNIQUE INDEX IF NOT EXISTS content_chunks_course_source_hash_chunk_version_unique
  ON content_chunks (course_id, source_hash, chunk_version);

CREATE INDEX IF NOT EXISTS content_chunks_course_id_idx
  ON content_chunks (course_id);

CREATE INDEX IF NOT EXISTS content_chunks_embedding_status_idx
  ON content_chunks (embedding_status);
