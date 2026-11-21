import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = configureApp(await NestFactory.create(AppModule));
  const swagger = new DocumentBuilder()
    .setTitle('Blood Donation Registry API')
    .setDescription('Local prototype for donor registration and request matching')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));
  await app.listen(process.env.PORT || 3000, '0.0.0.0');
}
void bootstrap();
