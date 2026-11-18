import { createHash } from 'node:crypto';
import { config } from '../config.js';

const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = config;
export const uploadsEnabled = Boolean(cloud && key && secret);

const KINDS = {
  avatar: { folder: 'avatars', formats: 'jpg,png,webp' },
  certificate: { folder: 'certificates', formats: 'pdf,jpg,png,webp' },
};

const folderFor = (userId, kind) => `skillproof/${userId}/${KINDS[kind].folder}`;

// Signed params let the browser upload straight to Cloudinary, but only into this user's folder.
export function signUpload(userId, kind) {
  const params = { allowed_formats: KINDS[kind].formats, folder: folderFor(userId, kind), timestamp: Math.floor(Date.now() / 1000) };
  const toSign = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
  return {
    ...params,
    signature: createHash('sha1').update(toSign + secret).digest('hex'),
    api_key: key,
    upload_url: `https://api.cloudinary.com/v1_1/${cloud}/auto/upload`,
  };
}

export const ownsUpload = (url, userId, kind) =>
  typeof url === 'string' &&
  url.startsWith(`https://res.cloudinary.com/${cloud}/`) &&
  url.includes(`/${folderFor(userId, kind)}/`);
