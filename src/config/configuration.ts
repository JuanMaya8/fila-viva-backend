const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = value ? parseInt(value, 10) : NaN;
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toList = (value: string | undefined, fallback: string[]): string[] =>
  value
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : fallback;

export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: toInt(process.env.PORT, 3000),
  trustProxy: toInt(process.env.TRUST_PROXY_HOPS, 1),
  frontendUrls: toList(process.env.FRONTEND_URL, ['http://localhost:3001']),
  database: {
    url: process.env.DATABASE_URL || undefined,
    host: process.env.DB_HOST || 'localhost',
    port: toInt(process.env.DB_PORT, 5432),
    username: process.env.DB_USERNAME || 'filaviva',
    password: process.env.DB_PASSWORD || 'filaviva',
    name: process.env.DB_NAME || 'filaviva',
    poolSize: toInt(process.env.DB_POOL_SIZE, 10),
  },
  redis: {
    // Optional. When empty, queue snapshots are rebuilt from PostgreSQL.
    url: process.env.REDIS_URL || '',
    snapshotTtlSeconds: toInt(process.env.REDIS_SNAPSHOT_TTL_SECONDS, 600),
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || '',
    jwtExpiresInSeconds: toInt(process.env.JWT_EXPIRES_IN_SECONDS, 8 * 3600),
    socketTokenExpiresInSeconds: 300,
    cookieName: 'fv_token',
    cookieSecure: process.env.COOKIE_SECURE
      ? process.env.COOKIE_SECURE.toLowerCase() === 'true'
      : process.env.NODE_ENV === 'production',
  },
  seed: {
    adminEmail: process.env.ADMIN_EMAIL || '',
    adminPassword: process.env.ADMIN_PASSWORD || '',
  },
  internalApiKey: process.env.INTERNAL_API_KEY || '',
  predictionService: {
    baseUrl: process.env.PREDICTION_SERVICE_URL || 'http://localhost:8000',
    timeoutMs: toInt(process.env.PREDICTION_TIMEOUT_MS, 4000),
  },
  queue: {
    absentTimeoutMinutes: toInt(process.env.ABSENT_TIMEOUT_MINUTES, 3),
    refreshIntervalSeconds: toInt(process.env.QUEUE_REFRESH_SECONDS, 30),
    advisorDisconnectGraceSeconds: toInt(
      process.env.ADVISOR_DISCONNECT_GRACE_SECONDS,
      45,
    ),
  },
  rateLimit: {
    loginPerMinute: toInt(process.env.RATE_LIMIT_LOGIN_PER_MINUTE, 10),
    turnsPerMinute: toInt(process.env.RATE_LIMIT_TURNS_PER_MINUTE, 20),
  },
});
