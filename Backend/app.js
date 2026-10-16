require('dotenv').config();
const { validateEnv } = require('./config/validateEnv');

// Skip hard exit during Jest; tests set env in setup
if (process.env.NODE_ENV !== 'test') {
  validateEnv();
}

const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const cors = require('cors');
const path = require('path');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const analysisRoutes = require('./routes/analysisRoutes');
const apicache = require('apicache');
const { getHealthReport } = require('./services/healthService');
const {
  runStartupRecovery,
  startPeriodicRecovery,
} = require('./services/analysisRecoveryService');

const app = express();

// Security Middleware — allow browser clients on other origins to read API responses
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.length === 0) {
        return callback(null, process.env.NODE_ENV !== 'production');
      }
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 1000,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 40,
  message: { success: false, message: 'Too many authentication attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const cache = apicache.middleware;

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', async (req, res) => {
  try {
    const report = await getHealthReport();
    const code = report.status === 'OK' ? 200 : 503;
    res.status(code).json(report);
  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      message: 'Health check failed',
    });
  }
});

app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to the API',
  });
});

app.use('/auth', authLimiter, authRoutes);
app.use('/users', userRoutes);
app.use('/analysis', analysisRoutes);

app.use('/api/', limiter);
app.use('/api/repos/', cache('5 minutes'));
app.use('/api/contributors/', cache('10 minutes'));

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

app.use((err, req, res, next) => {
  if (process.env.NODE_ENV !== 'test') {
    console.error(err.stack);
  }

  const statusCode = err.statusCode || 500;
  const message =
    process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message;

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

async function startServer() {
  await connectDB();
  await runStartupRecovery();
  startPeriodicRecovery();

  const PORT = process.env.PORT || 5000;
  const server = app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  });

  process.on('unhandledRejection', (err) => {
    console.error(`Error: ${err.message}`);
    server.close(() => process.exit(1));
  });

  return server;
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  });
}

module.exports = app;
module.exports.startServer = startServer;
