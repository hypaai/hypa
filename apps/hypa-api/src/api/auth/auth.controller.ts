import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AppleAuthDto, LoginDto, RegisterDto } from './auth.dto';
import { GoogleAuthGuard } from './google-auth.guard';
import { decodeGoogleState, isGoogleStateValid } from './google-state.util';
import { type Response, type Request } from 'express';

type GoogleAuthPayload = {
  user?: {
    email: string;
    firstName: string;
    lastName: string;
    picture?: string;
  };
  app?: string;
  refCode?: string;
};

const APP_CALLBACK_URL = 'hypaintelligence://auth/callback';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private redirectToApp(
    res: Response,
    params: { token?: string; error?: string },
  ) {
    const fragment = new URLSearchParams();
    if (params.token) {
      fragment.set('token', params.token);
    }
    if (params.error) {
      fragment.set('error', params.error);
    }
    res.redirect(`${APP_CALLBACK_URL}#${fragment.toString()}`);
  }

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @Post('apple')
  apple(@Body() body: AppleAuthDto) {
    return this.authService.appleLogin(body);
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleAuth() {}

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleAuthRedirect(
    @Req() req: Request,
    @Res() res: Response,
    @Query('state') state?: string,
  ) {
    if (!isGoogleStateValid(state)) {
      res.status(400).send('Invalid OAuth state');
      return;
    }
    const decodedState = decodeGoogleState(state);

    try {
      const payload = req['user'] as GoogleAuthPayload | undefined;
      const user = payload?.user;
      if (!user?.email || !user.firstName || !user.lastName) {
        throw new Error('Missing Google profile data');
      }

      const result = await this.authService.googleLogin({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        picture: user.picture,
        refCode: decodedState.refCode ?? payload?.refCode,
        app: decodedState.app ?? payload?.app,
      });

      this.redirectToApp(res, { token: result.access_token });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Authentication failed';
      this.redirectToApp(res, { error: message });
    }
  }
}
