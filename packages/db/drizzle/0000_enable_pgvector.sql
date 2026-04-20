-- File: packages/db/drizzle/0000_enable_pgvector.sql

CREATE EXTENSION IF NOT EXISTS vector;

CREATE INDEX IF NOT EXISTS content_chunks_embedding_hnsw_idx
  ON content_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
