-- SkillProof schema v1

CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text NOT NULL,
  password_hash     text NOT NULL,
  name              text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  role              text NOT NULL CHECK (role IN ('student', 'faculty', 'recruiter', 'admin')),
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended')),
  organization      text,
  email_verified_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));
CREATE INDEX users_role_status_idx ON users (role, status);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE email_tokens (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose    text NOT NULL CHECK (purpose IN ('verify', 'reset')),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);
CREATE INDEX email_tokens_user_idx ON email_tokens (user_id);

CREATE TABLE profiles (
  user_id           uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  headline          text NOT NULL DEFAULT '',
  bio               text NOT NULL DEFAULT '',
  education         jsonb NOT NULL DEFAULT '[]',
  interests         text[] NOT NULL DEFAULT '{}',
  avatar_url        text,
  public_slug       text NOT NULL UNIQUE,
  is_public         boolean NOT NULL DEFAULT false,
  recruiter_visible boolean NOT NULL DEFAULT false,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE skills (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  self_level text NOT NULL CHECK (self_level IN ('beginner', 'intermediate', 'advanced')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX skills_user_name_key ON skills (user_id, lower(name));

CREATE TABLE projects (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title             text NOT NULL,
  description       text NOT NULL DEFAULT '',
  repo_url          text,
  live_url          text,
  tags              text[] NOT NULL DEFAULT '{}',
  github_meta       jsonb,
  github_fetched_at timestamptz,
  ai_summary        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_user_idx ON projects (user_id, created_at DESC);

CREATE TABLE certificates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title      text NOT NULL,
  issuer     text NOT NULL DEFAULT '',
  file_url   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX certificates_user_idx ON certificates (user_id);

CREATE TABLE assessments (
  id            uuid PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  skill         text NOT NULL,
  self_level    text NOT NULL CHECK (self_level IN ('beginner', 'intermediate', 'advanced')),
  topics        text NOT NULL DEFAULT '',
  job_context   text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'graded', 'expired')),
  questions     jsonb NOT NULL,
  responses     jsonb,
  results       jsonb,
  max_score     real NOT NULL,
  score         real,
  percent       real,
  level_awarded text CHECK (level_awarded IN ('not_demonstrated', 'beginner', 'intermediate', 'advanced')),
  tab_switches  integer NOT NULL DEFAULT 0,
  paste_events  integer NOT NULL DEFAULT 0,
  flagged       boolean NOT NULL DEFAULT false,
  started_at    timestamptz NOT NULL DEFAULT now(),
  deadline_at   timestamptz NOT NULL,
  submitted_at  timestamptz,
  graded_at     timestamptz
);
CREATE INDEX assessments_user_idx ON assessments (user_id, started_at DESC);
CREATE INDEX assessments_graded_skill_idx ON assessments (lower(skill)) WHERE status = 'graded';
-- One running attempt per student, enforced by the database.
CREATE UNIQUE INDEX assessments_one_active ON assessments (user_id) WHERE status = 'in_progress';

CREATE TABLE classes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name       text NOT NULL,
  join_code  text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX classes_faculty_idx ON classes (faculty_id);

CREATE TABLE class_members (
  class_id   uuid NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, student_id)
);
CREATE INDEX class_members_student_idx ON class_members (student_id);

CREATE TABLE endorsements (
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  faculty_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  note       text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, faculty_id)
);

CREATE TABLE shortlists (
  recruiter_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  student_id   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  note         text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recruiter_id, student_id)
);
CREATE INDEX shortlists_student_idx ON shortlists (student_id);

CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind       text NOT NULL,
  message    text NOT NULL,
  link       text,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

CREATE TABLE ai_usage (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day     date NOT NULL,
  kind    text NOT NULL CHECK (kind IN ('assessment', 'feedback')),
  count   integer NOT NULL DEFAULT 0,
  tokens  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, kind)
);

CREATE TABLE audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    uuid REFERENCES users (id) ON DELETE SET NULL,
  action      text NOT NULL,
  target_type text,
  target_id   text,
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_idx ON audit_log (created_at DESC);

CREATE TABLE error_events (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id text,
  user_id    uuid,
  method     text,
  path       text,
  message    text,
  stack      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX error_events_created_idx ON error_events (created_at DESC);
