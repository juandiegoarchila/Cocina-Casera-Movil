//src/components/InfoMessage.js
import React from 'react';

const InfoMessage = ({ message, onClose }) => (
  <div role="status" className="rounded-md bg-yellow-50 p-3 mb-2 shadow-lg max-w-sm border border-yellow-200">
    <div className="flex items-start justify-between">
      <div className="flex">
        <div className="flex-shrink-0">
          <svg className="h-4 w-4 text-yellow-500 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l6.518 11.59c.75 1.335-.213 3.011-1.742 3.011H3.48c-1.53 0-2.492-1.676-1.743-3.01L8.257 3.1zM11 14a1 1 0 10-2 0 1 1 0 002 0zm-1-2a1 1 0 01-1-1V8a1 1 0 112 0v3a1 1 0 01-1 1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-2">
          <h3 className="text-xs font-medium text-yellow-800">Aviso</h3>
          <p className="mt-1 text-xs text-yellow-700 whitespace-pre-line">{message}</p>
        </div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
            className="ml-3 text-yellow-600 hover:text-yellow-800"
          aria-label="Cerrar mensaje"
        >
          <svg className="w-4 h-4 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 11.414l4.293-4.293a1 1 0 111.414 1.414L11.414 12l4.293 4.293a1 1 0 01-1.414 1.414L10 13.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 12 4.293 7.707a1 1 0 011.414-1.414L10 10.586z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  </div>
);

export default InfoMessage;
