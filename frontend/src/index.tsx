import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
    <App />
);

// TODO: Implement error boundary for better error handling in production
// TODO: Set up service workers for offline capabilities and performance improvements