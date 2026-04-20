import { env } from "@/src/env";
import { assertSafeWebhookOrigin } from "@/src/security/ssrf";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

async function graphFetch(url: string, init?: RequestInit): Promise<Response> {
  assertSafeWebhookOrigin(url);
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.META_ACCESS_TOKEN}`,
      ...(init?.headers ?? {}),
    },
  });
}

export async function fetchMediaBinary(mediaId: string): Promise<{ data: Buffer; mimeType: string }> {
  const metadataUrl = `${GRAPH_BASE}/${encodeURIComponent(mediaId)}`;
  const metadataResponse = await graphFetch(metadataUrl);

  if (!metadataResponse.ok) {
    throw new Error(`Meta media metadata request failed: ${metadataResponse.status}`);
  }

  const metadata = (await metadataResponse.json()) as { url?: string; mime_type?: string };
  if (!metadata.url) {
    throw new Error("Meta media metadata does not include lookaside URL.");
  }

  assertSafeWebhookOrigin(metadata.url);
  const mediaResponse = await fetch(metadata.url, {
    headers: {
      Authorization: `Bearer ${env.META_ACCESS_TOKEN}`,
    },
  });

  if (!mediaResponse.ok) {
    throw new Error(`Meta lookaside fetch failed: ${mediaResponse.status}`);
  }

  return {
    data: Buffer.from(await mediaResponse.arrayBuffer()),
    mimeType: metadata.mime_type ?? "audio/ogg",
  };
}

export async function sendVoiceMessage(input: {
  to: string;
  phoneNumberId: string;
  audio: Buffer;
  mimeType: string;
}): Promise<void> {
  const uploadUrl = `${GRAPH_BASE}/${encodeURIComponent(input.phoneNumberId)}/media`;
  assertSafeWebhookOrigin(uploadUrl);

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", new Blob([new Uint8Array(input.audio)], { type: input.mimeType }), "voice.ogg");
  form.append("type", "audio/ogg");

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.META_ACCESS_TOKEN}`,
    },
    body: form,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Meta media upload failed: ${uploadResponse.status}`);
  }

  const uploadPayload = (await uploadResponse.json()) as { id?: string };
  if (!uploadPayload.id) {
    throw new Error("Meta media upload did not return media id.");
  }

  const messageUrl = `${GRAPH_BASE}/${encodeURIComponent(input.phoneNumberId)}/messages`;
  assertSafeWebhookOrigin(messageUrl);

  const messageResponse = await fetch(messageUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.META_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.to,
      type: "audio",
      audio: {
        id: uploadPayload.id,
        voice: true,
      },
    }),
  });

  if (!messageResponse.ok) {
    throw new Error(`Meta message send failed: ${messageResponse.status}`);
  }
}
