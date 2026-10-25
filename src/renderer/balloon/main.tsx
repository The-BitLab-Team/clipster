import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import './balloon.css';
import { installErrorReporting } from '../lib/errorReporting';
import { BalloonApp } from './BalloonApp';

installErrorReporting('balloon');

const container = document.getElementById('root');
if (container === null) throw new Error('Elemento #root não encontrado.');

createRoot(container).render(
  <StrictMode>
    <BalloonApp />
  </StrictMode>
);
