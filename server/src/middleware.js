import { randomUUID } from 'node:crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { config, origins } from './config.js';
import { one, query } from './db.js';
import { log, errInfo } from './log.js';
import { AppError, badRequest, forbidden, notFound, tooMany, unauthorized } from './errors.js';
import { sha256 } from './lib/passwords.js';

export const SESSION_COOKIE = 'sp_session';

export function requestId(req, res, next) {
  const incoming = req.get('x-request-id');
  req.id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.set('X-Request-Id', req.id);
  next();
}

export function accessLog(req, res, next) {
  const start = performance.now();
  res.on('finish', () =>
    log.info('request', {
      requestId: req.id,
      userId: req.user?.id,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      ms: Math.round(performance.now() - start),
    }),
  );
  next();
}

// A custom header cannot be sent cross-site without a CORS preflight, which the whitelist rejects.
export function csrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-skillproof') !== '1') return next(forbidden('Missing X-SkillProof request header'));
  const origin = req.get('origin');
  if (origin && !origins.includes(origin)) return next(forbidden('Origin not allowed'));
  next();
}

function readCookie(header = '', name) {
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

export async function loadUser(req, res, next) {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE);
  if (!token) return next();
  const hash = sha256(token);
  const user = await one(
    `SELECT u.id, u.email, u.name, u.role, u.status, u.organization, u.email_verified_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hash],
  );
  if (user && user.status !== 'suspended') {
    req.user = user;
    req.sessionHash = hash;
  }
  next();
}

export const requireAuth = (req, res, next) => (req.user ? next() : next(unauthorized()));

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(unauthorized());
  if (!roles.includes(req.user.role)) return next(forbidden());
  if (req.user.status === 'pending') return next(forbidden('Your account is awaiting approval by an administrator'));
  next();
};

// Validates params/query/body with zod; parsed values land in req.valid.
export const validate = (schemas) => (req, res, next) => {
  req.valid = {};
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part] ?? {});
    if (!result.success) {
      const fields = Object.fromEntries(result.error.issues.map((i) => [i.path.join('.') || part, i.message]));
      return next(badRequest('Please check the highlighted fields', fields));
    }
    req.valid[part] = result.data;
  }
  next();
};

const limitHandler = (req, res, next, options) =>
  next(tooMany('Too many requests. Please slow down and try again shortly.', Math.ceil(options.windowMs / 1000)));
const skipInTest = () => config.NODE_ENV === 'test';
const common = { standardHeaders: 'draft-8', legacyHeaders: false, handler: limitHandler };

// Note: in-memory stores; move to a shared store before running more than one instance.
export const ipLimit = rateLimit({ ...common, windowMs: 60_000, limit: 100, skip: skipInTest });
export const userLimit = rateLimit({
  ...common, windowMs: 60_000, limit: 1000,
  skip: (req) => !req.user, keyGenerator: (req) => `u:${req.user.id}`,
});
export const authLimit = rateLimit({ ...common, windowMs: 15 * 60_000, limit: 10, skip: skipInTest });
export const aiLimit = rateLimit({
  ...common, windowMs: 60_000, limit: 10,
  keyGenerator: (req) => (req.user ? `ai:${req.user.id}` : ipKeyGenerator(req.ip)),
});

export const notFoundRoute = (req, res, next) => next(notFound('This endpoint does not exist'));

export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  let status = err instanceof AppError ? err.status : err.status || err.statusCode || 500;
  const isBodyError = !(err instanceof AppError) && err.expose && status < 500;
  if (!(err instanceof AppError) && !isBodyError) status = 500;

  const message = err instanceof AppError ? err.message
    : status === 413 ? 'Request is too large'
    : isBodyError ? 'Request body is not valid JSON'
    : 'Something went wrong on our side. Please try again.';
  const code = err instanceof AppError ? err.code : status >= 500 ? 'INTERNAL' : 'BAD_REQUEST';

  if (status >= 500) {
    log.error('request failed', { requestId: req.id, userId: req.user?.id, path: req.originalUrl, err: errInfo(err) });
    query(
      'INSERT INTO error_events (request_id, user_id, method, path, message, stack) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.id, req.user?.id ?? null, req.method, req.originalUrl.slice(0, 300), String(err.message).slice(0, 1000), String(err.stack ?? '').slice(0, 4000)],
    ).catch(() => {});
  } else {
    log.warn('request rejected', { requestId: req.id, userId: req.user?.id, status, code, message });
  }

  if (res.headersSent) return res.end();
  if (err.retryAfter) res.set('Retry-After', String(err.retryAfter));
  res.status(status).json({ error: { code, message, requestId: req.id, fields: err.fields, details: err.details } });
}
