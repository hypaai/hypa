import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { json, NextFunction, Request, Response } from 'express';
import * as bodyParser from 'body-parser';
import express from 'express';
import path from 'path';
import { DelayedWsAdapter } from './delayed-ws.adapter';
import { PodService } from './api/developer/ws/pod.service';
import { WsAuthService } from './api/developer/ws/ws-auth.service';

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

export const PORT = process.env.PORT ?? 5678;
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not defined');
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error', 'debug'],
  });

  const podService = app.get(PodService);
  const wsAuthService = app.get(WsAuthService);

  app.useWebSocketAdapter(
    new DelayedWsAdapter(
      app,
      () => podService.prepareSession(),
      (_labsToken, apiKey) => wsAuthService.validate(apiKey),
    ),
  );

  app.use('/v2/translate/stt', json({ limit: '15mb' }));
  app.use(json({ limit: '10mb' }));

  app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`[${req.method}]`, req.url);
    next();
  });


  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
    }),
  );
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
  app.use('/audio', express.static(path.join(__dirname, '/public/audio')));
  app.enableShutdownHooks();
  await app.listen(PORT, () => {
    console.log(`Server is running on port ${process.env.PORT ?? 5678}`);
  });
}
bootstrap();
