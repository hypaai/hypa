import { useCallback, useEffect, useRef, useState } from 'react';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { resolveAgentAudio, type AgentConnection } from '@hypa/intelligence-core/agent-stream';

function removeTemporaryAudio(uri?: string) {
  if (uri?.startsWith('file:') && uri.includes('/hypa-chat-')) {
    try { const file = new File(uri); if (file.exists) file.delete(); } catch {  }
  }
}

export function useChatAudio(connection: AgentConnection) {
  const epoch = useRef(0);
  const mounted = useRef(true);
  const active = useRef<{ player: ReturnType<typeof createAudioPlayer>; uri: string; unsubscribe: () => void } | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const stop = useCallback(() => {
    epoch.current++;
    const current = active.current;
    active.current = null;
    if (current) {
      current.unsubscribe();
      current.player.pause();
      current.player.remove();
      removeTemporaryAudio(current.uri);
    }
    if (mounted.current) { setPlayingId(null); setLoadingId(null); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stop(); };
  }, [stop]);
  useEffect(() => { stop(); }, [connection.token, stop]);

  const resolveUrl = useCallback((url: string) => resolveAgentAudio(url, connection, (bytes) => {
    const file = new File(Paths.cache, `hypa-chat-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
    file.write(new Uint8Array(bytes));
    return file.uri;
  }), [connection]);

  const play = useCallback(async (id: string, source: () => Promise<string>, onEnd?: () => void) => {
    stop();
    const generation = epoch.current;
    setLoadingId(id);
    let uri: string | undefined;
    try {
      uri = await source();
      if (!mounted.current || generation !== epoch.current) { removeTemporaryAudio(uri); return; }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      if (!mounted.current || generation !== epoch.current) { removeTemporaryAudio(uri); return; }
      const player = createAudioPlayer({ uri });
      const subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (generation !== epoch.current) return;
        if (status.didJustFinish) { stop(); onEnd?.(); }
      });
      active.current = { player, uri, unsubscribe: () => subscription.remove() };
      await player.seekTo(0);
      if (!mounted.current || generation !== epoch.current) return;
      setLoadingId(null);
      setPlayingId(id);
      player.play();
    } catch (error) {
      removeTemporaryAudio(uri);
      if (mounted.current && generation === epoch.current) { stop(); throw error; }
    }
  }, [stop]);
  return { play, stop, resolveUrl, playingId, loadingId };
}
