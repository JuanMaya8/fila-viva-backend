import 'reflect-metadata';
import 'dotenv/config';
import { join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import configuration from '../config/configuration';

/**
 * Single source of truth for the database connection, shared by the Nest
 * application (app.module.ts), the TypeORM CLI (npm run migration:*) and
 * the seed script. Schema changes always go through migrations: there is
 * no `synchronize` anywhere.
 */
export function buildDataSourceOptions(): DataSourceOptions {
  const { database } = configuration();
  const connection = database.url
    ? {
        url: database.url,
        ssl: { rejectUnauthorized: true },
      }
    : {
        host: database.host,
        port: database.port,
        username: database.username,
        password: database.password,
        database: database.name,
      };

  // ts-node (CLI, seed, tests) loads .ts sources; the compiled app loads .js.
  const ext = __filename.endsWith('.ts') ? 'ts' : 'js';

  return {
    type: 'postgres',
    ...connection,
    entities: [join(__dirname, '..', '**', `*.entity.${ext}`)],
    migrations: [join(__dirname, 'migrations', `*.${ext}`)],
    migrationsTableName: 'typeorm_migrations',
    synchronize: false,
    extra: { max: database.poolSize },
  };
}

export default new DataSource(buildDataSourceOptions());
