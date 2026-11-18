// Vercel serverless entry: the whole Express API runs as one function.
import { createApp } from '../server/src/app.js';

export default createApp();
