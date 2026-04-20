export interface WhatsAppAudioJob {
  messageId: string;
  mediaId: string;
  from: string;
  phoneNumberId: string;
  timestamp: string;
}

export interface RagIngestDocumentJob {
  ingestionId: string;
  courseId: string;
  moduleId: string;
  subject: string;
  topic: string;
  contentType: string;
  sourceRef?: string;
  sourceUrl?: string;
  rawText: string;
  contentVersion: number;
  chunkVersion: number;
  embeddingVersion: number;
  embeddingModel: string;
}

export interface RagEmbedChunkJob {
  ingestionId: string;
  chunkId: string;
  courseId: string;
  text: string;
  embeddingVersion: number;
  embeddingModel: string;
}
