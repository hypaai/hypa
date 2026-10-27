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
      return undefined;
    }

    request['user'] = user;
    request['userId'] = user.id;

    return user;
  }

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const pathOnly = request.url?.split('?')[0] ?? request.url;

    if (request.method === 'OPTIONS') {
      return true;
    }

    const [bearer, token] = request.headers.authorization?.split(' ') ?? [];

    if (shouldSkipAuth(request)) {
      return true;
    }

    const isAnonymousAllowed =
      request.method === 'POST' &&
      (pathOnly === '/dictionary' ||
        pathOnly === '/dictionary/translate' ||
        pathOnly === '/dictionary/tts' ||
        pathOnly.startsWith('/dictionary/tts/') ||
        pathOnly.startsWith('/v2/translate/'));

    if (isAnonymousAllowed) {
      if (bearer && token) {
        try {
          await this.attachUserFromToken(request, token);
        } catch (error: any) {
          console.warn(
            '[AuthGuard] Invalid token for anonymous route:',
            error.message,
          );
        }
      } else {
      }

      return true;
    }

    if (!bearer || !token) {
      throw new UnauthorizedException({
        message: 'Unauthorized',
      });
    }

    const user = await this.attachUserFromToken(request, token);

    if (!user) {
      throw new UnauthorizedException({
        message: 'Unauthorized',
      });
    }

    return true;
  }
}
