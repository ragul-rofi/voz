// File: packages/db/src/schema.ts

import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const vector = <T extends number>(dimensions: T) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    toDriver(value: number[]) {
      return `[${value.join(",")}]`;
    },
  });

export const students = pgTable("students", {
  id: uuid("id").defaultRandom().primaryKey(),
  externalId: text("external_id").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  languagePreference: text("language_preference").notNull().default("en"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const contentChunks = pgTable(
  "content_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseId: uuid("course_id"),
    moduleId: text("module_id").notNull(),
    topic: text("topic").notNull(),
    subject: text("subject").notNull(),
    contentType: text("content_type").notNull(),
    text: text("text").notNull(),
    chunkIndex: integer("chunk_index").default(0),
    chunkVersion: integer("chunk_version").default(1),
    contentVersion: integer("content_version").default(1),
    embedding: vector(1536)("embedding"),
    embeddingModel: text("embedding_model").default("text-embedding-3-small"),
    embeddingVersion: integer("embedding_version").default(1),
    embeddingStatus: text("embedding_status").default("pending"),
    videoTimestampStart: integer("video_timestamp_start"),
    videoTimestampEnd: integer("video_timestamp_end"),
    sourceUrl: text("source_url"),
    sourceRef: text("source_ref"),
    sourceHash: text("source_hash"),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    sourceHashUnique: unique("content_chunks_course_source_hash_chunk_version_unique").on(
      table.courseId,
      table.sourceHash,
      table.chunkVersion,
    ),
    courseIdIdx: index("content_chunks_course_id_idx").on(table.courseId),
    embeddingStatusIdx: index("content_chunks_embedding_status_idx").on(table.embeddingStatus),
    moduleIdIdx: index("content_chunks_module_id_idx").on(table.moduleId),
    // Note: Create HNSW index in SQL migration:
    // CREATE INDEX content_chunks_embedding_hnsw_idx
    // ON content_chunks USING hnsw (embedding vector_cosine_ops)
    // WITH (m = 16, ef_construction = 64);
  }),
);

export const studySessions = pgTable("study_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  studentId: uuid("student_id")
    .notNull()
    .references(() => students.id, { onDelete: "restrict" }),
  moduleId: text("module_id").notNull(),
  subject: text("subject").notNull(),
  language: text("language").notNull().default("en"),
  turnCount: integer("turn_count").default(0),
  durationSeconds: integer("duration_seconds"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  sessionSummary: text("session_summary"),
  confusionFlags: jsonb("confusion_flags").$type<Array<{ concept: string; count: number }>>(),
  completedConcepts: text("completed_concepts").array(),
});

export const sessionTranscripts = pgTable(
  "session_transcripts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => studySessions.id, { onDelete: "cascade" }),
    turnNumber: integer("turn_number").notNull(),
    speaker: text("speaker").notNull(),
    text: text("text").notNull(),
    language: text("language").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    sessionTurnIdx: index("session_transcripts_session_turn_idx").on(
      table.sessionId,
      table.turnNumber,
    ),
  }),
);

// Compatibility tables retained while API migrates from legacy session model.
export const voiceSessions = pgTable("voice_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  studentId: uuid("student_id")
    .notNull()
    .references(() => students.id, { onDelete: "cascade" }),
  courseId: uuid("course_id").notNull(),
  channel: text("channel").notNull().default("web"),
  transcriptHistory: jsonb("transcript_history").$type<
    Array<{
      role: "user" | "assistant" | "system";
      content: string;
      timestamp: string;
    }>
  >(),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const usageEvents = pgTable("usage_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => voiceSessions.id, { onDelete: "cascade" }),
  studentId: uuid("student_id")
    .notNull()
    .references(() => students.id, { onDelete: "cascade" }),
  courseId: uuid("course_id").notNull(),
  eventType: text("event_type").notNull(),
  provider: text("provider"),
  model: text("model"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  latencyMs: integer("latency_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const cosineDistanceSql = (embedding: number[]) =>
  sql`embedding <=> ${`[${embedding.join(",")}]`}::vector`;

export type Student = typeof students.$inferSelect;
export type NewStudent = typeof students.$inferInsert;
export type ContentChunk = typeof contentChunks.$inferSelect;
export type NewContentChunk = typeof contentChunks.$inferInsert;
export type StudySessionRow = typeof studySessions.$inferSelect;
export type NewStudySessionRow = typeof studySessions.$inferInsert;
export type SessionTranscript = typeof sessionTranscripts.$inferSelect;
export type NewSessionTranscript = typeof sessionTranscripts.$inferInsert;
export type VoiceSession = typeof voiceSessions.$inferSelect;
export type NewVoiceSession = typeof voiceSessions.$inferInsert;
export type UsageEvent = typeof usageEvents.$inferSelect;
export type NewUsageEvent = typeof usageEvents.$inferInsert;
