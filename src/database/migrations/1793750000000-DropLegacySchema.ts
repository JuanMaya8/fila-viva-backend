import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The week-3 demo created its tables with `synchronize` (agents,
 * service_types, turns) and only ever held fictitious data. This migration
 * removes that legacy schema so InitialSchema can create the real one.
 * It is a no-op on fresh databases and on databases already migrated.
 */
export class DropLegacySchema1793750000000 implements MigrationInterface {
  name = 'DropLegacySchema1793750000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [{ legacy }] = await queryRunner.query(
      `SELECT to_regclass('public.turns') IS NOT NULL
          AND to_regclass('public.institutions') IS NULL AS legacy`,
    );
    if (!legacy) {
      return;
    }
    await queryRunner.query(
      `DROP TABLE IF EXISTS "turns", "agents", "service_types" CASCADE`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."turns_status_enum", "public"."agents_status_enum"`,
    );
  }

  public async down(): Promise<void> {
    // The legacy schema is intentionally not restored.
  }
}
