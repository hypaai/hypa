import { AgentStreamError, type AgentConnection, type AgentReply, stepsFromTrace } from '@hypa/intelligence-core/agent-stream';

export interface ChatImage { uri: string; data?: string; mime: string }
export interface ChatMessage extends AgentReply {
  id: string;
  role: 'user' | 'assistant';
  requestId?: string;
  images?: ChatImage[];
}
export interface Conversation { id: string; title: string; kind?: string | null; created_at: string }
interface Page<T> { data: T[]; meta: { page: number; totalPages: number } }

async function request<T>(connection: AgentConnection, path: string, init?: RequestInit): Promise<T> {
  if (!connection.token) throw new AgentStreamError('Sign in to load your chats.', 401);
  const response = await (connection.fetch ?? fetch)(`${connection.baseUrl}/conversations${path}`, {
    ...init,
    headers: { ...connection.headers, Authorization: `Bearer ${connection.token}`, 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new AgentStreamError(response.status === 401 ? 'Your session expired. Sign in again.' : 'Unable to load or update this chat.', response.status);
  return response.json();
}

export const listConversations = (connection: AgentConnection, page: number) =>
  request<Page<Conversation>>(connection, `?page=${page}&limit=30`);

export async function readConversation(connection: AgentConnection, id: string): Promise<ChatMessage[]> {
  const messages: ChatMessage[] = [];
  let page = 1;
  for (;;) {
    const result = await request<Page<{
      id: string; role: 'user' | 'assistant'; content: string; request_id?: string;
      audioUrl?: string; tool_trace?: unknown; attachments?: { url?: string; mime?: string }[];
    }>>(connection, `/${encodeURIComponent(id)}/messages?page=${page}&limit=100`);
    messages.push(...result.data.map((row) => ({
      id: row.id, role: row.role, content: row.content, status: 'success' as const,
      requestId: row.request_id, audioUrl: row.audioUrl,
      ...stepsFromTrace(row.tool_trace),
      images: row.attachments?.flatMap((image) => image.url ? [{ uri: image.url, mime: image.mime ?? 'image/jpeg' }] : []),
    })));
    if (page >= result.meta.totalPages) return messages;
    page++;
  }
}

export const deleteConversation = (connection: AgentConnection, id: string) =>
  request(connection, `/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const archiveConversation = (connection: AgentConnection, id: string) =>
  request(connection, `/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ archive: true }) });
