// Silenciar errores ruidosos de ResizeObserver sin usar inline scripts (para cumplir CSP)
(function() {
  const originalConsoleError = console.error;
  console.error = function(...args) {
    const message = args[0];
    if (typeof message === 'string' && message.includes('ResizeObserver loop completed')) {
      return; // Silenciar
    }
    return originalConsoleError.apply(console, args);
  };

  const originalWindowError = window.onerror;
  window.onerror = function(message, source, lineno, colno, error) {
    if (typeof message === 'string' && message.includes('ResizeObserver loop completed')) {
      return true;
    }
    if (originalWindowError) {
      return originalWindowError.call(this, message, source, lineno, colno, error);
    }
    return false;
  };

  window.addEventListener('error', function(event) {
    if (event.message && event.message.includes('ResizeObserver loop completed')) {
      event.stopImmediatePropagation();
      event.stopPropagation();
      event.preventDefault();
      return false;
    }
  }, true);

  window.addEventListener('unhandledrejection', function(event) {
    if (event.reason && event.reason.message && event.reason.message.includes('ResizeObserver')) {
      event.preventDefault();
      return false;
    }
  });
})();
