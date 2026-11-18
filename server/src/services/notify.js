import { query } from '../db.js';

export const notify = (userId, kind, message, link = null) =>
  query('INSERT INTO notifications (user_id, kind, message, link) VALUES ($1, $2, $3, $4)', [userId, kind, message, link]);

export const notifyAdmins = (kind, message, link = null) =>
  query(
    `INSERT INTO notifications (user_id, kind, message, link)
     SELECT id, $1, $2, $3 FROM users WHERE role = 'admin' AND status = 'active'`,
    [kind, message, link],
  );

export const audit = (actorId, action, targetType, targetId, metadata = {}) =>
  query(
    'INSERT INTO audit_log (actor_id, action, target_type, target_id, metadata) VALUES ($1, $2, $3, $4, $5)',
    [actorId, action, targetType, targetId, metadata],
  );
