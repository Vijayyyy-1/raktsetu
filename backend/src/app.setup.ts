import { INestApplication, ValidationPipe } from '@nestjs/common';

/** HTTP behaviour shared by the server (main.ts) and the end-to-end tests, so tests exercise the real config. */
export function configureApp(app: INestApplication) {
  app.enableCors({
    origin: process.env.WEB_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  return app;
}
