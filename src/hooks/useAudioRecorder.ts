'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export type RecorderStatus =
  | 'idle'
  | 'requesting-permission'
  | 'ready'
  | 'recording'
  | 'stopping'
  | 'error';

export interface RecorderError {
  code: 'PERMISSION_DENIED' | 'NOT_SUPPORTED' | 'RECORDING_FAILED' | 'UNKNOWN';
  message: string;
}

export interface UseAudioRecorderReturn {
  status: RecorderStatus;
  error: RecorderError | null;
  duration: number;
  audioBlob: Blob | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  cancelRecording: () => void;
  resetRecorder: () => void;
  isSupported: boolean;
}

const MAX_DURATION_MS = 30000;

function isMediaRecorderSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window.MediaRecorder && navigator.mediaDevices?.getUserMedia);
}

function getPreferredMimeType(): string {
  if (typeof window === 'undefined') return 'audio/webm';

  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/wav',
  ];

  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  return 'audio/webm';
}

function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  const offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [error, setError] = useState<RecorderError | null>(null);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const maxDurationTimerRef = useRef<NodeJS.Timeout | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | ScriptProcessorNode | null>(null);
  const pcmDataRef = useRef<Float32Array[]>([]);
  const useFallbackRef = useRef(false);

  useEffect(() => {
    setIsSupported(
      typeof window !== 'undefined' &&
        !!(navigator.mediaDevices?.getUserMedia)
    );
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    pcmDataRef.current = [];
  }, []);

  const startDurationTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setDuration(Math.min(elapsed, 30));
    }, 100);
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setAudioBlob(null);
    setDuration(0);
    setStatus('requesting-permission');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      streamRef.current = stream;

      if (isMediaRecorderSupported()) {
        const mimeType = getPreferredMimeType();
        useFallbackRef.current = false;

        try {
          const mediaRecorder = new MediaRecorder(stream, { mimeType });
          mediaRecorderRef.current = mediaRecorder;
          chunksRef.current = [];

          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              chunksRef.current.push(event.data);
            }
          };

          mediaRecorder.start(100);
          setStatus('recording');
          startDurationTimer();

          maxDurationTimerRef.current = setTimeout(() => {
            if (status === 'recording') {
              stopRecording();
            }
          }, MAX_DURATION_MS);

          return;
        } catch {
          console.log('MediaRecorder failed, using fallback');
          useFallbackRef.current = true;
        }
      } else {
        useFallbackRef.current = true;
      }

      const AudioContextClass =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioContextClass({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      pcmDataRef.current = [];

      if (audioContext.audioWorklet) {
        try {
          const workletCode = `
            class RecorderProcessor extends AudioWorkletProcessor {
              process(inputs) {
                const input = inputs[0];
                if (input && input[0]) {
                  this.port.postMessage(input[0]);
                }
                return true;
              }
            }
            registerProcessor('recorder-processor', RecorderProcessor);
          `;

          const blob = new Blob([workletCode], { type: 'application/javascript' });
          const url = URL.createObjectURL(blob);
          await audioContext.audioWorklet.addModule(url);
          URL.revokeObjectURL(url);

          const workletNode = new AudioWorkletNode(audioContext, 'recorder-processor');
          workletNode.port.onmessage = (e) => {
            pcmDataRef.current.push(new Float32Array(e.data));
          };

          source.connect(workletNode);
          workletNode.connect(audioContext.destination);
          workletNodeRef.current = workletNode;
        } catch {
          const scriptNode = audioContext.createScriptProcessor(4096, 1, 1);
          scriptNode.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            pcmDataRef.current.push(new Float32Array(inputData));
          };

          source.connect(scriptNode);
          scriptNode.connect(audioContext.destination);
          workletNodeRef.current = scriptNode;
        }
      } else {
        const scriptNode = audioContext.createScriptProcessor(4096, 1, 1);
        scriptNode.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          pcmDataRef.current.push(new Float32Array(inputData));
        };

        source.connect(scriptNode);
        scriptNode.connect(audioContext.destination);
        workletNodeRef.current = scriptNode;
      }

      setStatus('recording');
      startDurationTimer();

      maxDurationTimerRef.current = setTimeout(() => {
        stopRecording();
      }, MAX_DURATION_MS);
    } catch (err: unknown) {
      cleanup();

      const domError = err as DOMException;
      if (domError.name === 'NotAllowedError' || domError.name === 'PermissionDeniedError') {
        setError({
          code: 'PERMISSION_DENIED',
          message:
            'Microphone access denied. Please allow microphone access in your browser settings and reload the page.',
        });
      } else if (domError.name === 'NotFoundError' || domError.name === 'NotSupportedError') {
        setError({
          code: 'NOT_SUPPORTED',
          message: 'No microphone found or audio recording is not supported on this device.',
        });
      } else {
        setError({
          code: 'UNKNOWN',
          message: 'Failed to start recording. Please try again.',
        });
      }
      setStatus('error');
    }
  }, [cleanup, startDurationTimer, status]);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    if (status !== 'recording') {
      return null;
    }

    setStatus('stopping');

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }

    return new Promise((resolve) => {
      if (!useFallbackRef.current && mediaRecorderRef.current) {
        const mediaRecorder = mediaRecorderRef.current;

        mediaRecorder.onstop = () => {
          const mimeType = mediaRecorder.mimeType || 'audio/webm';
          const blob = new Blob(chunksRef.current, { type: mimeType });

          setAudioBlob(blob);
          setStatus('ready');

          if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
          }

          resolve(blob);
        };

        mediaRecorder.stop();
      } else {
        if (workletNodeRef.current) {
          workletNodeRef.current.disconnect();
        }

        const sampleRate = audioContextRef.current?.sampleRate || 16000;
        const totalLength = pcmDataRef.current.reduce((acc, arr) => acc + arr.length, 0);
        const combined = new Float32Array(totalLength);

        let offset = 0;
        for (const chunk of pcmDataRef.current) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }

        const wavBlob = encodeWAV(combined, sampleRate);
        setAudioBlob(wavBlob);
        setStatus('ready');

        cleanup();
        resolve(wavBlob);
      }
    });
  }, [status, cleanup]);

  const cancelRecording = useCallback(() => {
    cleanup();
    setStatus('idle');
    setError(null);
    setDuration(0);
    setAudioBlob(null);
  }, [cleanup]);

  const resetRecorder = useCallback(() => {
    cleanup();
    setStatus('idle');
    setError(null);
    setDuration(0);
    setAudioBlob(null);
  }, [cleanup]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    status,
    error,
    duration,
    audioBlob,
    startRecording,
    stopRecording,
    cancelRecording,
    resetRecorder,
    isSupported,
  };
}
