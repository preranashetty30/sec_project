import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App.jsx';
import { AuthProvider } from './auth.jsx';
import { ErrorBoundary, ToastProvider } from './ui.jsx';
import { storage } from './hooks.js';
import './styles/tokens.css';
import './styles/app.css';

// Light by default (owner's choice); dark only when the user picks it.
document.documentElement.dataset.theme = storage.get('theme') === 'dark' ? 'dark' : 'light';
if (import.meta.env.VITE_SEASON) document.documentElement.dataset.season = import.meta.env.VITE_SEASON;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
