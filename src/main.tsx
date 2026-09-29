import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import App from './App';
import { AuthProvider } from './lib/AuthContext';
import { I18nProvider } from './lib/I18nContext';
import { ToastProvider } from './lib/ToastContext';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

// A data router is required for navigation blocking (useBlocker); App keeps declaring its
// routes with <Routes>, rendered below this single splat route.
const router = createBrowserRouter([
  {
    path: '*',
    element: (
      <I18nProvider>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </I18nProvider>
    ),
  },
]);

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
