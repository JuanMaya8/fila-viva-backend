export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
    username: process.env.DB_USERNAME || 'filaviva',
    password: process.env.DB_PASSWORD || 'filaviva',
    name: process.env.DB_NAME || 'filaviva',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
  },
  predictionService: {
    baseUrl: process.env.PREDICTION_SERVICE_URL || 'http://localhost:8000',
  },
});
