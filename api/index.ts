import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const server = express();
let isAppInitialized = false;

async function bootstrap() {
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(server),
  );

  const corsOrigin = process.env.CORS_ORIGIN || '*';
  const swaggerPath = process.env.SWAGGER_PATH || 'api/docs';

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: corsOrigin,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Swagger OpenAPI Setup
  const config = new DocumentBuilder()
    .setTitle('Good Showroom — Live Inventory Tracker API')
    .setDescription(
      'First-Party Inventory Business Intelligence & Reconciliation API for Booran Motor Group. Joins Pentana DMS (eraPower/EraNet) commercial cost ledger with published rooftop website inventory feeds.'
    )
    .setVersion('1.0.0')
    .addTag('Inventory', 'Live stock queries, role dashboards, feed status, and unit drawer intelligence')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(swaggerPath, app, document, {
    customSiteTitle: 'Good Showroom API Documentation | Booran Motor Group',
  });

  await app.init();
  isAppInitialized = true;
}

export default async function handler(req: any, res: any) {
  if (!isAppInitialized) {
    await bootstrap();
  }
  server(req, res);
}
