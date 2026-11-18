import { config } from '../config.js';
import { log, errInfo } from '../log.js';
import { external, unavailable } from '../errors.js';

// Circuit breaker: 5 consecutive failed calls -> fail fast for 30 s, then allow one trial call.
let failures = 0;
let openUntil = 0;
export const breakerState = () => (Date.now() < openUntil ? 'open' : failures >= 5 ? 'half_open' : 'closed');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(body, signal) {
  if (!config.GROQ_API_KEY) throw unavailable('AI is not configured on this server (GROQ_API_KEY is missing).');
  if (Date.now() < openUntil) throw external();

  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(1000 * 2 ** (attempt - 1) + Math.random() * 500);
    try {
      const timeout = AbortSignal.timeout(60_000);
      const res = await fetch(`${config.GROQ_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${config.GROQ_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: config.GROQ_MODEL, ...body }),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (res.ok) {
        failures = 0;
        return res;
      }
      lastError = new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
      if (res.status !== 429 && res.status < 500) break; // bad request / bad key: retrying won't help
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = e;
    }
  }
  failures++;
  if (failures >= 5) openUntil = Date.now() + 30_000;
  log.error('groq call failed', { failures, err: errInfo(lastError) });
  throw external();
}

// Returns { json, tokens }. Throws SyntaxError if the model returned invalid JSON.
export async function chatJSON(messages, { temperature = 0.4, maxTokens = 3000 } = {}) {
  const res = await post({ messages, temperature, max_tokens: maxTokens, response_format: { type: 'json_object' } });
  const data = await res.json();
  return { json: JSON.parse(data.choices?.[0]?.message?.content ?? ''), tokens: data.usage?.total_tokens ?? 0 };
}

export async function chatStream(messages, { signal, onToken }) {
  const res = await post({ messages, temperature: 0.5, max_tokens: 1200, stream: true }, signal);
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      const token = JSON.parse(data).choices?.[0]?.delta?.content;
      if (token) onToken(token);
    }
  }
}
