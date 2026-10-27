import {
  BadRequestException,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { encodeGoogleState, isGoogleStateValid } from './google-state.util';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    if (
      typeof req.query.code === 'string' &&
      !isGoogleStateValid(req.query.state)
    ) {
      throw new BadRequestException('Invalid OAuth state');
    }

    return super.canActivate(context);
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const app = typeof req.query.app === 'string' ? req.query.app : undefined;
    const refCode =
      typeof req.query.refCode === 'string' ? req.query.refCode : undefined;

    const forwardedProto = req.headers['x-forwarded-proto'];
    const protocol =
      (typeof forwardedProto === 'string'
        ? forwardedProto.split(',')[0]
        : undefined) || req.protocol;
    const host = req.get('host');
    const baseUrl =
      process.env.GOOGLE_CALLBACK_BASE_URL ||
      process.env.BASE_URL ||
      `${protocol}://${host}`;
    return {
      state: encodeGoogleState({ app, refCode }),
      callbackURL: new URL('/auth/google/callback', baseUrl).toString(),
    };
  }
}
