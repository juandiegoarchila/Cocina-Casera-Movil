//src/components/Badge.js
import React from 'react';

const Badge = ({ children, color = 'primary', className = '' }) => (
  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-${color}-100 text-${color}-800 ${className}`}>
    {children}
  </span>
);

export default React.memo(Badge);