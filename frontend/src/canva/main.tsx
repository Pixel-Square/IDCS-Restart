import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppUiProvider } from '@canva/app-ui-kit';
import App from './App';
import '@canva/app-ui-kit/styles.css';
import './styles.css';

// AppUiProvider is required by @canva/app-ui-kit — it sets up theming and
// accessibility foundations that all ui-kit components rely on.
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppUiProvider>
      <App />
    </AppUiProvider>
  </React.StrictMode>,
);
