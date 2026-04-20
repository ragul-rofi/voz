import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import HomePage from "./page";

class MockMediaRecorder {
  static isTypeSupported() {
    return true;
  }

  public ondataavailable: ((event: { data: Blob }) => void) | null = null;
  public onerror: (() => void) | null = null;
  public onstop: (() => void) | null = null;
  public state: "inactive" | "recording" = "inactive";

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob(["voice"], { type: "audio/webm" }),
    });
    this.onstop?.();
  }
}

describe("Web voice smoke", () => {
  it("records, sends upload request, and renders TTS response", async () => {
    vi.spyOn(window, "setInterval").mockImplementation(() => 1 as unknown as ReturnType<typeof setInterval>);
    vi.spyOn(window, "clearInterval").mockImplementation(() => {});

    Object.defineProperty(globalThis, "MediaRecorder", {
      value: MockMediaRecorder,
      writable: true,
    });

    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
      configurable: true,
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        transcript: "student asks question",
        responseText: "teacher response",
        outputAudioBase64: btoa("audio-bytes"),
        ttsMimeType: "audio/wav",
        cacheHit: false,
        latencyMs: 150,
      }),
    });

    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      configurable: true,
    });

    render(<HomePage />);

    fireEvent.click(screen.getByText("Start Recording"));
    await waitFor(() => {
      expect(screen.getByText("Stop Recording")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Stop Recording"));

    await waitFor(() => {
      expect(screen.getByText("Send (upload)")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Send (upload)"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByText(/teacher response/i)).toBeTruthy();
      expect(screen.getByText(/student asks question/i)).toBeTruthy();
    });
  });
});
