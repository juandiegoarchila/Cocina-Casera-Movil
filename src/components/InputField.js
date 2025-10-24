// src/components/InputField.js
import React from 'react';

const InputField = ({ id, label, value, onChange, placeholder, icon, type = 'text', autoComplete, ariaRequired = false, error = '' }) => (
  <div className="mb-4">
    <label htmlFor={id} className="block font-medium text-gray-800 mb-1">
      <span role="img" aria-label="icon">{icon}</span> {label}
    </label>
    <input
      id={id}
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`w-full p-2 border rounded-md focus:outline-none focus:ring-2 ${error ? 'border-red-500 focus:ring-red-500' : 'focus:ring-green-500'}`}
      autoComplete={autoComplete}
      aria-required={ariaRequired}
    />
    {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
  </div>
);

export default InputField;