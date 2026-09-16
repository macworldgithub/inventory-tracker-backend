import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const port = configService.get<number>('PORT') || 3001;
  const corsOrigin = configService.get<string>('CORS_ORIGIN') || '*';
  const swaggerPath = configService.get<string>('SWAGGER_PATH') || 'api/docs';

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

  await app.listen(port);
  logger.log(`================================================================`);
  logger.log(`🚗 Good Showroom Live Inventory Tracker API is live on port ${port}`);
  logger.log(`   Swagger Documentation URL: http://localhost:${port}/${swaggerPath}`);
  logger.log(`   Booran Motor Group Backend [NestJS + MongoDB (Mongoose)]`);
  logger.log(`================================================================`);
}
bootstrap();
