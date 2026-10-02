import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import VisualPrototypeApp from './visual/VisualPrototypeApp';

createRoot(document.getElementById('root')!).render(<StrictMode><VisualPrototypeApp /></StrictMode>);
