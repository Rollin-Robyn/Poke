import React from 'react';
import { createRoot } from 'react-dom/client';
import { GameProvider } from './ui/store';
import { App } from './ui/App';
import './ui/theme.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root missing');

createRoot(container).render(
  React.createElement(React.StrictMode, null, React.createElement(GameProvider, null, React.createElement(App))),
);
