export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || 'Something went wrong. Please try again.');
    this.status = status;
    this.code = body?.error?.code;
    this.fields = body?.error?.fields ?? {};
    this.details = body?.error?.details;
    this.requestId = body?.error?.requestId;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

const OFFLINE = { error: { message: "Can't reach SkillProof. Check your connection and try again." } };

export async function api(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      signal,
      credentials: 'same-origin',
      headers: {
        ...(body !== undefined && { 'content-type': 'application/json' }),
        ...(method !== 'GET' && { 'x-skillproof': '1' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, OFFLINE);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized();
    throw new ApiError(res.status, data);
  }
  return data;
}

// Signed direct upload to Cloudinary; returns the file URL. The server re-checks ownership on save.
export async function uploadFile(kind, file) {
  if (file.size > 5 * 1024 * 1024) throw new ApiError(400, { error: { message: 'Files must be 5 MB or smaller' } });
  const sig = await api('/uploads/sign', { method: 'POST', body: { kind } });
  const form = new FormData();
  form.append('file', file);
  for (const k of ['api_key', 'timestamp', 'signature', 'folder', 'allowed_formats']) form.append(k, sig[k]);
  const res = await fetch(sig.upload_url, { method: 'POST', body: form }).catch(() => null);
  const data = await res?.json().catch(() => null);
  if (!res?.ok) throw new ApiError(400, { error: { message: data?.error?.message ?? 'Upload failed. Use a PDF, JPG, PNG or WebP file.' } });
  return data.secure_url;
}

// Reads the coach's Server-Sent Events stream; calls onToken for each piece of text.
export async function streamSse(path, { signal, onToken }) {
  let res;
  try {
    res = await fetch(`/api/v1${path}`, { signal, credentials: 'same-origin' });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, OFFLINE);
  }
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = frame.match(/^event: (.*)$/m)?.[1];
      const data = JSON.parse(frame.match(/^data: (.*)$/m)?.[1] ?? '{}');
      if (event === 'token') onToken(data.t);
      if (event === 'error') throw new ApiError(502, { error: { message: data.message } });
      if (event === 'done') return;
    }
  }
}
