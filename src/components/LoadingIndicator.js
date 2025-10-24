//src/components/LoadingIndicator.js
import React from 'react';

const LoadingIndicator = () => (
  <div className="flex justify-center p-2">
    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500"></div>
  </div>
);

export default LoadingIndicator;