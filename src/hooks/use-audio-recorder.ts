"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUDIO_BITS_PER_SECOND,
  MAX_RECORDING_SECONDS,
  RECORDER_ERROR_MESSAGES,
  classifyGetUserMediaError,
  detectRecordingSupport,
  pickSupportedMimeType,
  type RecorderErrorKind,
} from "@/lib/consultation/media";

export type MicStatus = "inactive" | "active" | "muted" | "ended";

export class RecorderError extends Error {
  constructor(readonly kind: RecorderErrorKind) {
    super(RECORDER_ERROR_MESSAGES[kind]);
    this.name = "RecorderError";
  }
}

export interface RecordedAudio {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
}

interface Options {
  /** Called if capture stops unexpectedly (device unplugged, permission revoked, recorder error). */
  onInterrupted?: (message: string) => void;
  /** Called when MAX_RECORDING_SECONDS is reached. */
  onMaxDuration?: () => void;
}

/**
 * Local microphone recording with MediaRecorder.
 *
 * - Microphone permission is requested only when start() is called.
 * - Audio chunks are kept ONLY in memory (a ref) – never in any browser storage,
 *   and nothing is sent over the network during recording.
 * - release() stops all tracks and drops every reference to the audio data.
 *   (Dropping references lets the browser reclaim memory; it is NOT a
 *   guarantee of forensic erasure from RAM.)
 */
export function useAudioRecorder({ onInterrupted, onMaxDuration }: Options = {}) {
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const accumulatedMsRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);
  const expectedStopRef = useRef(false);
  const callbacksRef = useRef({ onInterrupted, onMaxDuration });
  callbacksRef.current = { onInterrupted, onMaxDuration };

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [micStatus, setMicStatus] = useState<MicStatus>("inactive");
  const [level, setLevel] = useState(0);
  const [supportError, setSupportError] = useState<RecorderErrorKind | null>(null);

  useEffect(() => {
    setSupportError(detectRecordingSupport(typeof window !== "undefined" ? window : undefined));
  }, []);

  const currentElapsedMs = () =>
    accumulatedMsRef.current + (segmentStartRef.current !== null ? performance.now() - segmentStartRef.current : 0);

  const stopMeters = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setLevel(0);
  }, []);

  const release = useCallback(() => {
    expectedStopRef.current = true;
    stopMeters();
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    chunksRef.current = [];
    accumulatedMsRef.current = 0;
    segmentStartRef.current = null;
    setElapsedSeconds(0);
    setMicStatus("inactive");
  }, [stopMeters]);

  // Release the microphone if the component unmounts mid-recording.
  useEffect(() => release, [release]);

  const startMeters = useCallback((stream: MediaStream) => {
    timerRef.current = setInterval(() => {
      const secs = currentElapsedMs() / 1000;
      setElapsedSeconds(secs);
      if (secs >= MAX_RECORDING_SECONDS) callbacksRef.current.onMaxDuration?.();
    }, 250);
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        const rms = Math.sqrt(sum / data.length);
        setLevel(recorderRef.current?.state === "recording" ? Math.min(1, rms * 4) : 0);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      /* level meter is optional */
    }
  }, []);

  const start = useCallback(async () => {
    const unsupported = detectRecordingSupport(window);
    if (unsupported) throw new RecorderError(unsupported);
    release();
    expectedStopRef.current = false;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        video: false,
      });
    } catch (err) {
      throw new RecorderError(classifyGetUserMediaError(err));
    }
    streamRef.current = stream;

    const mimeType = pickSupportedMimeType((m) => MediaRecorder.isTypeSupported(m));
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
    } catch {
      release();
      throw new RecorderError("unsupported");
    }
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onerror = () => {
      if (!expectedStopRef.current) callbacksRef.current.onInterrupted?.("Înregistrarea a fost întreruptă de o eroare a browserului.");
    };
    const track = stream.getAudioTracks()[0];
    if (track) {
      track.onended = () => {
        if (!expectedStopRef.current) {
          setMicStatus("ended");
          callbacksRef.current.onInterrupted?.("Microfonul a fost deconectat sau accesul a fost revocat. Înregistrarea a fost oprită.");
        }
      };
      track.onmute = () => setMicStatus("muted");
      track.onunmute = () => setMicStatus("active");
    }

    // Chunks every second are kept locally; nothing is uploaded during recording.
    recorder.start(1000);
    segmentStartRef.current = performance.now();
    accumulatedMsRef.current = 0;
    setElapsedSeconds(0);
    setMicStatus("active");
    startMeters(stream);
  }, [release, startMeters]);

  const pause = useCallback(() => {
    const rec = recorderRef.current;
    if (rec?.state === "recording") {
      rec.pause();
      if (segmentStartRef.current !== null) accumulatedMsRef.current += performance.now() - segmentStartRef.current;
      segmentStartRef.current = null;
      setElapsedSeconds(accumulatedMsRef.current / 1000);
    }
  }, []);

  const resume = useCallback(() => {
    const rec = recorderRef.current;
    if (rec?.state === "paused") {
      rec.resume();
      segmentStartRef.current = performance.now();
    }
  }, []);

  /** Stops recording, releases the microphone and returns the audio Blob (memory only). */
  const stop = useCallback(async (): Promise<RecordedAudio> => {
    const rec = recorderRef.current;
    expectedStopRef.current = true;
    const durationSeconds = currentElapsedMs() / 1000;
    if (rec && rec.state !== "inactive") {
      await new Promise<void>((resolve) => {
        rec.addEventListener("stop", () => resolve(), { once: true });
        try {
          rec.stop();
        } catch {
          resolve();
        }
      });
    }
    const mimeType = rec?.mimeType || chunksRef.current[0]?.type || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];
    release();
    return { blob, mimeType, durationSeconds };
  }, [release]);

  /** Collects whatever was captured before an interruption. */
  const salvage = useCallback((): RecordedAudio | null => {
    const chunks = chunksRef.current;
    if (!chunks.length) return null;
    const mimeType = chunks[0]?.type || "audio/webm";
    const result = { blob: new Blob(chunks, { type: mimeType }), mimeType, durationSeconds: currentElapsedMs() / 1000 };
    release();
    return result;
  }, [release]);

  return { start, pause, resume, stop, salvage, release, elapsedSeconds, micStatus, level, supportError };
}
