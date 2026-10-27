import http from 'http';
import { INestApplicationContext } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { Server as WsServer } from 'ws';

export interface WsAuthResult {
  userId: string;
  apiKeyId: string;
}

type UpgradeHandler = (
  req: http.IncomingMessage,
  socket: any,
  head: Buffer,
) => void;

export class DelayedWsAdapter extends WsAdapter {
  private readonly extraHttpServers = new Map<WsServer, http.Server>();
  private readonly sharedUpgradeHandlers = new Map<WsServer, UpgradeHandler>();

  constructor(
    app: INestApplicationContext,
    private readonly prepareSession: (
      req: http.IncomingMessage,
    ) => Promise<unknown>,
    private readonly validateAuth: (
      labsToken: string | undefined,
      apiKey: string | undefined,
    ) => Promise<WsAuthResult | null>,
  ) {
    super(app);
  }

  override create(port: number): WsServer {
    const wss = new WsServer({ noServer: true });

    const prepareUpgrade = async (
      req: http.IncomingMessage,
      socket: any,
      head: Buffer,
    ): Promise<void> => {
      try {
        const prot = req.headers['sec-websocket-protocol'];
        if (!prot) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          return socket.destroy();
        }

        const labsPart = prot
          .split(',')
          .find((p: string) => p.trim().startsWith('labs-'));
        const keyPart = prot
          .split(',')
          .find((p: string) => p.trim().startsWith('key-'));
        if (!labsPart && !keyPart) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          return socket.destroy();
        }

        const labsToken = labsPart?.trim().slice('labs-'.length);
        const apiKey = keyPart?.trim().slice('key-'.length);

        const auth = await this.validateAuth(labsToken, apiKey);
        if (!auth) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          return socket.destroy();
        }

        (req as any).userId = auth.userId;
        (req as any).apiKeyId = auth.apiKeyId;
        (req as any).viaLabs = Boolean(labsToken);
        (req as any).preparedSession = await this.prepareSession(req);

        if (socket.destroyed) {
          (
            (req as any).preparedSession as
              | { session?: { close: () => void } }
              | undefined
          )?.session?.close();
          return;
        }
      } catch (error) {
        console.error(
          '[WS] Upgrade failed:',
          error instanceof Error ? error.message : String(error),
        );
        const status =
          typeof (error as { getStatus?: () => number }).getStatus ===
          'function'
            ? (error as { getStatus: () => number }).getStatus()
            : 503;
        const reason =
          status === 400 ? '400 Bad Request' : '503 Service Unavailable';
        socket.write(`HTTP/1.1 ${reason}\r\n\r\n`);
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    };

    const upgradeHandler: UpgradeHandler = (req, socket, head) => {
      void prepareUpgrade(req, socket, head).catch((error: unknown) => {
        console.error('[WS] Upgrade failed:', error);
        socket.destroy();
      });
    };

    if (!port) {
      const mainHttp = (this as any).httpServer as http.Server | undefined;
      if (mainHttp) {
        mainHttp.on('upgrade', upgradeHandler);
        this.sharedUpgradeHandlers.set(wss, upgradeHandler);
      }
      return wss;
    }

    const httpServer = http.createServer();
    this.extraHttpServers.set(wss, httpServer);
    httpServer.on('upgrade', upgradeHandler);
    httpServer.listen(port);
    return wss;
  }

  override close(server: WsServer): Promise<void> {
    const extraHttp = this.extraHttpServers.get(server);
    if (extraHttp) {
      extraHttp.close();
      this.extraHttpServers.delete(server);
    }

    const handler = this.sharedUpgradeHandlers.get(server);
    if (handler) {
      const mainHttp = (this as any).httpServer as http.Server | undefined;
      mainHttp?.removeListener('upgrade', handler);
      this.sharedUpgradeHandlers.delete(server);
    }

    server.close();
    return Promise.resolve();
  }
}
