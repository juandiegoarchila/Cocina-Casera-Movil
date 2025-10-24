//src/components/CutlerySelector.js
import React from 'react';

const CutlerySelector = ({ cutlery, setCutlery }) => {
  return (
    <div className="bg-white p-4 rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-3 text-gray-800">
        🍴 ¿Necesitas cubiertos?
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setCutlery(true)}
          className={`
            p-3 rounded-lg text-base font-medium transition-all duration-200 ease-in-out
            focus:outline-none focus:ring-2 focus:ring-offset-2
            ${cutlery === true
              ? 'bg-green-500 text-white shadow-md focus:ring-green-500'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-300'}
            flex items-center justify-center text-center
          `}
          style={{ minHeight: '56px' }}
          aria-pressed={cutlery === true}
        >
          Sí, por favor
        </button>
        <button
          onClick={() => setCutlery(false)}
          className={`
            p-3 rounded-lg text-base font-medium transition-all duration-200 ease-in-out
            focus:outline-none focus:ring-2 focus:ring-offset-2
            ${cutlery === false
              ? 'bg-red-500 text-white shadow-md focus:ring-red-500'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-300'}
            flex items-center justify-center text-center
          `}
          style={{ minHeight: '56px' }}
          aria-pressed={cutlery === false}
        >
          No, gracias
        </button>
      </div>
    </div>
  );
};

export default CutlerySelector;