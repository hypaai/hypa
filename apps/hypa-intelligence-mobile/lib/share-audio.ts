type AudioFormat = {
  uti: string;
};

const AUDIO_FORMATS: Record<string, AudioFormat> = {
  'audio/mpeg': { uti: 'public.mp3' },
  'audio/mp3': { uti: 'public.mp3' },
  'audio/wav': { uti: 'com.microsoft.waveform-audio' },
  'audio/x-wav': { uti: 'com.microsoft.waveform-audio' },
  'audio/wave': { uti: 'com.microsoft.waveform-audio' },
  'audio/mp4': { uti: 'com.apple.m4a-audio' },
  'audio/m4a': { uti: 'com.apple.m4a-audio' },
  'audio/x-m4a': { uti: 'com.apple.m4a-audio' },
  'audio/aac': { uti: 'public.aac-audio' },
};

const DEFAULT_FORMAT: AudioFormat = { uti: 'public.mp3' };
const DIALOG_TITLE = 'Share audio';

const getSharingModule = async () => import('expo-sharing').catch(() => null);

const formatForMime = (mimeType: string): AudioFormat =>
  AUDIO_FORMATS[mimeType.toLowerCase()] ?? DEFAULT_FORMAT;

export const shareAudioFromUri = async (uri: string, mimeType: string): Promise<boolean> => {
  const sharing = await getSharingModule();
  if (!sharing?.isAvailableAsync || !sharing?.shareAsync) return false;
  if (!(await sharing.isAvailableAsync())) return false;
  const { uti } = formatForMime(mimeType);
  await sharing.shareAsync(uri, { mimeType, UTI: uti, dialogTitle: DIALOG_TITLE });
  return true;
};
