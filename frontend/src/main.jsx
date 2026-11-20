import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import { EffectsProvider } from './context/EffectsContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import './index.css';
import { registerServiceWorker } from './utils/pwa';

// Installable app + offline shell. Production only, so local dev never
// serves stale files from a cache.
if (import.meta.env.PROD) registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <EffectsProvider>
          <AuthProvider>
            <SocketProvider>
              <App />
            </SocketProvider>
          </AuthProvider>
        </EffectsProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
