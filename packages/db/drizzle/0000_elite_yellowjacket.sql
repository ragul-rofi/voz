CREATE TABLE IF NOT EXISTS "content_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" text NOT NULL,
	"topic" text NOT NULL,
	"subject" text NOT NULL,
	"content_type" text NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(1536),
	"video_timestamp_start" integer,
	"video_timestamp_end" integer,
	"source_url" text,
	"source_hash" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "content_chunks_source_hash_unique" UNIQUE("source_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session_transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"turn_number" integer NOT NULL,
	"speaker" text NOT NULL,
	"text" text NOT NULL,
	"language" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"language_preference" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "students_external_id_unique" UNIQUE("external_id"),
	CONSTRAINT "students_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "study_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"module_id" text NOT NULL,
	"subject" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"turn_count" integer DEFAULT 0,
	"duration_seconds" integer,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"session_summary" text,
	"confusion_flags" jsonb,
	"completed_concepts" text[]
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "session_transcripts" ADD CONSTRAINT "session_transcripts_session_id_study_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_chunks_module_id_idx" ON "content_chunks" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_transcripts_session_turn_idx" ON "session_transcripts" USING btree ("session_id","turn_number");