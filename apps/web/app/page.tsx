"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Loader2, Mic, PauseCircle, PlayCircle, Radio, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

type TurnResult = {
  transcript: string;
  responseText: string;
  cacheHit: boolean;
  latencyMs: number;
  ttsMimeType: string;
  outputAudioBase64: string;
};

type TransportMode = "upload" | "stream";

const STORAGE_KEY = "voz-web-session-v1";
const DEFAULT_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const DEFAULT_WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4010";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = reader.result;
      if (typeof value !== "string") {
        reject(new Error("Unable to read recorded audio."));
        return;
      }

      const [, base64] = value.split(",");
      if (!base64) {
        reject(new Error("Recorded audio was empty."));
        return;
      }

      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to decode recorded audio."));
    reader.readAsDataURL(blob);
  });
}

function decodeBase64Audio(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mimeType });
}

export default function HomePage() {
  const [transportMode, setTransportMode] = useState<TransportMode>("upload");
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [wsBaseUrl, setWsBaseUrl] = useState(DEFAULT_WS_BASE_URL);

  const [studentId, setStudentId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [sessionId, setSessionId] = useState("");

  const [recorderMimeType, setRecorderMimeType] = useState("audio/webm");
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [result, setResult] = useState<TurnResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingTickRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const session = localStorage.getItem(STORAGE_KEY);
    if (!session) {
      setStudentId(crypto.randomUUID());
      setCourseId(crypto.randomUUID());
      setSessionId(crypto.randomUUID());
      return;
    }

    try {
      const parsed = JSON.parse(session) as {
        studentId: string;
        courseId: string;
        sessionId: string;
        apiBaseUrl?: string;
        wsBaseUrl?: string;
      };
      setStudentId(parsed.studentId);
      setCourseId(parsed.courseId);
      setSessionId(parsed.sessionId);
      setApiBaseUrl(parsed.apiBaseUrl ?? DEFAULT_API_BASE_URL);
      setWsBaseUrl(parsed.wsBaseUrl ?? DEFAULT_WS_BASE_URL);
    } catch {
      setStudentId(crypto.randomUUID());
      setCourseId(crypto.randomUUID());
      setSessionId(crypto.randomUUID());
    }
  }, []);

  useEffect(() => {
    if (!studentId || !courseId || !sessionId) {
      return;
    }

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        studentId,
        courseId,
        sessionId,
        apiBaseUrl,
        wsBaseUrl,
      }),
    );
  }, [studentId, courseId, sessionId, apiBaseUrl, wsBaseUrl]);

  useEffect(() => {
    return () => {
      if (recordingTickRef.current) {
        window.clearInterval(recordingTickRef.current);
      }

      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      wsRef.current?.close();
    };
  }, []);

  const canSend = useMemo(() => {
    return Boolean(recordedBlob && studentId && courseId && sessionId) && !isProcessing && !isRecording;
  }, [recordedBlob, studentId, courseId, sessionId, isProcessing, isRecording]);

  async function startRecording() {
    setErrorMessage(null);
    setResult(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("Microphone recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const supportedMime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType: supportedMime });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onerror = () => {
        setErrorMessage("Recording failed unexpectedly. Please retry.");
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: supportedMime });
        setRecordedBlob(blob);
        setRecorderMimeType(supportedMime);
        setIsRecording(false);
        if (recordingTickRef.current) {
          window.clearInterval(recordingTickRef.current);
          recordingTickRef.current = null;
        }
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingSeconds(0);
      setRecordedBlob(null);
      setIsRecording(true);
      recordingTickRef.current = window.setInterval(() => {
        setRecordingSeconds((value) => value + 1);
      }, 1000);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unable to access microphone.";
      setErrorMessage(reason);
    }
  }

  function stopRecording() {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== "recording") {
      return;
    }
    mediaRecorderRef.current.stop();
  }

  async function sendViaHttp(audioBase64: string): Promise<TurnResult> {
    const response = await fetch(`${apiBaseUrl}/api/voice-turn`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        studentId,
        courseId,
        sessionId,
        audioBase64,
        mimeType: recorderMimeType,
        source: "web",
      }),
    });

    const body = await response.json();
    if (!response.ok) {
      const error = typeof body?.error === "string" ? body.error : `HTTP ${response.status}`;
      throw new Error(error);
    }

    return body as TurnResult;
  }

  async function sendViaWebSocket(audioBase64: string): Promise<TurnResult> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`${wsBaseUrl}/ws/audio`);
      wsRef.current = socket;

      socket.onopen = () => {
        socket.send(
          JSON.stringify({
            studentId,
            courseId,
            sessionId,
            audioBase64,
            mimeType: recorderMimeType,
            source: "web",
          }),
        );
      };

      socket.onerror = () => {
        reject(new Error("WebSocket connection failed."));
        socket.close();
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string) as
            | ({ ok: true } & TurnResult)
            | { ok: false; error?: string };

          if (!payload.ok) {
            reject(new Error(payload.error ?? "WebSocket voice turn failed."));
            socket.close();
            return;
          }

          resolve({
            transcript: payload.transcript,
            responseText: payload.responseText,
            outputAudioBase64: payload.outputAudioBase64,
            ttsMimeType: payload.ttsMimeType,
            cacheHit: payload.cacheHit,
            latencyMs: payload.latencyMs,
          });
          socket.close();
        } catch {
          reject(new Error("Invalid response from realtime server."));
          socket.close();
        }
      };

      socket.onclose = () => {
        if (wsRef.current === socket) {
          wsRef.current = null;
        }
      };
    });
  }

  async function runVoiceTurn() {
    if (!recordedBlob) {
      setErrorMessage("Record audio before sending.");
      return;
    }

    setErrorMessage(null);
    setIsProcessing(true);

    try {
      const audioBase64 = await blobToBase64(recordedBlob);
      const payload = transportMode === "upload"
        ? await sendViaHttp(audioBase64)
        : await sendViaWebSocket(audioBase64);

      setResult(payload);

      const audioBlob = decodeBase64Audio(payload.outputAudioBase64, payload.ttsMimeType);
      const audioUrl = URL.createObjectURL(audioBlob);
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.play().catch(() => {
          setErrorMessage("Reply received, but autoplay was blocked. Press Play.");
        });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Voice turn failed.";
      setErrorMessage(reason);
    } finally {
      setIsProcessing(false);
    }
  }

  function resetSession() {
    setSessionId(crypto.randomUUID());
    setResult(null);
    setRecordedBlob(null);
    setErrorMessage(null);
  }

  function recordingLabel(seconds: number): string {
    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-10 sm:px-8">
      <section className="rounded-3xl border bg-[var(--panel)] p-6 shadow-[0_24px_70px_-40px_rgba(13,148,136,0.45)]">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="inline-flex items-center gap-2 rounded-full bg-[var(--muted)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
            <Mic className="h-3.5 w-3.5" />
            Voz Voice Console
          </p>
          <Button variant="outline" onClick={resetSession}>
            <RotateCcw className="h-4 w-4" />
            New Session
          </Button>
        </div>

        <h1 className="text-3xl font-bold tracking-tight">Speak, Stream, and Hear Responses</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-700">
          Record with your microphone, send with upload or realtime transport, and keep a continuous session context.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Student ID
            <input
              className="rounded-xl border bg-white p-2.5 outline-none focus:ring-2 focus:ring-[var(--primary)]"
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Course ID
            <input
              className="rounded-xl border bg-white p-2.5 outline-none focus:ring-2 focus:ring-[var(--primary)]"
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            Session ID
            <input
              className="rounded-xl border bg-white p-2.5 outline-none focus:ring-2 focus:ring-[var(--primary)]"
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
            />
          </label>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            API Base URL (Upload)
            <input
              className="rounded-xl border bg-white p-2.5 outline-none focus:ring-2 focus:ring-[var(--primary)]"
              value={apiBaseUrl}
              onChange={(event) => setApiBaseUrl(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            WebSocket Base URL (Stream)
            <input
              className="rounded-xl border bg-white p-2.5 outline-none focus:ring-2 focus:ring-[var(--primary)]"
              value={wsBaseUrl}
              onChange={(event) => setWsBaseUrl(event.target.value)}
            />
          </label>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button
            variant={transportMode === "upload" ? "default" : "outline"}
            onClick={() => setTransportMode("upload")}
          >
            <Send className="h-4 w-4" />
            Upload Mode
          </Button>
          <Button
            variant={transportMode === "stream" ? "default" : "outline"}
            onClick={() => setTransportMode("stream")}
          >
            <Radio className="h-4 w-4" />
            Stream Mode
          </Button>
        </div>

        <div className="mt-6 rounded-2xl border bg-white p-4">
          <p className="text-sm font-semibold">Microphone Capture</p>
          <p className="mt-1 text-xs text-slate-600">
            {isRecording
              ? `Recording... ${recordingLabel(recordingSeconds)}`
              : recordedBlob
                ? "Recording ready. Send it now."
                : "Press Start Recording to capture your voice."}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {isRecording ? (
              <Button onClick={stopRecording}>
                <PauseCircle className="h-4 w-4" />
                Stop Recording
              </Button>
            ) : (
              <Button onClick={startRecording} disabled={isProcessing}>
                <Mic className="h-4 w-4" />
                Start Recording
              </Button>
            )}

            <Button onClick={runVoiceTurn} disabled={!canSend}>
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {isProcessing ? "Sending..." : `Send (${transportMode})`}
            </Button>
          </div>
        </div>

        {errorMessage ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{errorMessage}</p>
          </div>
        ) : null}
      </section>

      {result ? (
        <section className="mt-6 rounded-3xl border bg-white p-6 shadow-[0_24px_70px_-45px_rgba(2,132,199,0.5)]">
          <h2 className="text-lg font-semibold">Latest Voice Turn</h2>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <p>
              <span className="font-semibold">Mode:</span> {transportMode}
            </p>
            <p>
              <span className="font-semibold">Latency:</span> {result.latencyMs}ms
            </p>
            <p>
              <span className="font-semibold">Cache:</span> {String(result.cacheHit)}
            </p>
          </div>
          <p className="mt-3 text-sm">
            <span className="font-semibold">Transcript:</span> {result.transcript}
          </p>
          <p className="mt-2 text-sm">
            <span className="font-semibold">Tutor Reply:</span> {result.responseText}
          </p>

          <audio ref={audioRef} controls className="mt-4 w-full" />
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
            <PlayCircle className="h-4 w-4" />
            Reply audio is prepared for immediate playback.
          </div>
        </section>
      ) : null}
    </main>
  );
}
