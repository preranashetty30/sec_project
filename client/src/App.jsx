import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { useAuth } from './auth.jsx';
import Layout from './Layout.jsx';
import { ErrorState, Skeleton } from './ui.jsx';

const page = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] })));
const auth = () => import('./pages/Auth.jsx');
const assess = () => import('./pages/Assessments.jsx');
const classes = () => import('./pages/Classes.jsx');
const talent = () => import('./pages/Talent.jsx');
const account = () => import('./pages/Account.jsx');

const Landing = page(() => import('./pages/Landing.jsx'), 'Landing');
const NotFound = page(() => import('./pages/Landing.jsx'), 'NotFound');
const Login = page(auth, 'Login');
const Register = page(auth, 'Register');
const ForgotPassword = page(auth, 'ForgotPassword');
const ResetPassword = page(auth, 'ResetPassword');
const PublicReport = page(() => import('./pages/Report.jsx'), 'PublicReport');
const Dashboard = page(() => import('./pages/Dashboard.jsx'), 'Dashboard');
const Profile = page(() => import('./pages/Profile.jsx'), 'Profile');
const Evidence = page(() => import('./pages/Evidence.jsx'), 'Evidence');
const Assessments = page(assess, 'Assessments');
const AssessmentTake = page(assess, 'AssessmentTake');
const AssessmentResult = page(assess, 'AssessmentResult');
const Coach = page(() => import('./pages/Coach.jsx'), 'Coach');
const Classes = page(classes, 'Classes');
const ClassDetail = page(classes, 'ClassDetail');
const ClassStudent = page(classes, 'ClassStudent');
const Talent = page(talent, 'Talent');
const TalentStudent = page(talent, 'TalentStudent');
const Shortlist = page(talent, 'Shortlist');
const Admin = page(() => import('./pages/Admin.jsx'), 'Admin');
const Notifications = page(account, 'Notifications');
const Settings = page(account, 'Settings');

function RequireRole({ roles, children }) {
  const { user } = useAuth();
  if (roles && !roles.includes(user.role)) {
    return <div className="card empty"><h1>No access</h1><p className="muted">This page isn't available for your account type.</p></div>;
  }
  return children;
}

function Protected() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <Layout />;
}

const S = ['student'];
export default function App() {
  const { status, error, refresh } = useAuth();
  if (status === 'loading') return <div className="main"><Skeleton rows={4} /></div>;
  if (status === 'error') return <div className="main"><ErrorState error={error} onRetry={refresh} /></div>;
  return (
    <Suspense fallback={<div className="main"><Skeleton rows={4} /></div>}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/p/:slug" element={<PublicReport />} />
        <Route element={<Protected />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/profile" element={<RequireRole roles={S}><Profile /></RequireRole>} />
          <Route path="/evidence" element={<RequireRole roles={S}><Evidence /></RequireRole>} />
          <Route path="/assessments" element={<RequireRole roles={S}><Assessments /></RequireRole>} />
          <Route path="/assessments/:id/take" element={<RequireRole roles={S}><AssessmentTake /></RequireRole>} />
          <Route path="/assessments/:id" element={<RequireRole roles={S}><AssessmentResult /></RequireRole>} />
          <Route path="/coach" element={<RequireRole roles={S}><Coach /></RequireRole>} />
          <Route path="/classes" element={<RequireRole roles={['student', 'faculty']}><Classes /></RequireRole>} />
          <Route path="/classes/:id" element={<RequireRole roles={['faculty']}><ClassDetail /></RequireRole>} />
          <Route path="/classes/:id/students/:studentId" element={<RequireRole roles={['faculty']}><ClassStudent /></RequireRole>} />
          <Route path="/talent" element={<RequireRole roles={['recruiter']}><Talent /></RequireRole>} />
          <Route path="/talent/:id" element={<RequireRole roles={['recruiter']}><TalentStudent /></RequireRole>} />
          <Route path="/shortlist" element={<RequireRole roles={['recruiter']}><Shortlist /></RequireRole>} />
          <Route path="/admin" element={<RequireRole roles={['admin']}><Admin /></RequireRole>} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
