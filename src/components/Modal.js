//src/components/Modal.js
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion'; 

const Modal = ({ isOpen, onClose, children }) => {
  // Bloquea el scroll del body mientras el modal esté abierto
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const modalContent = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      // z-index muy alto para dominar cualquier contexto de apilamiento accidental
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999] p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ scale: 0.98, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.98, y: 10 }}
        className="bg-white rounded-lg shadow-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-2xl font-bold"
          aria-label="Cerrar modal"
        >
          ×
        </button>
        {children}
      </motion.div>
    </motion.div>
  );

  // Renderizar en document.body para evitar quedar atrapado en stacking contexts del árbol
  return createPortal(modalContent, document.body);
};

export default Modal;