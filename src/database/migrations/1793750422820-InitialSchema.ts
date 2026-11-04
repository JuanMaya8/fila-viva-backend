import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1793750422820 implements MigrationInterface {
  name = 'InitialSchema1793750422820';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "institutions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying NOT NULL, "name" character varying NOT NULL, "timezone" character varying NOT NULL DEFAULT 'America/Bogota', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_3617f5ad52593fd4355b38d03a1" UNIQUE ("code"), CONSTRAINT "PK_0be7539dcdba335470dc05e9690" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'advisor')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "institution_id" uuid NOT NULL, "email" character varying NOT NULL, "password_hash" character varying NOT NULL, "full_name" character varying NOT NULL, "role" "public"."users_role_enum" NOT NULL, "active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `,
    );
    await queryRunner.query(
      `CREATE TABLE "service_steps" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "service_type_id" uuid NOT NULL, "position" integer NOT NULL, "name" character varying NOT NULL, CONSTRAINT "PK_4d4849d73cd5afda6878ed46d08" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "service_types" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "institution_id" uuid NOT NULL, "name" character varying NOT NULL, "description" character varying(200) NOT NULL DEFAULT '', "prefix" character varying(3) NOT NULL, "avg_service_time_minutes" double precision NOT NULL DEFAULT '10', "active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1dc93417a097cdee3491f39d7cc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."agents_status_enum" AS ENUM('available', 'busy', 'on_break', 'offline')`,
    );
    await queryRunner.query(
      `CREATE TABLE "agents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "full_name" character varying NOT NULL, "institution_id" uuid NOT NULL, "window_number" integer NOT NULL, "status" "public"."agents_status_enum" NOT NULL DEFAULT 'offline', "status_changed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_57ee94c84a8e570e362af59dcea" UNIQUE ("user_id"), CONSTRAINT "REL_57ee94c84a8e570e362af59dce" UNIQUE ("user_id"), CONSTRAINT "PK_9c653f28ae19c5884d5baf6a1d9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."turns_status_enum" AS ENUM('created', 'called', 'in_service', 'completed', 'absent', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TABLE "turns" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "institution_id" uuid NOT NULL, "ticket_number" integer NOT NULL, "ticket_code" character varying(12) NOT NULL, "service_type_id" uuid NOT NULL, "preferential" boolean NOT NULL DEFAULT false, "agent_id" uuid, "status" "public"."turns_status_enum" NOT NULL DEFAULT 'created', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "called_at" TIMESTAMP WITH TIME ZONE, "started_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "closed_at" TIMESTAMP WITH TIME ZONE, "predicted_wait_minutes" double precision, "predicted_traditional_minutes" double precision, "predicted_confidence" integer, "predicted_service_minutes" double precision, "prediction_source" character varying(20), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_66edaea493f45e3c39d7c3553ed" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_turns_queue" ON "turns" ("institution_id", "status", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "service_progress" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "turn_id" uuid NOT NULL, "completed_step_ids" uuid array NOT NULL DEFAULT '{}', "notes" text NOT NULL DEFAULT '', "is_complex" boolean NOT NULL DEFAULT false, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_c72dea8815153715de04559e7a0" UNIQUE ("turn_id"), CONSTRAINT "REL_c72dea8815153715de04559e7a" UNIQUE ("turn_id"), CONSTRAINT "PK_eb98c9c0317fa094e55ebfc3e46" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "prediction_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "institution_id" uuid NOT NULL, "turn_id" uuid NOT NULL, "service_type_id" uuid NOT NULL, "agent_id" uuid, "avg_service_minutes" double precision NOT NULL, "steps_total" integer NOT NULL, "is_complex" boolean NOT NULL DEFAULT false, "predicted_wait_minutes" double precision, "traditional_wait_minutes" double precision, "actual_wait_minutes" double precision NOT NULL, "predicted_service_minutes" double precision, "actual_service_minutes" double precision NOT NULL, "prediction_source" character varying(20), "started_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_ca463b12c2af8a992ffdf15a97e" UNIQUE ("turn_id"), CONSTRAINT "PK_9413cebaa48a6674bd0836eebb7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_prediction_logs_institution" ON "prediction_logs" ("institution_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "agent_service_types" ("agent_id" uuid NOT NULL, "service_type_id" uuid NOT NULL, CONSTRAINT "PK_ebc0acfc7ae340296e4b6eb4ce0" PRIMARY KEY ("agent_id", "service_type_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a512071786f9feed6d156a1f59" ON "agent_service_types" ("agent_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0f085f9d6ea953df625ebddcfe" ON "agent_service_types" ("service_type_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_822972ceea1fda0973b8acc7bbe" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_steps" ADD CONSTRAINT "FK_ca1e6c282ab35ec9dd2ff10551f" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_types" ADD CONSTRAINT "FK_25bdf25cc68e6ee7f377aefae3d" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "agents" ADD CONSTRAINT "FK_57ee94c84a8e570e362af59dcea" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "agents" ADD CONSTRAINT "FK_79d06f233d365d91f3857dbdbf7" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "turns" ADD CONSTRAINT "FK_fe72ccb48fd765ea560457aa54f" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "turns" ADD CONSTRAINT "FK_a2295cc6d31ac95c81a58ae65e3" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "turns" ADD CONSTRAINT "FK_d3121fd41f00c653feee12d9ea6" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_progress" ADD CONSTRAINT "FK_c72dea8815153715de04559e7a0" FOREIGN KEY ("turn_id") REFERENCES "turns"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_service_types" ADD CONSTRAINT "FK_a512071786f9feed6d156a1f592" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_service_types" ADD CONSTRAINT "FK_0f085f9d6ea953df625ebddcfe6" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agent_service_types" DROP CONSTRAINT "FK_0f085f9d6ea953df625ebddcfe6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_service_types" DROP CONSTRAINT "FK_a512071786f9feed6d156a1f592"`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_progress" DROP CONSTRAINT "FK_c72dea8815153715de04559e7a0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "turns" DROP CONSTRAINT "FK_d3121fd41f00c653feee12d9ea6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "turns" DROP CONSTRAINT "FK_a2295cc6d31ac95c81a58ae65e3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "turns" DROP CONSTRAINT "FK_fe72ccb48fd765ea560457aa54f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agents" DROP CONSTRAINT "FK_79d06f233d365d91f3857dbdbf7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agents" DROP CONSTRAINT "FK_57ee94c84a8e570e362af59dcea"`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_types" DROP CONSTRAINT "FK_25bdf25cc68e6ee7f377aefae3d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_steps" DROP CONSTRAINT "FK_ca1e6c282ab35ec9dd2ff10551f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_822972ceea1fda0973b8acc7bbe"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0f085f9d6ea953df625ebddcfe"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a512071786f9feed6d156a1f59"`,
    );
    await queryRunner.query(`DROP TABLE "agent_service_types"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_prediction_logs_institution"`,
    );
    await queryRunner.query(`DROP TABLE "prediction_logs"`);
    await queryRunner.query(`DROP TABLE "service_progress"`);
    await queryRunner.query(`DROP INDEX "public"."idx_turns_queue"`);
    await queryRunner.query(`DROP TABLE "turns"`);
    await queryRunner.query(`DROP TYPE "public"."turns_status_enum"`);
    await queryRunner.query(`DROP TABLE "agents"`);
    await queryRunner.query(`DROP TYPE "public"."agents_status_enum"`);
    await queryRunner.query(`DROP TABLE "service_types"`);
    await queryRunner.query(`DROP TABLE "service_steps"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(`DROP TABLE "institutions"`);
  }
}
