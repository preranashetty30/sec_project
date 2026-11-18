import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db.js';
import { badRequest, notFound, unavailable } from '../errors.js';
import { requireRole, validate } from '../middleware.js';
import { uploadsEnabled, signUpload, ownsUpload } from '../lib/cloudinary.js';

export const certificates = Router();
export const uploads = Router();
const student = requireRole('student');

const needUploads = (req, res, next) =>
  uploadsEnabled ? next() : next(unavailable('Uploads are not configured on this server'));

uploads.post('/sign', student, needUploads, validate({ body: z.object({ kind: z.enum(['avatar', 'certificate']) }) }), (req, res) => {
  res.json(signUpload(req.user.id, req.valid.body.kind));
});

certificates.get('/', student, async (req, res) => {
  const { rows } = await query('SELECT id, title, issuer, file_url, created_at FROM certificates WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
  res.json({ certificates: rows });
});

const certSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(120),
  issuer: z.string().trim().max(120).default(''),
  file_url: z.string().max(500),
});

certificates.post('/', student, needUploads, validate({ body: certSchema }), async (req, res) => {
  const b = req.valid.body;
  if (!ownsUpload(b.file_url, req.user.id, 'certificate')) throw badRequest('The file must be uploaded through SkillProof');
  const certificate = await one(
    'INSERT INTO certificates (user_id, title, issuer, file_url) VALUES ($1, $2, $3, $4) RETURNING id, title, issuer, file_url, created_at',
    [req.user.id, b.title, b.issuer, b.file_url],
  );
  res.status(201).json({ certificate });
});

certificates.delete('/:id', student, validate({ params: z.object({ id: z.uuid() }) }), async (req, res) => {
  const { rowCount } = await query('DELETE FROM certificates WHERE id = $1 AND user_id = $2', [req.valid.params.id, req.user.id]);
  if (!rowCount) throw notFound('Certificate not found');
  res.status(204).end();
});
