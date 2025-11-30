import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Register Service Worker for PWA functionality
// This is handled by vite-plugin-pwa automatically injecting the registration code in production
// But for dev/explicit control we can use 'virtual:pwa-register' if we imported it. 
// For this scope, we rely on vite-plugin-pwa's auto injection via config or standard service worker reg.
// Since we cannot import virtual modules in this text output easily, we assume the plugin handles it.

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
