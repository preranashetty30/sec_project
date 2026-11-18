import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pkg from '../package.json' with { type: 'json' };
import { config, origins, trustProxy } from './config.js';
import { query } from './db.js';
import { breakerState } from './lib/groq.js';
import { uploadsEnabled } from './lib/cloudinary.js';
import {
  requestId, accessLog, csrf, loadUser, ipLimit, userLimit, notFoundRoute, errorHandler,
} from './middleware.js';
import auth from './routes/auth.js';
import me from './routes/me.js';
import projects from './routes/projects.js';
import { certificates, uploads } from './routes/certificates.js';
import assessments from './routes/assessments.js';
import ai from './routes/ai.js';
import classes from './routes/classes.js';
import { talent, shortlist } from './routes/talent.js';
import { notifications, admin, publicRoutes } from './routes/misc.js';

async function health(req, res) {
  let database = 'ok';
  try {
    await Promise.race([query('SELECT 1'), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500))]);
  } catch {
    database = 'down';
  }
  const checks = {
    database,
    groq: config.GROQ_API_KEY ? 'configured' : 'not_configured',
    email: config.BREVO_API_KEY ? 'configured' : 'log_only',
    uploads: uploadsEnabled ? 'configured' : 'not_configured',
  };
  const breaker = breakerState();
  const status = database !== 'ok' ? 'unhealthy' : checks.groq !== 'configured' || breaker === 'open' ? 'degraded' : 'healthy';
  res.status(database === 'ok' ? 200 : 503).json({ status, checks, breaker, uptime: Math.round(process.uptime()), version: pkg.version });
}

export function createApp() {
  const app = express();
  app.set('trust proxy', trustProxy);
  app.disable('x-powered-by');

  app.use(requestId, accessLog);
  app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
    frameguard: { action: 'deny' },
  }));
  app.use((req, res, next) => {
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
  app.use(cors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-SkillProof', 'X-Request-Id'],
    maxAge: 600,
  }));

  app.get(['/health', '/api/v1/health'], health);

  app.use(ipLimit);
  app.use(express.json({ limit: '100kb' }));
  app.use(loadUser, userLimit, csrf);

  const api = express.Router();
  api.use('/auth', auth);
  api.use('/me', me);
  api.use('/projects', projects);
  api.use('/certificates', certificates);
  api.use('/uploads', uploads);
  api.use('/assessments', assessments);
  api.use('/ai', ai);
  api.use('/classes', classes);
  api.use('/talent', talent);
  api.use('/shortlist', shortlist);
  api.use('/notifications', notifications);
  api.use('/admin', admin);
  api.use('/public', publicRoutes);
  app.use('/api/v1', api);

  app.use(notFoundRoute);
  app.use(errorHandler);
  return app;
}
