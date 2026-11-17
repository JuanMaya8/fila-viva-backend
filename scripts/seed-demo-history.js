#!/usr/bin/env node
/**
 * Fila Viva - simulated attention history for the demo.
 *
 * Fills the `prediction_logs` table with N simulated completed attentions so
 * the admin dashboard ("Error de la IA vs método tradicional") and the AI
 * retraining have a lot of history to work with.
 *
 * HOW IT STAYS HONEST
 *  - The "real" outcome (actual wait / actual service time) is simulated by a
 *    queue model that the AI never sees: lognormal durations, rush hours,
 *    paydays, advisor speed, ~12% complex cases.
 *  - The predictions are NOT invented: each row is predicted by calling the
 *    live fila-viva-ai service (/predict and /predict/remaining), exactly as
 *    the backend does for a real turn.
 *  - Every row is tagged prediction_source = 'sim:<source>' so it can be
 *    told apart from real turns and removed with --clear.
 *
 * USAGE (from the fila-viva-backend folder; `pg` is already a dependency)
 *   DATABASE_URL="postgres://..."  INTERNAL_API_KEY="..."  \
 *   node scripts/seed-demo-history.js --rows 600
 *
 * OPTIONS
 *   --rows N        attentions to generate (default 600, max 5000)
 *   --days N        spread them over the last N days (default 30)
 *   --ai-url URL    prediction service (default https://fila-viva-ai.onrender.com
 *                   or the AI_URL variable)
 *   --dry-run       generate and predict, print the summary, write nothing
 *   --clear         delete every simulated row (sim:%) and exit
 *   --seed N        random seed (default 7) - same seed, same data
 */
const crypto = require('crypto');

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const ROWS = Math.min(5000, Math.max(1, Number(opt('rows', 600))));
const DAYS = Math.max(1, Number(opt('days', 30)));
const AI_URL = (opt('ai-url', process.env.AI_URL || 'https://fila-viva-ai.onrender.com')).replace(/\/$/, '');
const API_KEY = process.env.INTERNAL_API_KEY || '';
const DATABASE_URL = process.env.DATABASE_URL || '';
const UTC_OFFSET_MIN = -300; // America/Bogota
const SIM_PREFIX = 'sim:';

// ---------------------------------------------------------------- random
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(Number(opt('seed', 7)));
const normal = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const lognormal = (median, sigma) => median * Math.exp(sigma * normal());
const pick = (weights) => {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
};
const poisson = (lambda) => {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > limit && k < 200);
  return k - 1;
};

// ---------------------------------------------------------------- ground truth
// Same shape as the real-world effects described in fila-viva-ai (synthetic.py).
const arrivalFactor = (h) => 0.55 + 0.9 * Math.exp(-((h - 11.5) ** 2) / 1.6) + 0.5 * Math.exp(-((h - 15) ** 2) / 0.8);
const durationHourFactor = (h) => 1 + 0.08 * Math.exp(-((h - 12) ** 2) / 2) + (h >= 15 ? 0.05 : 0);
const isPayday = (d) => {
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return [15, 16, 30, 31, 1].includes(d.getUTCDate()) || d.getUTCDate() === last;
};
const dayDurationFactor = (d) => (d.getUTCDay() === 1 ? 1.05 : 1) * (isPayday(d) ? 1.06 : 1);
const COMPLEX_P = 0.12;
const COMPLEX_MULT = 1.7;
const SIGMA = (avg) => (avg <= 6 ? 0.32 : avg <= 12 ? 0.38 : avg <= 20 ? 0.45 : 0.33);
// typical share of customers per service, from the shortest to the longest
const SHARES = [0.24, 0.24, 0.18, 0.1, 0.08, 0.08, 0.08];

function serviceMinutes(service, hour, date, speed, forceComplex) {
  const complex = forceComplex ?? rand() < COMPLEX_P;
  const minutes =
    lognormal(service.avg, SIGMA(service.avg)) *
    durationHourFactor(hour) *
    dayDurationFactor(date) *
    speed *
    (complex ? COMPLEX_MULT : 1);
  return { minutes: Math.max(0.5, minutes), complex };
}

function simulateScenario(services, weights, date, hour) {
  const agentsCount = [1, 2, 3, 4][pick([0.25, 0.35, 0.25, 0.15])];
  const speeds = Array.from({ length: agentsCount }, () => 0.8 + rand() * 0.45);
  const lambda = 3.2 * arrivalFactor(hour) * (isPayday(date) ? 1.5 : 1) * (agentsCount / 2.2);
  const ahead = Math.min(40, poisson(lambda));
  // agents may be in the middle of an attention when the customer arrives
  const free = speeds.map((s) => {
    if (rand() < 0.7) {
      const busyWith = services[pick(weights)];
      return rand() * serviceMinutes(busyWith, hour, date, s, false).minutes;
    }
    return 0;
  });
  for (let i = 0; i < ahead; i++) {
    const svc = services[pick(weights)];
    const a = free.indexOf(Math.min(...free));
    free[a] += serviceMinutes(svc, hour, date, speeds[a]).minutes;
  }
  const first = free.indexOf(Math.min(...free));
  return { agentsCount, ahead, actualWait: free[first], speed: speeds[first] };
}

// ---------------------------------------------------------------- AI client
async function ai(path, body) {
  const response = await fetch(`${AI_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`${path} -> HTTP ${response.status} ${await response.text()}`);
  return response.json();
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

// ---------------------------------------------------------------- main
async function main() {
  if (!DATABASE_URL && !flag('dry-run')) throw new Error('Set DATABASE_URL (Render > fila-viva-db > External Database URL).');
  const db = DATABASE_URL
    ? new (require('pg').Client)({ connectionString: DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(DATABASE_URL) ? false : { rejectUnauthorized: false } })
    : null;
  if (db) await db.connect();

  try {
    if (flag('clear')) {
      const r = await db.query(`DELETE FROM prediction_logs WHERE prediction_source LIKE $1`, [`${SIM_PREFIX}%`]);
      console.log(`Deleted ${r.rowCount} simulated rows.`);
      return;
    }

    if (!API_KEY) throw new Error('Set INTERNAL_API_KEY (same value as in fila-viva-ai / fila-viva-backend).');

    // Institution + service types (from the DB, or fixed demo values in --dry-run without DB)
    let institutionId;
    let services;
    if (db) {
      const inst = await db.query(`SELECT id FROM institutions WHERE code = 'banco-demo-centro' LIMIT 1`);
      if (!inst.rows[0]) throw new Error('Institution banco-demo-centro not found. Run the backend seed first.');
      institutionId = inst.rows[0].id;
      const st = await db.query(
        `SELECT s.id, s.prefix, s.avg_service_time_minutes AS avg,
                (SELECT COUNT(*) FROM service_steps x WHERE x.service_type_id = s.id)::int AS steps
           FROM service_types s WHERE s.institution_id = $1 AND s.active = true
          ORDER BY s.avg_service_time_minutes`,
        [institutionId],
      );
      services = st.rows.map((r) => ({ id: r.id, prefix: r.prefix, avg: Number(r.avg), steps: r.steps }));
    } else {
      institutionId = crypto.randomUUID();
      services = [3, 5, 6, 10, 15, 25, 35].map((avg, i) => ({ id: `dry-${i}`, prefix: 'X', avg, steps: 3 + (i % 4) }));
    }
    if (!services.length) throw new Error('No active service types found.');
    const weights = services.map((_, i) => (services.length === SHARES.length ? SHARES[i] : 1));

    const health = await ai('/health');
    const source = `${SIM_PREFIX}${health.source || 'model'}`.slice(0, 20);
    console.log(`AI service: ${AI_URL}  source=${health.source}  services=${services.length}  rows=${ROWS}`);

    // 1) Simulate the "real world"
    const scenarios = [];
    for (let n = 0; n < ROWS; n++) {
      // `date` carries the Bogotá wall-clock day (read it with getUTC*); `arrival` is the real UTC instant.
      const now = new Date();
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1 - Math.floor(rand() * DAYS)));
      while ([0, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() - 1); // bank closed on weekends
      let hour;
      do hour = 8 + rand() * 8; while (rand() * 1.95 > arrivalFactor(hour));
      const svc = services[pick(weights)];
      const sim = simulateScenario(services, weights, date, hour);
      const own = serviceMinutes(svc, hour, date, sim.speed);
      const arrival = new Date(date.getTime() + (hour * 60 - UTC_OFFSET_MIN) * 60000); // Bogotá time -> UTC
      scenarios.push({ svc, hour, arrival, sim, own });
    }

    // 2) Ask the real AI for its predictions
    let done = 0;
    const rows = await mapLimit(scenarios, 6, async (s) => {
      const prediction = await ai('/predict', {
        peopleAhead: s.sim.ahead,
        activeAgents: s.sim.agentsCount,
        serviceTypeId: s.svc.id,
        arrivalTime: s.arrival.toISOString(),
        avgServiceMinutes: s.svc.avg,
      });
      const remaining = await ai('/predict/remaining', {
        avgServiceMinutes: s.svc.avg,
        stepsTotal: s.svc.steps,
        stepsCompleted: 0,
        elapsedSeconds: 0,
        isComplex: false,
        advisorSpeedFactor: 1,
        timestamp: s.arrival.toISOString(),
        utcOffsetMinutes: UTC_OFFSET_MIN,
      });
      if (++done % 100 === 0) console.log(`  predicted ${done}/${ROWS}`);
      const startedAt = new Date(s.arrival.getTime() + s.sim.actualWait * 60000);
      return {
        turnId: crypto.randomUUID(),
        serviceTypeId: s.svc.id,
        avg: s.svc.avg,
        steps: s.svc.steps,
        complex: s.own.complex,
        predWait: prediction.estimatedWaitMinutes,
        tradWait: prediction.traditionalEstimateMinutes,
        actualWait: s.sim.actualWait,
        predService: remaining.expectedTotalMinutes,
        actualService: s.own.minutes,
        startedAt,
      };
    });

    // 3) Summary (same maths as the dashboard)
    const maeAi = mean(rows.map((r) => Math.abs(r.predWait - r.actualWait)));
    const maeTrad = mean(rows.map((r) => Math.abs(r.tradWait - r.actualWait)));
    const svcAi = mean(rows.map((r) => Math.abs(r.predService - r.actualService)));
    const svcAvg = mean(rows.map((r) => Math.abs(r.avg - r.actualService)));
    console.log('\nResults on the simulated history');
    console.log(`  Wait error   AI: ${maeAi.toFixed(2)} min | traditional: ${maeTrad.toFixed(2)} min | improvement: ${(((maeTrad - maeAi) / maeTrad) * 100).toFixed(0)}%`);
    console.log(`  Service err  AI: ${svcAi.toFixed(2)} min | configured average: ${svcAvg.toFixed(2)} min`);

    if (flag('dry-run')) {
      console.log('\n--dry-run: nothing was written.');
      return;
    }

    // 4) Write
    const CHUNK = 200;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const part = rows.slice(i, i + CHUNK);
      const values = [];
      const params = [];
      part.forEach((r, j) => {
        const b = j * 14;
        values.push(`(${Array.from({ length: 14 }, (_, k) => `$${b + k + 1}`).join(',')})`);
        params.push(
          institutionId, r.turnId, r.serviceTypeId, null, r.avg, r.steps, r.complex,
          r.predWait, r.tradWait, r.actualWait, r.predService, r.actualService, source, r.startedAt,
        );
      });
      await db.query(
        `INSERT INTO prediction_logs
           (institution_id, turn_id, service_type_id, agent_id, avg_service_minutes, steps_total, is_complex,
            predicted_wait_minutes, traditional_wait_minutes, actual_wait_minutes,
            predicted_service_minutes, actual_service_minutes, prediction_source, started_at)
         VALUES ${values.join(',')}`,
        params,
      );
      inserted += part.length;
    }
    console.log(`\nInserted ${inserted} simulated attentions (prediction_source='${source}').`);
    console.log('Next: Admin > Tablero > "Modelo IA" > reentrenar (or POST /dashboard/retrain) and refresh the dashboard.');
  } finally {
    if (db) await db.end();
  }
}

main().catch((error) => {
  console.error(`\nError: ${error.message}`);
  process.exit(1);
});
