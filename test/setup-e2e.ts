// Isolated environment for the e2e suite. Variables set here win over .env
// because dotenv never overrides values that already exist.
Object.assign(process.env, {
  NODE_ENV: 'test',
  DB_NAME: 'filaviva_e2e',
  DATABASE_URL: '',
  REDIS_URL: '',
  JWT_SECRET: 'e2e-secret-not-for-production',
  INTERNAL_API_KEY: 'e2e-internal-key',
  ADMIN_EMAIL: 'admin@e2e.test',
  ADMIN_PASSWORD: 'e2e-admin-password',
  // Nothing listens here: every prediction must come from the fallback.
  PREDICTION_SERVICE_URL: 'http://127.0.0.1:9',
  PREDICTION_TRANSPORT: 'http',
  PREDICTION_TIMEOUT_MS: '500',
  QUEUE_REFRESH_SECONDS: '0',
  COOKIE_SECURE: 'false',
});
