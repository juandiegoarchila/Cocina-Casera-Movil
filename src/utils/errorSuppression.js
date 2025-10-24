// src/utils/errorSuppression.js
// Utilidad para suprimir errores conocidos que no afectan la funcionalidad

export const suppressResizeObserverErrors = () => {
  // Método simple para suprimir solo los console.error
  const originalConsoleError = console.error;
  
  console.error = function(...args) {
    const message = args[0];
    
    // Filtrar solo errores específicos de ResizeObserver
    if (
      typeof message === 'string' && 
      message.includes('ResizeObserver loop completed with undelivered notifications')
    ) {
      // Silenciar completamente este error específico
      return;
    }
    
    // Permitir todos los demás errores
    originalConsoleError.apply(console, args);
  };
};

export const restoreConsoleError = () => {
  // Si necesitas restaurar el console.error original en algún momento
  const originalConsoleError = console.error;
  console.error = originalConsoleError;
};
