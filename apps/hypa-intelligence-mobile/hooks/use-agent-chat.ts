import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetch as expoFetch } from 'expo/fetch';
import { randomUUID } from 'expo-crypto';
import {
  AgentStreamError, applyAgentEvent, blobToBase64, waitForAgent,
  type AgentEvent, type AgentRequestBody,
} from '@hypa/intelligence-core/agent-stream';
import { API_URL } from '@/api';
import { readConversation, type ChatImage, type ChatMessage } from '@/api/conversations';
import { useSettings } from '@/context/settings-context';
import { useUser } from '@/lib/user-provider';
import { runChatTurn } from '@/lib/chat-turn';

interface PendingTurn { requestId: string; chatId?: string }
const pendingKey = (userId: string) => `hypa-agent-pending:${userId}`;

export function useAgentChat(initialChatId?: string, resetKey?: string) {
  const { settings } = useSettings();
  const { user } = useUser();
  const token = settings?.token?.trim() || undefined;
  const userId: string | undefined = token ? user?.id : undefined;
  const connection = useMemo(() => ({ baseUrl: API_URL, token, fetch: expoFetch as typeof fetch }), [token]);
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const chatId = useRef(initialChatId);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const submitting = useRef(false);
  const [owner, setOwner] = useState(token);

  const history = useQuery({
    queryKey: ['agent-messages', userId, initialChatId],
    queryFn: () => readConversation(connection, initialChatId!),
    enabled: Boolean(userId && initialChatId),
  });

  const reset = useCallback(() => {
    generation.current++;
    controller.current?.abort();
    submitting.current = false;
    chatId.current = initialChatId;
    setMessages([]); setPending(null); setBusy(false); setError(''); setOwner(token);
  }, [initialChatId, token]);
  useEffect(() => { reset(); return () => { generation.current++; controller.current?.abort(); }; }, [reset, resetKey]);
  useEffect(() => {
    if (history.data && !submitting.current) setMessages(history.data);
  }, [history.data]);

  const invalidateHistory = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['agent-chats', userId] });
    void queryClient.invalidateQueries({ queryKey: ['agent-messages', userId] });
  }, [queryClient, userId]);

  const finishPending = useCallback(async () => {
    if (userId) await AsyncStorage.removeItem(pendingKey(userId));
  }, [userId]);

  const reconnect = useCallback(async (turn = pending) => {
    if (!turn || submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    const epoch = generation.current;
    const abort = new AbortController(); controller.current = abort;
    const id = `reply-${turn.requestId}`;
    setPending(turn);
    setMessages((rows) => rows.some((row) => row.id === id) ? rows : [...rows, { id, role: 'assistant', content: '', status: 'pending', requestId: turn.requestId }]);
    try {
      const status = await waitForAgent({ connection, requestId: turn.requestId, signal: abort.signal });
      if (epoch !== generation.current) return;
      if (status.status === 'running') throw new Error('Still waiting. Reconnect again to check the same request.');
      if (status.status === 'failed') throw new AgentStreamError('The request failed. You can send a new message.', 422);
      chatId.current = status.chatId ?? turn.chatId ?? chatId.current;
      setMessages((rows) => rows.map((row) => row.id === id ? { ...row, content: status.message, status: 'success', activity: undefined, audioUrl: status.audioUrl } : row));
      await finishPending();
      if (epoch !== generation.current) return;
      setPending(null);
      if (userId && chatId.current) {
        const saved = await readConversation(connection, chatId.current);
        if (epoch === generation.current) setMessages(saved);
      }
      invalidateHistory();
    } catch (err) {
      if (epoch !== generation.current || abort.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Unable to reconnect.');
      if (err instanceof AgentStreamError && err.status && err.status >= 400) {
        await finishPending(); setPending(null);
      }
    } finally {
      if (epoch === generation.current) { submitting.current = false; setBusy(false); }
    }
  }, [connection, pending, userId, finishPending, invalidateHistory]);

  const reconnectRef = useRef(reconnect); reconnectRef.current = reconnect;
  useEffect(() => {
    if (!userId || initialChatId) return;
    const epoch = generation.current;
    void AsyncStorage.getItem(pendingKey(userId)).then((value) => {
      if (!value || epoch !== generation.current || submitting.current) return;
      const saved = JSON.parse(value) as PendingTurn;
      if (typeof saved.requestId === 'string') void reconnectRef.current(saved);
    }).catch(() => {  });
  }, [userId, initialChatId]);

  const send = useCallback(async (text: string, images: ChatImage[] = [], preferAudio = false) => {
    if (submitting.current || pending || (!text.trim() && !images.length)) return null;
    if (images.length > 4) throw new Error('Attach up to four photos.');
    submitting.current = true; setBusy(true); setError('');
    const epoch = generation.current;
    const abort = new AbortController(); controller.current = abort;
    const requestId = randomUUID();
    const turn = { requestId, chatId: token ? chatId.current : undefined };
    const id = `reply-${requestId}`;
    const body: AgentRequestBody = {
      requestId, input: text.trim(), surface: 'app',
      provider: settings?.assistantProvider ?? 'meta', model: settings?.assistantModel ?? 'muse-spark-1.3',
      chatId: turn.chatId, preferAudio,
      attachments: images.length ? images.map((image) => ({ data: image.data!, mime: image.mime })) : undefined,
    };
    let reply: ChatMessage = { id, role: 'assistant', content: '', status: 'pending', requestId };
    setMessages((rows) => [...rows, { id: `user-${requestId}`, role: 'user', content: text.trim(), status: 'success', images }, reply]);
    setPending(turn);
    try {
      if (userId) await AsyncStorage.setItem(pendingKey(userId), JSON.stringify(turn));
      if (epoch !== generation.current) return null;
      const onEvent = (event: AgentEvent) => {
        if (epoch !== generation.current) return;
        const knownChatId = (event as { chatId?: string }).chatId;
        if (knownChatId && token) chatId.current = knownChatId;
        reply = { ...reply, ...applyAgentEvent(reply, event) };
        setMessages((rows) => rows.map((row) => row.id === id ? reply : row));
      };
      await runChatTurn({ connection, body, signal: abort.signal, onEvent, onReconnect: () => {
        if (epoch === generation.current) setMessages((rows) => rows.map((row) => row.id === id ? { ...row, activity: 'Reconnecting' } : row));
      } });
      if (epoch !== generation.current) return null;
      await finishPending();
      if (epoch !== generation.current) return null;
      setPending(null); invalidateHistory();
      return reply;
    } catch (err) {
      if (epoch !== generation.current || abort.signal.aborted) return null;
      const message = err instanceof Error ? err.message : 'Unable to send your message.';
      setError(message);
      setMessages((rows) => rows.map((row) => row.id === id ? { ...row, activity: undefined, status: 'error', content: row.content || message } : row));
      if (err instanceof AgentStreamError && err.status && err.status >= 400) {
        await finishPending(); setPending(null);
      }
      return null;
    } finally {
      if (epoch === generation.current) { submitting.current = false; setBusy(false); }
    }
  }, [connection, token, pending, settings?.assistantProvider, settings?.assistantModel, userId, finishPending, invalidateHistory]);

  const regenerate = useCallback(async (messageId: string) => {
    const index = messages.findIndex((row) => row.id === messageId);
    const original = messages.slice(0, index).reverse().find((row) => row.role === 'user');
    if (!original || submitting.current || pending) return null;
    const epoch = generation.current;
    const images = await Promise.all((original.images ?? []).map(async (image) => {
      if (image.data) return image;
      const response = await expoFetch(image.uri, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) throw new Error('Unable to reload this photo. Attach it again.');
      return { ...image, data: await blobToBase64(await response.blob()) };
    }));
    if (epoch !== generation.current) return null;
    return send(original.content, images);
  }, [messages, pending, send, token]);

  return {
    messages: owner === token ? messages : [], busy, pending, error: error || (history.error instanceof Error ? history.error.message : ''),
    loading: history.isLoading, connection, userId, send, regenerate, reconnect, reset,
    chatId: chatId.current,
  };
}
