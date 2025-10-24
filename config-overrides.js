const { override, addWebpackPlugin } = require('customize-cra');

// Plugin personalizado para suprimir errores de ResizeObserver
class SuppressResizeObserverPlugin {
  apply(compiler) {
    compiler.hooks.done.tap('SuppressResizeObserverPlugin', (stats) => {
      if (stats.compilation.errors) {
        stats.compilation.errors = stats.compilation.errors.filter(error => {
          return !error.message.includes('ResizeObserver loop completed');
        });
      }
    });
  }
}

module.exports = override(
  addWebpackPlugin(new SuppressResizeObserverPlugin())
);
