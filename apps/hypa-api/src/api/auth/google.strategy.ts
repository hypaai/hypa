import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { decodeGoogleState } from './google-state.util';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        `${process.env.BASE_URL}/auth/google/callback`,
      scope: ['email', 'profile'],
      passReqToCallback: true,
    });
  }

  validate(
    req: any,
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): void {
    const { app, refCode } = decodeGoogleState(req.query['state']);
    const { emails, name, photos } = profile;

    const user = {
      email: emails[0].value,
      firstName: name.givenName,
      lastName: name.familyName,
      picture: photos[0]?.value,
      accessToken,
    };

    const res = {
      user,
      app,
      refCode,
    };

    done(null, res);
  }
}
