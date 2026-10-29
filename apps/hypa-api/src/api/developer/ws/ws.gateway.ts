import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { IncomingMessage } from 'http';
import { Subscription } from 'rxjs';
import { Server } from 'ws';

import { ClientSession, PodData, PodService } from './pod.service';

@WebSocketGateway()
export class WSGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private sessions = new Map<
    any,
    {
      subscription: Subscription;
      session: ClientSession;
      pod?: PodData;
      userId: string;
      apiKeyId?: string;
      viaLabs: boolean;
      startedAt: number;
    }
  >();

  constructor(
    private podService: PodService,
  ) {}

  handleConnection(client: any, req: IncomingMessage) {
    const { pod, session } = (req as any)?.preparedSession as {
      pod?: PodData;
      session: ClientSession;
    };

    session.onFailure(() => {
      if (this.sessions.has(client)) {
        client.close();
      }
    });

    client.on('message', (raw: Buffer | string, isBinary: boolean) => {
      if (isBinary) {
        session.send(raw);
        return;
      }
      const text = raw.toString();
      try {
        const parsed = JSON.parse(text);
        if (parsed?.type === 'shutdown') return;
      } catch {}
      session.send(text);
    });

    const subscription = session.messages$.subscribe((data) => {
      if (Buffer.isBuffer(data)) {
        client.send(data);
        return;
      }
      client.send(typeof data === 'string' ? data : JSON.stringify(data));
    });

    this.sessions.set(client, {
      subscription,
      session,
      pod,
      userId: (req as any).userId,
      apiKeyId: (req as any).apiKeyId,
      viaLabs: Boolean((req as any).viaLabs),
      startedAt: Date.now(),
    });

    console.log(
      `Client connected: ${client._socket?.remoteAddress ?? 'unknown'} → ${pod ? `pod ${pod.jobId} (${pod.clientCount}/${2})` : 'runpod streaming'}`,
    );
  }

  handleDisconnect(client: any) {
    const entry = this.sessions.get(client);
    if (entry) {
      entry.subscription.unsubscribe();
      entry.session.close();
      if (entry.pod) {
        this.podService.releaseClient(entry.pod);
      }
      this.sessions.delete(client);
    }
    console.log(
      `Client disconnected: ${client._socket?.remoteAddress ?? 'unknown'}`,
    );
  }
}
