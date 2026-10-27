import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { user as DbUser } from 'src/generated/prisma/client';
import { DbService } from 'src/libs/db/db.service';
import { LoginDto, RegisterDto, GoogleAuthDto, AppleAuthDto } from './auth.dto';
import argon2 from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { INITIAL_BALANCE, REFERRAL_POINTS } from 'src/app.constant';
import { createPublicKey } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { generateReferralCode } from 'src/utils/referral-code.utils';

type AppleJwk = {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
};

type AppleKeysResponse = {
  keys: AppleJwk[];
};

@Injectable()
export class AuthService {
  private appleKeysCache:
    | {
        keys: AppleJwk[];
        expiresAt: number;
      }
    | undefined;

  constructor(
    private readonly dbService: DbService,
    private readonly jwtService: JwtService,
  ) {}

  private serializeUser(user: DbUser) {
    return {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      auth_provider: user.auth_provider,
    };
  }

  private async createAuthResponse(user: DbUser) {
    const token = await this.jwtService.signAsync(
      {
        sub: user.id,
      },
      {
        secret: process.env.JWT_SECRET,
      },
    );

    return {
      access_token: token,
      user: this.serializeUser(user),
    };
  }

  private isNonProductionAppleFallbackEnabled() {
    return process.env.NODE_ENV !== 'production';
  }

  private getAppleAudiences(): [string, ...string[]] {
    const raw = process.env.APPLE_CLIENT_IDS;
    if (!raw) {
      throw new BadRequestException({
        message: 'APPLE_CLIENT_IDS is not configured',
      });
    }

    const audiences = raw
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    if (
      this.isNonProductionAppleFallbackEnabled() &&
      !audiences.includes('host.exp.Exponent')
    ) {
      audiences.push('host.exp.Exponent');
    }

    if (audiences.length === 0) {
      throw new BadRequestException({
        message: 'APPLE_CLIENT_IDS is not configured',
      });
    }

    return audiences as [string, ...string[]];
  }

  private async getAppleSigningKeys(forceRefresh = false) {
    const now = Date.now();

    if (
      !forceRefresh &&
      this.appleKeysCache &&
      this.appleKeysCache.expiresAt > now
    ) {
      return this.appleKeysCache.keys;
    }

    const response = await fetch('https://appleid.apple.com/auth/keys');
    if (!response.ok) {
      throw new UnauthorizedException({
        message: 'Unable to fetch Apple signing keys',
      });
    }

    const data = (await response.json()) as AppleKeysResponse;
    const keys = Array.isArray(data.keys) ? data.keys : [];
    if (keys.length === 0) {
      throw new UnauthorizedException({
        message: 'No Apple signing keys available',
      });
    }

    this.appleKeysCache = {
      keys,
      expiresAt: now + 60 * 60 * 1000,
    };

    return keys;
  }

  private async getAppleSigningKeyByKid(kid: string) {
    const keys = await this.getAppleSigningKeys();
    let key = keys.find((item) => item.kid === kid);

    if (!key) {
      const refreshed = await this.getAppleSigningKeys(true);
      key = refreshed.find((item) => item.kid === kid);
    }

    if (!key) {
      throw new UnauthorizedException({
        message: 'Invalid Apple token key id',
      });
    }

    return key;
  }

  async login(body: LoginDto) {
    const email = body.email.trim().toLowerCase();
    const user = await this.dbService.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException({
        message: 'No Account Exists with this credentials',
      });
    }

    if (!user.password) {
      throw new BadRequestException({
        message: `Your account was created with ${user.auth_provider}`,
      });
    }

    const isPasswordValid = user.password
      ? await argon2.verify(user.password, body.password ?? '')
      : false;

    if (!isPasswordValid) {
      throw new UnauthorizedException({
        message: 'No Account Exists with this credentials',
      });
    }

    return this.createAuthResponse(user);
  }

  private async generateUniqueReferralCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateReferralCode();
      const existing = await this.dbService.user.findUnique({
        where: { referral_code: code },
        select: { id: true },
      });
      if (!existing) {
        return code;
      }
    }
    throw new Error('Failed to generate a unique referral code');
  }

  private async applyReferral(
    referredUserId: string,
    refCode?: string,
    sourceApp?: string,
  ) {
    const code = refCode?.trim();
    if (!code) {
      return;
    }

    try {
      const referrer = await this.dbService.user.findUnique({
        where: { referral_code: code },
        select: { id: true },
      });

      if (!referrer || referrer.id === referredUserId) {
        return;
      }

      await this.dbService.$transaction([
        this.dbService.referral.create({
          data: {
            referrerId: referrer.id,
            referredId: referredUserId,
            status: 'completed',
            points_awarded: REFERRAL_POINTS,
            source_app: sourceApp?.trim() || null,
          },
        }),
        this.dbService.user.update({
          where: { id: referrer.id },
          data: { referral_points: { increment: REFERRAL_POINTS } },
        }),
      ]);
    } catch (error) {
      console.warn('[AuthService] Failed to apply referral', error);
    }
  }

  async register(body: RegisterDto) {
    const email = body.email.trim().toLowerCase();
    const user = await this.dbService.user.findUnique({
      where: {
        email,
      },
    });

    if (user) {
      throw new BadRequestException({
        message: 'User already exists',
      });
    }

    const hashedPassword = await argon2.hash(body.password);
    const referral_code = await this.generateUniqueReferralCode();
    const newUser = await this.dbService.user.create({
      data: {
        email,
        password: hashedPassword,
        first_name: body.first_name,
        last_name: body.last_name,
        referral_code,
        wallet: {
          create: {
            balance: INITIAL_BALANCE,
          },
        },
      },
    });

    await this.applyReferral(newUser.id, body.refCode, body.app);

    return this.createAuthResponse(newUser);
  }

  async googleLogin(googleUser: GoogleAuthDto) {
    const email = googleUser.email.trim().toLowerCase();
    let user = await this.dbService.user.findUnique({
      where: { email },
    });

    if (!user) {
      user = await this.dbService.user.create({
        data: {
          email,
          first_name: googleUser.firstName,
          last_name: googleUser.lastName,
          auth_provider: 'google',
          password: null,
          referral_code: await this.generateUniqueReferralCode(),
          wallet: {
            create: {
              balance: INITIAL_BALANCE,
            },
          },
        },
      });

      await this.applyReferral(user.id, googleUser.refCode, googleUser.app);
    }
    return this.createAuthResponse(user);
  }

  async appleLogin(body: AppleAuthDto) {
    const decoded = jwt.decode(body.identityToken, {
      complete: true,
    });

    const header = decoded?.header;
    const kid = header?.kid;
    const algorithm = header?.alg;

    const decodedPayload = jwt.decode(
      body.identityToken,
    ) as jwt.JwtPayload | null;
    const tokenAud = decodedPayload?.aud;

    if (!kid || algorithm !== 'RS256') {
      throw new UnauthorizedException({
        message: 'Invalid Apple identity token',
      });
    }

    const audiences = this.getAppleAudiences();
    const jwk = await this.getAppleSigningKeyByKid(kid);
    const publicKey = createPublicKey({
      key: jwk,
      format: 'jwk',
    });

    let payload: jwt.JwtPayload;

    try {
      payload = jwt.verify(body.identityToken, publicKey, {
        algorithms: ['RS256'],
        issuer: 'https://appleid.apple.com',
        audience: audiences,
      }) as jwt.JwtPayload;
    } catch (error) {
      console.log('ERROR VERIFYING APPLE TOKEN', error);

      const tokenAudStr = Array.isArray(tokenAud)
        ? tokenAud.join(',')
        : typeof tokenAud === 'string'
          ? tokenAud
          : 'unknown';

      const expectedAudStr = audiences.join(',');

      const message =
        process.env.NODE_ENV === 'development'
          ? `Apple token verification failed: audience mismatch. expected=${expectedAudStr}, tokenAud=${tokenAudStr}`
          : 'Apple token verification failed';

      throw new UnauthorizedException(message);
    }

    const tokenEmail =
      typeof payload.email === 'string' ? payload.email : undefined;
    const email =
      tokenEmail?.trim().toLowerCase() ?? body.email?.trim().toLowerCase();

    if (!email) {
      throw new BadRequestException({
        message: 'Apple token did not include an email',
      });
    }

    let user = await this.dbService.user.findUnique({
      where: { email },
    });

    const firstName = body.first_name?.trim() || undefined;
    const lastName = body.last_name?.trim() || undefined;

    if (!user) {
      user = await this.dbService.user.create({
        data: {
          email,
          first_name: firstName,
          last_name: lastName,
          password: null,
          referral_code: await this.generateUniqueReferralCode(),
          wallet: {
            create: {
              balance: INITIAL_BALANCE,
            },
          },
        },
      });

      await this.applyReferral(user.id, body.refCode, body.app);
    } else if (
      (firstName || lastName) &&
      (!user.first_name || !user.last_name)
    ) {
      user = await this.dbService.user.update({
        where: { id: user.id },
        data: {
          first_name: user.first_name || firstName,
          last_name: user.last_name || lastName,
        },
      });
    }

    return this.createAuthResponse(user);
  }
}
