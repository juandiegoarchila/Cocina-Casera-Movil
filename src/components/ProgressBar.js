//src/components/ProgressBar.js
import React from 'react';

const ProgressBar = ({ progress, className = '' }) => (
  <div className={`relative w-full bg-primary-100 rounded-full h-3 sm:h-4 shadow-sm ${className}`}>
    <div 
      className="bg-primary-500 h-3 sm:h-4 rounded-full transition-all duration-300 flex items-center justify-end pr-1 text-[8px] sm:text-[10px] font-medium text-white"
      style={{ width: `${Math.max(progress, 0)}%` }}
    >
      {`${Math.round(progress)}%`}
    </div>
  </div>
);

export default ProgressBar;