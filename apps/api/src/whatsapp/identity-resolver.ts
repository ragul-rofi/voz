import { and, desc, eq, gte } from "drizzle-orm";
import { db, students, voiceSessions } from "@voz/db";

const ACTIVE_SESSION_WINDOW_HOURS = 12;

type ResolveInput = {
  from: string;
  messageTimestamp: string;
};

export type ResolvedWhatsAppIdentity = {
  studentId: string;
  courseId: string;
  sessionId: string;
};

function normalizeWhatsAppFrom(from: string): string {
  return from.replace(/[^0-9]/g, "").trim();
}

function parseMessageDate(timestamp: string): Date {
  const asNumber = Number(timestamp);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    // Meta webhook timestamps are epoch seconds.
    return new Date(asNumber * 1000);
  }
  return new Date();
}

function activeWindowStart(messageDate: Date): Date {
  return new Date(messageDate.getTime() - ACTIVE_SESSION_WINDOW_HOURS * 60 * 60 * 1000);
}

export async function resolveWhatsAppIdentity(input: ResolveInput): Promise<ResolvedWhatsAppIdentity> {
  const normalizedFrom = normalizeWhatsAppFrom(input.from);
  const whatsappExternalId = `whatsapp:${normalizedFrom}`;
  const rawExternalId = normalizedFrom;

  const student = await db.query.students.findFirst({
    where: eq(students.externalId, whatsappExternalId),
  }) ?? await db.query.students.findFirst({
    where: eq(students.externalId, rawExternalId),
  });

  if (!student) {
    throw new Error(
      `No student mapping found for WhatsApp sender ${normalizedFrom}. ` +
      "Create a student with external_id 'whatsapp:<phone>' or '<phone>'.",
    );
  }

  const messageDate = parseMessageDate(input.messageTimestamp);
  const recentSession = await db.query.voiceSessions.findFirst({
    where: and(
      eq(voiceSessions.studentId, student.id),
      eq(voiceSessions.channel, "whatsapp"),
      gte(voiceSessions.lastActivityAt, activeWindowStart(messageDate)),
    ),
    orderBy: [desc(voiceSessions.lastActivityAt)],
  });

  if (recentSession) {
    return {
      studentId: student.id,
      courseId: recentSession.courseId,
      sessionId: recentSession.id,
    };
  }

  const latestKnownSession = await db.query.voiceSessions.findFirst({
    where: eq(voiceSessions.studentId, student.id),
    orderBy: [desc(voiceSessions.lastActivityAt)],
  });

  if (!latestKnownSession) {
    throw new Error(
      `No course/session context found for WhatsApp sender ${normalizedFrom}. ` +
      "Start a first session for this student from web or pre-create a voice_sessions record.",
    );
  }

  const inserted = await db.insert(voiceSessions).values({
    studentId: student.id,
    courseId: latestKnownSession.courseId,
    channel: "whatsapp",
    lastActivityAt: messageDate,
    createdAt: messageDate,
    updatedAt: messageDate,
  }).returning({
    id: voiceSessions.id,
    courseId: voiceSessions.courseId,
  });

  const session = inserted[0];
  if (!session) {
    throw new Error("Failed to create WhatsApp voice session.");
  }

  return {
    studentId: student.id,
    courseId: session.courseId,
    sessionId: session.id,
  };
}
