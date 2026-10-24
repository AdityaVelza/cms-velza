import path from 'path';
import type { Core } from '@strapi/strapi';
import { isDatabaseClientKind } from '@strapi/database';

type Env = Core.Config.Shared.ConfigParams['env'];

// Settings every network database (postgres, mysql) must define explicitly.
const SERVER_KEYS = [
  'DATABASE_HOST',
  'DATABASE_PORT',
  'DATABASE_NAME',
  'DATABASE_USERNAME',
  'DATABASE_PASSWORD',
];

/**
 * Throws when any of the given variables is missing or blank.
 * Only variable names are reported, never their values.
 */
const requireEnv = (env: Env, keys: string[]): void => {
  const missing = keys.filter((key) => !env(key)?.trim());

  if (missing.length > 0) {
    throw new Error(
      `Missing required database environment variable(s): ${missing.join(', ')}. ` +
        'Set them in the local .env file (see .env.example).'
    );
  }
};

const requirePort = (env: Env, key: string): number => {
  const value = env(key)?.trim() ?? '';
  const port = Number(value);

  if (!/^\d+$/.test(value) || port < 1 || port > 65535) {
    throw new Error(`${key} must be an integer between 1 and 65535.`);
  }

  return port;
};

const sslConfig = (env: Env) =>
  env.bool('DATABASE_SSL', false) && {
    key: env('DATABASE_SSL_KEY', undefined),
    cert: env('DATABASE_SSL_CERT', undefined),
    ca: env('DATABASE_SSL_CA', undefined),
    capath: env('DATABASE_SSL_CAPATH', undefined),
    cipher: env('DATABASE_SSL_CIPHER', undefined),
    rejectUnauthorized: env.bool('DATABASE_SSL_REJECT_UNAUTHORIZED', true),
  };

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Database => {
  requireEnv(env, ['DATABASE_CLIENT']);

  const client = env('DATABASE_CLIENT')!.trim();

  if (!isDatabaseClientKind(client)) {
    throw new Error(
      `Unsupported DATABASE_CLIENT: ${client}. Use "postgres", "mysql", or "sqlite".`
    );
  }

  // pg lets a connection string override the explicit settings below, so refuse it
  // rather than silently connecting somewhere other than the configured host/database.
  if (client !== 'sqlite' && env('DATABASE_URL')?.trim()) {
    throw new Error(
      'DATABASE_URL is not supported. Configure DATABASE_HOST, DATABASE_PORT, ' +
        'DATABASE_NAME, DATABASE_USERNAME and DATABASE_PASSWORD instead.'
    );
  }

  // Each client is resolved lazily so only the selected client's settings are required.
  const connections: Record<
    Core.Config.Database.ClientKind,
    () => Core.Config.Database['connection']
  > = {
    mysql: () => {
      requireEnv(env, SERVER_KEYS);

      return {
        client: 'mysql',
        connection: {
          host: env('DATABASE_HOST')!,
          port: requirePort(env, 'DATABASE_PORT'),
          database: env('DATABASE_NAME')!,
          user: env('DATABASE_USERNAME')!,
          password: env('DATABASE_PASSWORD')!,
          ssl: sslConfig(env),
        },
        pool: { min: env.int('DATABASE_POOL_MIN', 2), max: env.int('DATABASE_POOL_MAX', 10) },
      };
    },
    postgres: () => {
      requireEnv(env, SERVER_KEYS);

      return {
        client: 'postgres',
        connection: {
          host: env('DATABASE_HOST')!,
          port: requirePort(env, 'DATABASE_PORT'),
          database: env('DATABASE_NAME')!,
          user: env('DATABASE_USERNAME')!,
          password: env('DATABASE_PASSWORD')!,
          ssl: sslConfig(env),
          schema: env('DATABASE_SCHEMA', 'public'),
        },
        pool: { min: env.int('DATABASE_POOL_MIN', 2), max: env.int('DATABASE_POOL_MAX', 10) },
      };
    },
    sqlite: () => {
      requireEnv(env, ['DATABASE_FILENAME']);

      return {
        client: 'sqlite',
        connection: {
          filename: path.join(__dirname, '..', '..', env('DATABASE_FILENAME')!),
        },
        useNullAsDefault: true,
      };
    },
  };

  return {
    connection: {
      ...connections[client](),
      acquireConnectionTimeout: env.int('DATABASE_CONNECTION_TIMEOUT', 60000),
    },
  };
};

export default config;
