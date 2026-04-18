import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { BrowserRouter } from "react-router-dom";
import { SidebarProvider } from './components/layout/SidebarContext';
import "./index.css";
import "./styles/obe-theme.css";

// --- Chunk-load self-heal (production) ---
// If a user has a stale cached entry bundle that references a deleted chunk filename,
// dynamic imports can 404 (e.g., /assets/ClassTypeEditorPage-<hash>.js).
// Reloading once per session usually fixes it by fetching the latest index + bundles.
(function installChunkLoadRecovery() {
  const RELOAD_FLAG = 'acv2_chunk_reload_once';

  const reloadOnce = () => {
    try {
      if (sessionStorage.getItem(RELOAD_FLAG)) return;
      sessionStorage.setItem(RELOAD_FLAG, '1');
      window.location.reload();
    } catch {
      // If storage is unavailable, still attempt a reload once.
      window.location.reload();
    }
  };

  // Vite emits this event on preload failures (works in production builds too).
  window.addEventListener('vite:preloadError', () => reloadOnce());

  const isChunkLoadFailure = (msg: string) => {
    const m = (msg || '').toLowerCase();
    return (
      m.includes('failed to fetch dynamically imported module') ||
      m.includes('chunkloaderror') ||
      m.includes('loading chunk') ||
      m.includes('importing a module script failed')
    );
  };

  window.addEventListener('error', (e) => {
    const anyE = e as unknown as { message?: string };
    if (anyE?.message && isChunkLoadFailure(anyE.message)) reloadOnce();
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = (e as PromiseRejectionEvent).reason;
    const msg =
      typeof reason === 'string'
        ? reason
        : (reason && typeof reason.message === 'string' ? reason.message : '');
    if (msg && isChunkLoadFailure(msg)) reloadOnce();
  });
})();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <SidebarProvider>
        <App />
      </SidebarProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
