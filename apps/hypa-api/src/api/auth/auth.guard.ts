import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { DbService } from 'src/libs/db/db.service';
import { AUTH_SKIP_RULES } from './auth-skip.constant';

function shouldSkipAuth(request: Request): boolean {
  const url = request.url;
  if (!url) return false;
  const pathOnly = url.split('?')[0] ?? url;

  return AUTH_SKIP_RULES.some(
    (rule) =>
      rule.method === request.method &&
      ((rule.exactPaths?.includes(pathOnly) ?? false) ||
        rule.pathPrefixes.some(
          (prefix) => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`),
        )),
  );
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly db: DbService,
    private readonly jwtService: JwtService,
  ) {}

  private getUserIdFromTokenPayload(decoded: unknown) {
    if (!decoded || typeof decoded !== 'object') return undefined;

    const payload = decoded as {
      sub?: string;
      id?: string;
      userId?: string;
      user?: { id?: string };
    };

    return payload.sub || payload.id || payload.userId || payload.user?.id;
  }

  private async attachUserFromToken(request: Request, token: string) {
    let decoded: unknown;
    try {
      decoded = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      // A genuinely invalid/expired token — the only case that should 401.
      throw new UnauthorizedException({ message: 'Unauthorized' });
    }

    const userId = this.getUserIdFromTokenPayload(decoded);

    console.log('[AuthGuard] bearer token decoded', {
      path: request.url,
      userId,
      hasUserId: Boolean(userId),
    });

    if (!userId) {
      return undefined;
    }

    const user = await this.db.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        customVoices: {
          select: {
            name: true,
            model: true,
            provider: true,
            created_at: true,
          },
          take: 20,
          orderBy: {
            created_at: 'desc',
          },
        },
        wallet: {
          select: {
            balance: true,
          },
        },
      },
    });

    if (!user) {
      // console.log('[AuthGuard] token user not found in database', {
      //   path: request.url,
      //   userId,
      // });
      return undefined;
    }

    request['user'] = user;
    request['userId'] = user.id;

    // console.log('[AuthGuard] attached user to request', {
    //   path: request.url,
    //   userId: user.id,
    //   email: user.email,
    // });

    return user;
  }

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const pathOnly = request.url?.split('?')[0] ?? request.url;

    // Allow OPTIONS requests (CORS preflight) to pass through
    if (request.method === 'OPTIONS') {
      return true;
    }

    const [bearer, token] = request.headers.authorization?.split(' ') ?? [];

    if (shouldSkipAuth(request)) {
      return true;
    }

    // Special case: Allow POST /conversations and POST /dictionary for both authenticated and anonymous users
    // This is intentional to support temporary chats/searches for unauthenticated users
    // SECURITY NOTE: Rate limiting should be applied at the controller level
    const isAnonymousAllowed =
      request.method === 'POST' &&
      (pathOnly === '/conversations' ||
        pathOnly.startsWith('/conversations/') ||
        pathOnly === '/dictionary' ||
        pathOnly === '/v2/dictionary' ||
        pathOnly === '/dictionary/translate' ||
        pathOnly === '/v2/dictionary/translate' ||
        pathOnly === '/dictionary/tts' ||
        pathOnly === '/v2/dictionary/tts' ||
        pathOnly.startsWith('/dictionary/tts/') ||
        pathOnly.startsWith('/v2/dictionary/tts/') ||
        pathOnly.startsWith('/v2/translate/') ||
        pathOnly === '/v2/agent') ||
      // Anonymous agent turns can be picked up by their unguessable requestId.
      // Media links carry their own signature and expiry.
      (request.method === 'GET' && pathOnly.startsWith('/v2/agent/')) ||
      (request.method === 'GET' && pathOnly === '/v2/translate/lens');

    if (isAnonymousAllowed) {
      // If token is provided, attempt to authenticate and attach user
      if (bearer && token) {
        try {
          await this.attachUserFromToken(request, token);
        } catch (error: any) {
          // Invalid token - log the attempt but allow anonymous access
          console.warn(
            '[AuthGuard] Invalid token for /conversations:',
            error.message,
          );
        }
      } else {
        // console.log('[AuthGuard] anonymous product request without bearer', {
        //   method: request.method,
        //   path: pathOnly,
        // });
      }

      // Allow request to proceed (with or without user)
      // The controller will handle anonymous vs authenticated logic
      return true;
    }

    if (!bearer || !token) {
      throw new UnauthorizedException({
        message: 'Unauthorized',
      });
    }

    // No blanket catch here: attachUserFromToken already throws its own
    // UnauthorizedException for a genuinely bad/expired token or missing
    // user. Anything else (e.g. a transient DB error on the user lookup)
    // propagates as its real error instead of being silently rewritten
    // into a false-positive 401 — a raw 401 is what the frontend's axios
    // interceptor treats as "session invalid" and logs the user out on.
    const user = await this.attachUserFromToken(request, token);

    if (!user) {
      throw new UnauthorizedException({
        message: 'Unauthorized',
      });
    }

    return true;
  }
}
