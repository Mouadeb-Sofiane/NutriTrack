import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { AppProvider } from './state/app';
import { FeedbackProvider } from './ui/feedback';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <FeedbackProvider>
        <App />
      </FeedbackProvider>
    </AppProvider>
  </StrictMode>,
);
