import { Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import configuration from '../../config/configuration';
import { UserRole } from '../../common/enums/user-role.enum';
import { PASSWORD_HASH_ROUNDS } from '../../common/utils/password';
import { Institution } from '../../modules/institutions/entities/institution.entity';
import { ServiceType } from '../../modules/service-types/entities/service-type.entity';
import { User } from '../../modules/users/entities/user.entity';
import dataSource from '../data-source';
import { SEED_INSTITUTION, SEED_SERVICE_TYPES } from './bank-seed-data';

/**
 * Idempotent seed: runs pending migrations, then makes sure the demo
 * institution, the initial administrator (from ADMIN_EMAIL /
 * ADMIN_PASSWORD) and the bank service types exist. Running it twice
 * changes nothing; it never overwrites data edited from the admin panel.
 */
export async function seed(ds: DataSource, logger = new Logger('Seed')) {
  const { seed: seedConfig } = configuration();
  if (!seedConfig.adminEmail || !seedConfig.adminPassword) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set to seed');
  }

  await ds.runMigrations({ transaction: 'each' });

  const institutions = ds.getRepository(Institution);
  let institution = await institutions.findOne({
    where: { code: SEED_INSTITUTION.code },
  });
  if (!institution) {
    institution = await institutions.save(
      institutions.create(SEED_INSTITUTION),
    );
    logger.log(`Created institution ${institution.name}`);
  }

  const users = ds.getRepository(User);
  const adminEmail = seedConfig.adminEmail.trim().toLowerCase();
  const existingAdmin = await users.findOne({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await users.save(
      users.create({
        email: adminEmail,
        fullName: 'Administrador',
        role: UserRole.ADMIN,
        institutionId: institution.id,
        passwordHash: await bcrypt.hash(
          seedConfig.adminPassword,
          PASSWORD_HASH_ROUNDS,
        ),
      }),
    );
    logger.log(`Created administrator ${adminEmail}`);
  }

  const serviceTypes = ds.getRepository(ServiceType);
  for (const seedType of SEED_SERVICE_TYPES) {
    const exists = await serviceTypes.findOne({
      where: { institutionId: institution.id, prefix: seedType.prefix },
    });
    if (exists) {
      continue;
    }
    await serviceTypes.save(
      serviceTypes.create({
        institutionId: institution.id,
        prefix: seedType.prefix,
        name: seedType.name,
        description: seedType.description,
        avgServiceTimeMinutes: seedType.avgServiceTimeMinutes,
        steps: seedType.steps.map((name, index) => ({
          name,
          position: index + 1,
        })),
      }),
    );
    logger.log(`Created service type ${seedType.name}`);
  }
}

async function main(): Promise<void> {
  const logger = new Logger('Seed');
  await dataSource.initialize();
  try {
    await seed(dataSource, logger);
    logger.log('Seed finished');
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    new Logger('Seed').error(`Seed failed: ${message}`);
    process.exit(1);
  });
}
