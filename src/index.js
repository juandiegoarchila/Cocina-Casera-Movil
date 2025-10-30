// src/index.js
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles.css';
import App from './App';
import { AuthProvider } from './components/Auth/AuthProvider';
import { AutoPrintProvider } from './context/AutoPrintContext';

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AutoPrintProvider>
          <App />
        </AutoPrintProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);