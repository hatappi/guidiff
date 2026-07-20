import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ThemeProvider } from './theme-context.tsx';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);
