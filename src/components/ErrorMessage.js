//src/components/ErrorMessage.js
import React from 'react';

const ErrorMessage = ({ message, onClose }) => (
  <div role="alert" className="rounded-md bg-red-50 p-3 mb-2 shadow-lg max-w-sm">
    <div className="flex items-start justify-between">
      <div className="flex">
        <div className="flex-shrink-0">
          <svg className="h-4 w-4 text-red-400 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-2">
          <h3 className="text-xs font-medium text-red-800">Error</h3>
          <p className="mt-1 text-xs text-red-700">{message}</p>
        </div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="ml-3 text-red-600 hover:text-red-800"
          aria-label="Cerrar mensaje"
        >
          <svg className="w-4 h-4 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 11.414l4.293-4.293a1 1 0 111.414 1.414L11.414 12l4.293 4.293a1 1 0 01-1.414 1.414L10 13.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 12 4.293 7.707a1 1 0 011.414-1.414L10 10.586z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}
    </div>
  </div>
);

export default ErrorMessage;
