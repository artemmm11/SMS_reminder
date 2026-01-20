'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAudioRecorder, RecorderStatus } from '../hooks/useAudioRecorder';

type AppState = 'idle' | 'recording' | 'transcribing' | 'editing' | 'scheduling' | 'success' | 'error';

interface FormData {
  transcript: string;
  phone: string;
  dateTime: string;
  consent: boolean;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getMinDateTime(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 5);
  // Use local time format for datetime-local input (not UTC)
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function RecordingIndicator({ duration }: { duration: number }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <div className="recording-pulse flex items-center justify-center w-24 h-24 bg-red-500 rounded-full shadow-lg">
        <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
        </svg>
      </div>
      <div className="text-4xl font-mono font-bold text-gray-800 dark:text-gray-200">
        {formatDuration(duration)}
      </div>
      <p className="text-gray-500 dark:text-gray-400 text-sm">Recording... (max 30s)</p>
    </div>
  );
}

function ErrorMessage({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
      <div className="flex items-start gap-3">
        <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
        <div className="flex-1">
          <p className="text-red-700 dark:text-red-300 text-sm">{message}</p>
        </div>
        <button
          onClick={onDismiss}
          className="text-red-500 hover:text-red-700 dark:hover:text-red-300"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function SuccessMessage({ scheduledFor, onReset }: { scheduledFor: string; onReset: () => void }) {
  const formattedDate = new Date(scheduledFor).toLocaleString();

  return (
    <div className="flex flex-col items-center gap-6 py-12">
      <div className="flex items-center justify-center w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full">
        <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
          Reminder Scheduled!
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          SMS will be sent on {formattedDate}
        </p>
      </div>
      <button
        onClick={onReset}
        className="px-6 py-3 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors"
      >
        Create Another Reminder
      </button>
    </div>
  );
}

export default function Home() {
  const [appState, setAppState] = useState<AppState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [scheduledFor, setScheduledFor] = useState<string>('');
  const [timezone, setTimezone] = useState<string>('');
  const [formData, setFormData] = useState<FormData>({
    transcript: '',
    phone: '',
    dateTime: '',
    consent: false,
  });

  const {
    status: recorderStatus,
    error: recorderError,
    duration,
    audioBlob,
    startRecording,
    stopRecording,
    cancelRecording,
    resetRecorder,
    isSupported,
  } = useAudioRecorder();

  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  useEffect(() => {
    if (recorderError) {
      setErrorMessage(recorderError.message);
      setAppState('error');
    }
  }, [recorderError]);

  const handleStartRecording = async () => {
    setErrorMessage('');
    setAppState('recording');
    await startRecording();
  };

  const handleStopRecording = async () => {
    const blob = await stopRecording();
    if (blob) {
      await transcribeAudio(blob);
    }
  };

  const handleCancelRecording = () => {
    cancelRecording();
    setAppState('idle');
  };

  const transcribeAudio = async (blob: Blob) => {
    setAppState('transcribing');

    try {
      const formData = new FormData();

      const extension = blob.type.includes('wav') ? 'wav' : blob.type.includes('webm') ? 'webm' : 'mp4';
      formData.append('audio', blob, `recording.${extension}`);

      const response = await fetch('/api/stt', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to transcribe audio');
      }

      setFormData((prev) => ({ ...prev, transcript: data.transcript }));
      setAppState('editing');
      resetRecorder();
    } catch (error: unknown) {
      const err = error as Error;
      setErrorMessage(err.message || 'Failed to transcribe audio. Please try again or type manually.');
      setAppState('error');
    }
  };

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setAppState('scheduling');

    try {
      const response = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: formData.phone,
          message: formData.transcript,
          runAt: new Date(formData.dateTime).toISOString(),
          timezone,
          consent: formData.consent,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to schedule reminder');
      }

      setScheduledFor(data.scheduledFor);
      setAppState('success');
    } catch (error: unknown) {
      const err = error as Error;
      setErrorMessage(err.message || 'Failed to schedule reminder. Please try again.');
      setAppState('error');
    }
  };

  const handleReset = useCallback(() => {
    setAppState('idle');
    setErrorMessage('');
    setScheduledFor('');
    setFormData({
      transcript: '',
      phone: '',
      dateTime: '',
      consent: false,
    });
    resetRecorder();
  }, [resetRecorder]);

  const isRecording = recorderStatus === 'recording';
  const isFormValid =
    formData.transcript.trim() &&
    formData.phone.trim() &&
    formData.dateTime &&
    formData.consent;

  if (appState === 'success') {
    return (
      <main className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900 safe-area-padding">
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <SuccessMessage scheduledFor={scheduledFor} onReset={handleReset} />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900 safe-area-padding">
      <header className="p-4 border-b border-gray-200 dark:border-gray-800">
        <h1 className="text-xl font-semibold text-center text-gray-800 dark:text-gray-200">
          SMS Reminder
        </h1>
      </header>

      <div className="flex-1 flex flex-col p-4 max-w-lg mx-auto w-full">
        {errorMessage && (
          <ErrorMessage
            message={errorMessage}
            onDismiss={() => {
              setErrorMessage('');
              if (appState === 'error') {
                setAppState(formData.transcript ? 'editing' : 'idle');
              }
            }}
          />
        )}

        {!isSupported && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
            <p className="text-yellow-700 dark:text-yellow-300 text-sm">
              Voice recording is not supported on this device. Please type your reminder manually.
            </p>
          </div>
        )}

        {(appState === 'idle' || appState === 'recording') && (
          <div className="flex-1 flex flex-col items-center justify-center">
            {isRecording ? (
              <>
                <RecordingIndicator duration={duration} />
                <div className="flex gap-4 mt-6">
                  <button
                    onClick={handleCancelRecording}
                    className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleStopRecording}
                    className="px-6 py-3 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                    Stop
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-6">
                <p className="text-gray-500 dark:text-gray-400 text-center">
                  Tap the microphone to record your reminder
                </p>
                <button
                  onClick={handleStartRecording}
                  disabled={!isSupported || recorderStatus === 'requesting-permission'}
                  className="flex items-center justify-center w-24 h-24 bg-primary-500 rounded-full shadow-lg hover:bg-primary-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors"
                >
                  {recorderStatus === 'requesting-permission' ? (
                    <svg className="w-8 h-8 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => setAppState('editing')}
                  className="text-primary-500 hover:text-primary-600 font-medium text-sm"
                >
                  Or type manually
                </button>
              </div>
            )}
          </div>
        )}

        {appState === 'transcribing' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <svg className="w-12 h-12 text-primary-500 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p className="text-gray-500 dark:text-gray-400">Transcribing your message...</p>
          </div>
        )}

        {(appState === 'editing' || appState === 'scheduling' || appState === 'error') && (
          <form onSubmit={handleSchedule} className="flex-1 flex flex-col gap-4">
            <div>
              <label htmlFor="transcript" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Reminder Message
              </label>
              <textarea
                id="transcript"
                value={formData.transcript}
                onChange={(e) => setFormData((prev) => ({ ...prev, transcript: e.target.value }))}
                placeholder="Enter your reminder message..."
                rows={4}
                maxLength={500}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
              />
              <p className="text-xs text-gray-400 mt-1 text-right">
                {formData.transcript.length}/500
              </p>
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="+1 234 567 8900"
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">
                International format (e.g., +1234567890)
              </p>
            </div>

            <div>
              <label htmlFor="dateTime" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Send At
              </label>
              <input
                type="datetime-local"
                id="dateTime"
                value={formData.dateTime}
                min={getMinDateTime()}
                onChange={(e) => setFormData((prev) => ({ ...prev, dateTime: e.target.value }))}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">
                Timezone: {timezone}
              </p>
            </div>

            <div className="flex items-start gap-3 mt-2">
              <input
                type="checkbox"
                id="consent"
                checked={formData.consent}
                onChange={(e) => setFormData((prev) => ({ ...prev, consent: e.target.checked }))}
                className="mt-1 w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-primary-500 focus:ring-primary-500"
              />
              <label htmlFor="consent" className="text-sm text-gray-600 dark:text-gray-400">
                I agree to receive SMS reminders at the phone number provided. Standard message rates may apply.
              </label>
            </div>

            <div className="flex gap-3 mt-auto pt-4">
              <button
                type="button"
                onClick={handleReset}
                className="flex-1 px-4 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Start Over
              </button>
              <button
                type="submit"
                disabled={!isFormValid || appState === 'scheduling'}
                className="flex-1 px-4 py-3 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {appState === 'scheduling' ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Scheduling...
                  </>
                ) : (
                  'Schedule'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
