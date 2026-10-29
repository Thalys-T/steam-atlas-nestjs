import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(helmet({ contentSecurityPolicy: { directives: {
    'img-src': ["'self'", 'https:', 'data:'],
    'script-src': ["'self'"],
    'upgrade-insecure-requests': null,
  } } }));
  app.setGlobalPrefix('api');
  app.useStaticAssets(join(__dirname, '..', 'public'));
  const config = new DocumentBuilder().setTitle('Steam Profile Explorer')
    .setDescription('Consulta pública de perfis, screenshots e conquistas. Nunca retorna a chave Steam.')
    .setVersion('1.0').build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  await app.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1');
  console.log(`Interface: http://localhost:${process.env.PORT || 3000}`);
}
bootstrap();
