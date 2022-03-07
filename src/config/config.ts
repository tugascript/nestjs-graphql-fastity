import { LoadStrategy } from '@mikro-orm/core';
import { IConfig } from './interfaces/config.interface';

export function config(): IConfig {
  const TESTING = process.env.NODE_ENV !== 'production';

  return {
    port: parseInt(process.env.PORT, 10),
    playground: process.env.PLAYGROUND === 'true',
    url: process.env.URL,
    jwt: {
      access: {
        secret: process.env.JWT_ACCESS_SECRET,
        time: parseInt(process.env.JWT_ACCESS_TIME, 10),
      },
      confirmation: {
        secret: process.env.JWT_CONFIRMATION_SECRET,
        time: parseInt(process.env.JWT_CONFIRMATION_TIME, 10),
      },
      resetPassword: {
        secret: process.env.JWT_RESET_PASSWORD_SECRET,
        time: parseInt(process.env.JWT_RESET_PASSWORD_TIME, 10),
      },
      refresh: {
        secret: process.env.JWT_REFRESH_SECRET,
        time: parseInt(process.env.JWT_REFRESH_TIME, 10),
      },
      wsAccess: {
        secret: process.env.JWT_ACCESS_SECRET,
        time: parseInt(process.env.JWT_WS_ACCESS_TIME, 10),
      },
    },
    emailService: {
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT, 10),
      secure: Boolean(process.env.EMAIL_SECURE),
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    },
    bucketConfig: {
      forcePathStyle: false,
      region: process.env.BUCKET_REGION,
      endpoint: `https://${process.env.BUCKET_REGION}.linodeobjects.com`,
      credentials: {
        accessKeyId: process.env.BUCKET_ACCESS_KEY,
        secretAccessKey: process.env.BUCKET_SECRET_KEY,
      },
    },
    db: TESTING
      ? {
          type: 'sqlite',
          dbName: 'test.db',
          entities: ['dist/**/*.entity.js', 'dist/**/*.embeddable.js'],
          entitiesTs: ['src/**/*.entity.ts', 'src/**/*.embeddable.ts'],
          loadStrategy: LoadStrategy.JOINED,
          allowGlobalContext: true,
        }
      : {
          type: 'postgresql',
          host: process.env.DB_HOST,
          port: parseInt(process.env.DB_PORT, 10),
          entities: ['dist/**/*.entity.js', 'dist/**/*.embeddable.js'],
          entitiesTs: ['src/**/*.entity.ts', 'src/**/*.embeddable.ts'],
          password: process.env.DB_PASSWORD,
          user: process.env.DB_USERNAME,
          dbName: process.env.DB_DATABASE,
          loadStrategy: LoadStrategy.JOINED,
          allowGlobalContext: true,
        },
    redis: TESTING
      ? null
      : {
          host: process.env.REDIS_HOST,
          port: parseInt(process.env.REDIS_PORT, 10),
        },
    ttl: parseInt(process.env.REDIS_CACHE_TTL, 10),
    upload: {
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10),
      maxFiles: parseInt(process.env.MAX_FILES, 10),
    },
    testing: TESTING,
    likeOperator: TESTING ? '$like' : '$ilike',
  };
}
