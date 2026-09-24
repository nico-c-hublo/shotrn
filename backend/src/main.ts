import 'reflect-metadata';
import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { InvalidUrlError } from './common/errors';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { loadEnv, type Env } from './config/env';
import { loadEnvFile } from './config/load-env-file';
import { configureUrlValidation } from './links/url-validation';
import { FRONTEND_ASSETS } from './links/spa';

/** Flattens class-validator output into one safe message, preserving the URL error code. */
export function validationExceptionFactory(errors: ValidationError[]): Error {
  const messages: string[] = [];
  let urlMessage: string | null = null;

  for (const error of errors) {
    for (const [constraint, message] of Object.entries(error.constraints ?? {})) {
      messages.push(message);
      if (constraint === 'isHttpUrl' && urlMessage === null) urlMessage = message;
    }
  }

  if (urlMessage !== null) return new InvalidUrlError(urlMessage);
  return new BadRequestException(messages.length > 0 ? messages.join('; ') : 'Invalid request');
}

export async function createApp(env: Env): Promise<NestExpressApplication> {
  configureUrlValidation({ ownHostname: env.baseHostname });

  const app = await NestFactory.create<NestExpressApplication>(AppModule.register({ env }), {
    bodyParser: true,
  });

  app.use(
    helmet({
      // The SPA is same-origin and inlines nothing beyond Vite's hashed bundles.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // Behind an HTTPS-terminating proxy, so the client IP used for rate limiting is real.
  app.set('trust proxy', 1);

  // Hashed bundles only, served from dist/assets at /assets; every other path falls
  // through to the controllers so `/:code` stays a redirect candidate.
  app.useStaticAssets(FRONTEND_ASSETS, { index: false, prefix: '/assets', redirect: false });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // Unknown properties and bad shapes must never reach business logic.
      stopAtFirstError: true,
      // A rejected URL is INVALID_URL, not a generic shape error: the contract
      // distinguishes them and the message tells the visitor what to fix.
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  return app;
}

async function bootstrap(): Promise<void> {
  loadEnvFile();
  const env = loadEnv();
  const app = await createApp(env);
  await app.listen(env.port);
  new Logger('bootstrap').log(`listening on ${env.baseUrl}`);
}

if (require.main === module) {
  bootstrap().catch((error: unknown) => {
    // Never log secret values; the env validator already reports names only.
    console.error(error instanceof Error ? error.message : 'failed to start');
    process.exit(1);
  });
}
