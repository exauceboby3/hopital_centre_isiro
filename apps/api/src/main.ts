import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { json, NextFunction, Request, Response, urlencoded } from 'express';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { validationException } from './common/validation-errors';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);
  const webUrl = config.get<string>('WEB_URL', 'http://localhost:3000');
  const port = config.get<number>('API_PORT', 4000);

  app.setGlobalPrefix('api');
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));
  app.use(helmet());
  app.use(cookieParser());
  app.use((request: Request, response: Response, next: NextFunction) => {
    const origin = request.get('origin');
    const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (isMutation && origin && origin !== webUrl) {
      response.status(403).json({
        statusCode: 403,
        code: 'ORIGIN_FORBIDDEN',
        message:
          'Cette demande provient d’une adresse non autorisée. Ouvrez l’application depuis son adresse officielle.',
        timestamp: new Date().toISOString(),
        path: request.path,
      });
      return;
    }
    next();
  });
  app.enableCors({
    origin: webUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationException,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle("API du Centre Hospitalier d'Isiro")
    .setDescription('Gestion sécurisée des opérations hospitalières')
    .setVersion('2.0')
    .addCookieAuth('hospital_access')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(port, '0.0.0.0');
}

void bootstrap();
