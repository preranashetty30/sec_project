import { config } from '../config.js';

export const REPO_RE = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/;

const headers = (accept = 'application/vnd.github+json') => ({
  accept,
  'user-agent': 'skillproof-app',
  'x-github-api-version': '2022-11-28',
  ...(config.GITHUB_TOKEN && { authorization: `Bearer ${config.GITHUB_TOKEN}` }),
});

const repoPath = (url) => {
  const m = url.match(REPO_RE);
  return `https://api.github.com/repos/${m[1]}/${m[2]}`;
};

export async function fetchRepoMeta(url) {
  try {
    const res = await fetch(repoPath(url), { headers: headers(), signal: AbortSignal.timeout(8000) });
    if (res.status === 404) return { error: 'Repository not found or private' };
    if (!res.ok) return { error: `GitHub is unavailable right now (${res.status})` };
    const d = await res.json();
    const langs = await fetch(d.languages_url, { headers: headers(), signal: AbortSignal.timeout(8000) })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
    return {
      full_name: d.full_name,
      description: d.description,
      html_url: d.html_url,
      stars: d.stargazers_count,
      forks: d.forks_count,
      languages: Object.keys(langs).slice(0, 6),
      topics: (d.topics ?? []).slice(0, 8),
      pushed_at: d.pushed_at,
    };
  } catch {
    return { error: 'Could not reach GitHub' };
  }
}

export async function fetchReadme(url) {
  try {
    const res = await fetch(`${repoPath(url)}/readme`, {
      headers: headers('application/vnd.github.raw+json'),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok ? (await res.text()).slice(0, 6000) : '';
  } catch {
    return '';
  }
}
