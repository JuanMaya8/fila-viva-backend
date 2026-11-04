import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import configuration from '../src/config/configuration';
import { buildDataSourceOptions } from '../src/database/data-source';
import { seed } from '../src/database/seeds/seed';
import { configureApp } from '../src/main';

async function resetDatabase(): Promise<void> {
  const { database } = configuration();
  const admin = new Client({
    host: database.host,
    port: database.port,
    user: database.username,
    password: database.password,
    database: 'postgres',
  });
  await admin.connect();
  const exists = await admin.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [database.name],
  );
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${database.name}"`);
  }
  await admin.end();

  const ds = new DataSource(buildDataSourceOptions());
  await ds.initialize();
  await ds.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await seed(ds);
  await ds.destroy();
}

describe('Fila Viva main flow (e2e)', () => {
  let app: NestExpressApplication;
  let http: ReturnType<typeof request>;
  let adminCookie: string;
  let advisorCookie: string;
  let institutionId: string;
  let consultaId: string;
  let creditoId: string;

  const cookieOf = (res: request.Response) =>
    (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];

  beforeAll(async () => {
    await resetDatabase();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    await configureApp(app);
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  it('exposes only the minimum publicly', async () => {
    await http.get('/health').expect(200);
    await http.get('/agents').expect(401);
    await http.get('/dashboard').expect(401);
    await http.get('/internal/history').expect(401);
    await http
      .get('/internal/history')
      .set('X-API-Key', 'e2e-internal-key')
      .expect(200);
  });

  it('logs the admin in with an httpOnly cookie', async () => {
    await http
      .post('/auth/login')
      .send({ email: 'admin@e2e.test', password: 'wrong-password' })
      .expect(401);
    const res = await http
      .post('/auth/login')
      .send({ email: 'admin@e2e.test', password: 'e2e-admin-password' })
      .expect(200);
    expect(res.headers['set-cookie'][0]).toMatch(/fv_token=.*HttpOnly/);
    expect(res.body.user).not.toHaveProperty('passwordHash');
    adminCookie = cookieOf(res);

    const [institution] = (await http.get('/institutions').expect(200)).body;
    institutionId = institution.id;
    const types = (
      await http
        .get(`/service-types?institutionId=${institutionId}`)
        .expect(200)
    ).body;
    expect(types).toHaveLength(7);
    consultaId = types.find((t: { prefix: string }) => t.prefix === 'C').id;
    creditoId = types.find((t: { prefix: string }) => t.prefix === 'K').id;
  });

  it('lets the admin create an advisor that can log in', async () => {
    await http
      .post('/agents')
      .set('Cookie', adminCookie)
      .send({
        fullName: 'Ana Pérez',
        email: 'ana@e2e.test',
        password: 'ana-password',
        windowNumber: 1,
        serviceTypeIds: [consultaId, creditoId],
      })
      .expect(201);
    await http
      .post('/agents')
      .set('Cookie', adminCookie)
      .send({
        fullName: 'Duplicada',
        email: 'otra@e2e.test',
        password: 'otra-password',
        windowNumber: 1,
        serviceTypeIds: [consultaId],
      })
      .expect(409);
    const res = await http
      .post('/auth/login')
      .send({ email: 'ana@e2e.test', password: 'ana-password' })
      .expect(200);
    advisorCookie = cookieOf(res);
    await http.get('/dashboard').set('Cookie', advisorCookie).expect(403);
    await http
      .patch('/agents/me/status')
      .set('Cookie', advisorCookie)
      .send({ status: 'available' })
      .expect(200);
  });

  it('runs a turn end to end with correct positions and state rules', async () => {
    await http
      .post('/turns')
      .send({
        institutionId: '00000000-0000-4000-8000-000000000000',
        serviceTypeId: consultaId,
      })
      .expect(404);

    const first = (
      await http
        .post('/turns')
        .send({ institutionId, serviceTypeId: consultaId })
        .expect(201)
    ).body;
    const second = (
      await http
        .post('/turns')
        .send({ institutionId, serviceTypeId: consultaId })
        .expect(201)
    ).body;
    expect(first.ticketCode).toBe('C-001');
    expect(first.peopleAhead).toBe(0);
    expect(second.peopleAhead).toBe(1);
    expect(second.source).toBe('fallback');
    expect(second.estimatedWaitMinutes).toBeGreaterThanOrEqual(0);

    const queue = (
      await http
        .get(`/turns?serviceTypeId=${consultaId}`)
        .set('Cookie', advisorCookie)
        .expect(200)
    ).body;
    expect(queue.map((t: { peopleAhead: number }) => t.peopleAhead)).toEqual([
      0, 1,
    ]);

    const called = (
      await http
        .post('/turns/call-next')
        .set('Cookie', advisorCookie)
        .expect(200)
    ).body.turn;
    expect(called.id).toBe(first.id);
    expect(called.status).toBe('called');
    expect(called.windowNumber).toBe(1);
    await http
      .post('/turns/call-next')
      .set('Cookie', advisorCookie)
      .expect(409);

    await http
      .post(`/turns/${first.id}/complete`)
      .set('Cookie', advisorCookie)
      .send({})
      .expect(409);
    await http
      .post(`/turns/${first.id}/start`)
      .set('Cookie', advisorCookie)
      .expect(200);

    const me = (
      await http.get('/agents/me').set('Cookie', advisorCookie).expect(200)
    ).body;
    expect(me.currentTurn.status).toBe('in_service');
    await http
      .patch(`/turns/${first.id}/progress`)
      .set('Cookie', advisorCookie)
      .send({
        completedStepIds: [me.currentTurn.steps[0].id],
        notes: 'Saldo',
        isComplex: false,
      })
      .expect(200);

    const done = (
      await http
        .post(`/turns/${first.id}/complete`)
        .set('Cookie', advisorCookie)
        .send({ callNext: true })
        .expect(200)
    ).body;
    expect(done.completed.status).toBe('completed');
    expect(done.next.id).toBe(second.id);

    await http.post(`/turns/${second.id}/cancel`).expect(200);
    await http.post(`/turns/${second.id}/cancel`).expect(409);

    const dashboard = (
      await http.get('/dashboard').set('Cookie', adminCookie).expect(200)
    ).body;
    expect(dashboard.accuracy.samples).toBe(1);
    expect(dashboard.advisors[0].status).toBe('available');

    const history = (
      await http
        .get('/internal/history')
        .set('X-API-Key', 'e2e-internal-key')
        .expect(200)
    ).body;
    expect(history.count).toBe(1);
    expect(history.records[0]).not.toHaveProperty('notes');
  });

  it('logs the advisor out and marks them offline', async () => {
    await http.post('/auth/logout').set('Cookie', advisorCookie).expect(200);
    const dashboard = (
      await http.get('/dashboard').set('Cookie', adminCookie).expect(200)
    ).body;
    expect(dashboard.advisors[0].status).toBe('offline');
  });
});
