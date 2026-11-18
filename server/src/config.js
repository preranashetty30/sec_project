import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  APP_ORIGIN: z.string().default('http://localhost:5173'),
  TRUST_PROXY: z.string().default(process.env.VERCEL ? '1' : 'loopback'),
  GROQ_API_KEY: z.string().default(''),
  GROQ_BASE_URL: z.url().default('https://api.groq.com/openai/v1'),
  GROQ_MODEL: z.string().default('openai/gpt-oss-120b'),
  AI_DAILY_ASSESSMENTS: z.coerce.number().int().positive().default(5),
  AI_DAILY_FEEDBACK: z.coerce.number().int().positive().default(20),
  BREVO_API_KEY: z.string().default(''),
  EMAIL_FROM_ADDRESS: z.string().default(''),
  EMAIL_FROM_NAME: z.string().default('SkillProof'),
  CLOUDINARY_CLOUD_NAME: z.string().default(''),
  CLOUDINARY_API_KEY: z.string().default(''),
  CLOUDINARY_API_SECRET: z.string().default(''),
  GITHUB_TOKEN: z.string().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  process.exit(1);
}

export const config = parsed.data;
if (config.NODE_ENV === 'production' && !config.GROQ_API_KEY) {
  console.error('GROQ_API_KEY is required in production');
  process.exit(1);
}

// On Vercel the production and deployment URLs are allowed automatically.
const vercelOrigins = [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]
  .filter(Boolean).map((host) => `https://${host}`);
const explicit = process.env.APP_ORIGIN ? config.APP_ORIGIN.split(',') : [];
export const origins = [...new Set([...explicit, ...vercelOrigins, ...(explicit.length || vercelOrigins.length ? [] : [config.APP_ORIGIN])]
  .map((o) => o.trim().replace(/\/$/, '')).filter(Boolean))];
export const appUrl = origins[0];
export const trustProxy = /^\d+$/.test(config.TRUST_PROXY) ? Number(config.TRUST_PROXY) : config.TRUST_PROXY;
export const isProd = config.NODE_ENV === 'production';
