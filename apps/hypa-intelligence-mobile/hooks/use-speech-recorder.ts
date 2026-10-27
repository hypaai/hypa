import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { File } from "expo-file-system";

import { useToast } from "@/lib/toast";
import { speechToText } from "@/lib/product-api";

const AUDIO_MAX_DURATION = 30;

type RecordingState = "idle" | "starting" | "recording" | "stopping" | "transcribing";

type UseSpeechRecorderOptions = {
  asrModel: string;
  provider?: string;
  onTranscript: (text: string) => void;
  runWithConsent: (action: () => void) => void;
  stopPlayers: () => void;
  toast: ReturnType<typeof useToast>;
};

export const useSpeechRecorder = ({
  asrModel,
  provider,
  onTranscript,
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

  const isRecording = recordingState === "starting" || recordingState === "recording";
  const isRecordingActive = recordingState === "recording";
  const isBusy = recordingState === "stopping" || recordingState === "transcribing";

  const sttMutation = useMutation({
    mutationFn: speechToText,
    onSuccess: (data) => {
      const textResult = data.text.trim();
      if (textResult) onTranscript(textResult);
    },
    onError: (error) => {
      toast.showError(
        "Transcription failed",
        error instanceof Error ? error.message : "Please try again."
      );
    },
    onSettled: () => {
      setRecordingState("idle");
    },
  });

  const startRecording = useCallback(async () => {
    try {
      if (recordingState !== "idle" || sttMutation.isPending) return;
      setRecordingState("starting");
      setLastRecordingUri(null);
      stopPlayers();
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setRecordingState("idle");
        toast.showError(
          "Microphone required",
          "Microphone permission is required to record audio."
        );
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecordingSeconds(0);
      setRecordingState("recording");
    } catch (error) {
      setRecordingState("idle");
      toast.showError(
        "Recording failed",
        error instanceof Error ? error.message : "Unable to start recording."
      );
    }
  }, [recorder, recordingState, stopPlayers, sttMutation.isPending, toast]);

  const transcribeRecordingUri = useCallback(
    async (uri: string) => {
      if (sttMutation.isPending) return;
      const audio = await new File(uri).base64();
      sttMutation.mutate({ audio, model: asrModel, provider });
    },
    [asrModel, provider, sttMutation]
  );

  const stopRecording = useCallback(
    async (showLimitToast = false) => {
      if (isStoppingRecordingRef.current || recordingState !== "recording") return;
      isStoppingRecordingRef.current = true;
      setRecordingState("stopping");
      try {
        await recorder.stop();
        const uri = recorder.uri;
        setRecordingSeconds(0);
        if (showLimitToast) {
          toast.showInfo(`${AUDIO_MAX_DURATION} seconds timer limit reached`);
        }
        if (!uri) {
          setRecordingState("idle");
          return;
        }
        setLastRecordingUri(uri);
        setRecordingState("idle");
        runWithConsent(() => {
          setRecordingState("transcribing");
          void transcribeRecordingUri(uri);
        });
      } catch (error) {
        setRecordingState("idle");
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
  };
};
