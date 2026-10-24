import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import './settings.css';
import { installErrorReporting } from '../lib/errorReporting';
import { SettingsApp } from './SettingsApp';

installErrorReporting('settings');

const container = document.getElementById('root');
if (container === null) throw new Error('Elemento #root não encontrado.');

createRoot(container).render(
  <StrictMode>
    <SettingsApp />
  </StrictMode>
);
