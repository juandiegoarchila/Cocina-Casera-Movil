// src/components/Footer.js
import React from 'react';

const Footer = () => {
  return (
    <footer className="bg-green-500 text-white p-4 text-center mt-auto shadow-inner">
      <div className="container mx-auto">
        <p className="text-xs xs:text-sm sm:text-base">
          © {new Date().getFullYear()} Cocina Casera. Todos los derechos reservados.
        </p>
        <p className="text-[10px] xs:text-xs sm:text-sm mt-1">
          Diseñado con <span role="img" aria-label="corazón">❤️</span> por Cocina Casera
        </p>
      </div>
    </footer>
  );
};

export default Footer;
