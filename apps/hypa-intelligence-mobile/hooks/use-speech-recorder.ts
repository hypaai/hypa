import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { File } from "expo-file-system";

import { useToast } from "@/lib/toast";
import { speechToText } from "@/lib/product-api";

const AUDIO_MAX_DURATION = 30;

export type RecordingState = "idle" | "starting" | "recording" | "stopping" | "transcribing";

type UseSpeechRecorderOptions = {
  asrModel: string;
  provider?: string;
  onTranscript: (text: string) => void;
  onNoTranscript?: () => void;
  runWithConsent: (action: () => void) => void;
  stopPlayers: () => void;
  toast: ReturnType<typeof useToast>;
};

export const useSpeechRecorder = ({
  asrModel,
  provider,
  onTranscript,
  onNoTranscript,
  runWithConsent,
  stopPlayers,
  toast,
}: UseSpeechRecorderOptions) => {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [lastRecordingUri, setLastRecordingUri] = useState<string | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isStoppingRecordingRef = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const starting = useRef(false);

  const isRecording = recordingState === "starting" || recordingState === "recording";
  const isRecordingActive = recordingState === "recording";
  const isBusy = recordingState === "stopping" || recordingState === "transcribing";

  const sttMutation = useMutation({
    mutationFn: ({ epoch: _epoch, ...params }: Parameters<typeof speechToText>[0] & { epoch: number }) => speechToText(params),
    onSuccess: (data, variables) => {
      if (!mounted.current || variables.epoch !== generation.current) return;
      const textResult = data.text.trim();
      if (textResult) onTranscript(textResult);
      else onNoTranscript?.();
    },
    onError: (error, variables) => {
      if (!mounted.current || variables.epoch !== generation.current) return;
      onNoTranscript?.();
      toast.showError(
        "Transcription failed",
        error instanceof Error ? error.message : "Please try again."
      );
    },
    onSettled: (_data, _error, variables) => {
      if (mounted.current && variables.epoch === generation.current) setRecordingState("idle");
    },
  });

  const startRecording = useCallback(async () => {
    if (starting.current || recordingState !== "idle" || sttMutation.isPending) return false;
    starting.current = true;
    const epoch = ++generation.current;
    try {
      setRecordingState("starting");
      setLastRecordingUri(null);
      stopPlayers();
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!mounted.current || epoch !== generation.current) return false;
      if (!permission.granted) {
        setRecordingState("idle");
        toast.showError(
          "Microphone required",
          "Microphone permission is required to record audio."
        );
        return false;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      if (!mounted.current || epoch !== generation.current) return false;
      await recorder.prepareToRecordAsync();
      if (!mounted.current || epoch !== generation.current) { await recorder.stop().catch(() => {}); return false; }
      recorder.record();
      setRecordingSeconds(0);
      setRecordingState("recording");
      return true;
    } catch (error) {
      if (!mounted.current || epoch !== generation.current) return false;
      setRecordingState("idle");
      toast.showError(
        "Recording failed",
        error instanceof Error ? error.message : "Unable to start recording."
      );
      return false;
    } finally {
      starting.current = false;
    }
  }, [recorder, recordingState, stopPlayers, sttMutation.isPending, toast]);

  const transcribeRecordingUri = useCallback(
    async (uri: string, epoch: number) => {
      if (sttMutation.isPending) return;
      try {
        const audio = await new File(uri).base64();
        if (mounted.current && epoch === generation.current) sttMutation.mutate({ audio, model: asrModel, provider, epoch });
      } catch (error) {
        if (mounted.current && epoch === generation.current) { setRecordingState('idle'); onNoTranscript?.(); toast.showError('Transcription failed', error instanceof Error ? error.message : 'Unable to read recording.'); }
      }
    },
    [asrModel, provider, sttMutation, toast]
  );

  const stopRecording = useCallback(
    async (showLimitToast = false) => {
      if (isStoppingRecordingRef.current || recordingState !== "recording") return;
      isStoppingRecordingRef.current = true;
      const epoch = generation.current;
      setRecordingState("stopping");
      try {
        await recorder.stop();
        if (!mounted.current || epoch !== generation.current) return;
        const uri = recorder.uri;
        setRecordingSeconds(0);
        if (showLimitToast) {
          toast.showInfo(`${AUDIO_MAX_DURATION} seconds timer limit reached`);
        }
        if (!uri) {
          setRecordingState("idle");
          onNoTranscript?.();
          return;
        }
        setLastRecordingUri(uri);
        setRecordingState("idle");
        runWithConsent(() => {
          if (!mounted.current || epoch !== generation.current) return;
          setRecordingState("transcribing");
          void transcribeRecordingUri(uri, epoch);
        });
      } catch (error) {
        if (!mounted.current || epoch !== generation.current) return;
        setRecordingState("idle");
        onNoTranscript?.();
        toast.showError(
          "Recording failed",
          error instanceof Error ? error.message : "Unable to stop recording."
        );
      } finally {
        isStoppingRecordingRef.current = false;
      }
    },
    [recorder, recordingState, runWithConsent, toast, transcribeRecordingUri]
  );

  const cancelRecording = useCallback(async () => {
    generation.current++;
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    if (recorder.isRecording) await recorder.stop().catch(() => {});
    if (mounted.current) { setRecordingState('idle'); setRecordingSeconds(0); }
  }, [recorder]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; void cancelRecording(); };
  }, [cancelRecording]);

  useEffect(() => {
    if (isRecordingActive) {
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((current) => {
          const next = current + 1;
          if (next >= AUDIO_MAX_DURATION) {
            void stopRecording(true);
          }
          return Math.min(next, AUDIO_MAX_DURATION);
        });
      }, 1000);
    } else if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    };
  }, [isRecordingActive, stopRecording]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      void stopRecording();
    } else {
      void startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  return {
    isRecording,
    isBusy,
    isTranscribing: recordingState === "transcribing" || sttMutation.isPending,
    recordingState,
    remainingSeconds: Math.max(AUDIO_MAX_DURATION - recordingSeconds, 0),
    lastRecordingUri,
    startRecording,
    stopRecording,
    toggleRecording,
    cancelRecording,
  };
};
