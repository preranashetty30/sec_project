import { Link } from 'react-router';
import { Award, ClipboardCheck, FolderGit2, GraduationCap, Search, Share2, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { Brand, ThemeToggle } from '../Layout.jsx';
import { useTitle } from '../hooks.js';

const STEPS = [
  [1, 'Create your profile', 'Add education, interests and the skills you want to prove.'],
  [2, 'Show your work', 'Link GitHub projects. We pull real repository data and summarise what they demonstrate.'],
  [3, 'Take an assessment', 'AI writes a fresh 20-minute test for your skill, level and focus topics, then grades it.'],
  [4, 'Share your report', 'One link with demonstrated levels, evidence and faculty endorsements.'],
];

const FEATURES = [
  [ClipboardCheck, 'Tailored assessments', 'Multiple choice, short answers and a code review task, written for you on the spot.'],
  [ShieldCheck, 'Integrity you can see', 'Timed on the server. Tab switches and pastes are counted and shown on your report.'],
  [FolderGit2, 'Evidence, not claims', 'Stars, languages and recent activity straight from GitHub.'],
  [GraduationCap, 'Faculty endorsements', 'Teachers see their class and vouch for strong projects.'],
  [Search, 'Recruiter discovery', 'Opt in, and recruiters find you by demonstrated level.'],
  [Sparkles, 'AI coach', 'A personal plan built from your results.'],
];

export function Landing() {
  const { user } = useAuth();
  useTitle('');
  return (
    <>
      <header className="public-header">
        <Brand />
        <div className="row">
          <ThemeToggle />
          {user ? <Link className="btn btn-primary" to="/dashboard">Open dashboard</Link> : (
            <>
              <Link className="btn btn-ghost" to="/login">Log in</Link>
              <Link className="btn btn-primary" to="/register">Get started</Link>
            </>
          )}
        </div>
      </header>
      <main id="main">
        <section className="hero">
          <span className="badge lvl-intermediate"><Award size={14} aria-hidden /> Skills + Projects + Assessments = Evidence</span>
          <h1>Demonstrate skills. Build credibility.</h1>
          <p>Every resume says "Python". SkillProof shows what you can actually do, with AI-written assessments, real project evidence and one link to share.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link className="btn btn-primary" to="/register">Create a free account</Link>
            <Link className="btn btn-secondary" to="/login">I already have an account</Link>
          </div>
        </section>
        <section className="section" aria-labelledby="how">
          <h2 id="how" style={{ marginBottom: 'var(--space-5)' }}>How it works</h2>
          <div className="grid grid-2">
            {STEPS.map(([n, title, text]) => (
              <div key={n} className="card row" style={{ alignItems: 'flex-start' }}>
                <span className="step-num" aria-hidden>{n}</span>
                <div className="grow stack-sm"><h3>{title}</h3><p className="muted">{text}</p></div>
              </div>
            ))}
          </div>
        </section>
        <section className="section" aria-labelledby="features">
          <h2 id="features" style={{ marginBottom: 'var(--space-5)' }}>Built for students, faculty and recruiters</h2>
          <div className="grid grid-3">
            {FEATURES.map(([Icon, title, text]) => (
              <div key={title} className="card stack-sm">
                <Icon size={24} color="var(--color-primary)" aria-hidden />
                <h3>{title}</h3>
                <p className="muted">{text}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="section" style={{ textAlign: 'center' }}>
          <div className="card stack" style={{ alignItems: 'center' }}>
            <Share2 size={28} color="var(--color-accent)" aria-hidden />
            <h2>Turn "I know it" into proof</h2>
            <Link className="btn btn-accent" to="/register">Start now</Link>
          </div>
        </section>
      </main>
    </>
  );
}

export function NotFound() {
  useTitle('Page not found');
  return (
    <div className="auth-wrap">
      <div className="card empty auth-card">
        <h1>Page not found</h1>
        <p className="muted">The page you're looking for doesn't exist or was moved.</p>
        <Link className="btn btn-primary" to="/">Go home</Link>
      </div>
    </div>
  );
}
