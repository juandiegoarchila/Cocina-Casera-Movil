//src/components/PaymentSelector.js
import React from 'react';
import { ReactComponent as NequiLogo } from '../assets/nequi-logo.svg';
import { ReactComponent as DaviplataLogo } from '../assets/daviplata-logo.svg';
import EfectivoPNG from '../assets/efectivo.png';

/**
 * Componente controlado:
 * - selectedPayment: { id: 'cash' | 'daviplata' | 'nequi', name: 'Efectivo' | 'Daviplata' | 'Nequi' }
 * - onChange: (methodObj) => void
 * (mantengo soporte a setSelectedPayment por compatibilidad)
 */
const PaymentSelector = ({ paymentMethods, selectedPayment, onChange, setSelectedPayment }) => {
  const getColorClass = (methodName) => {
    switch (methodName) {
      case 'Efectivo':
        return 'bg-green-200 text-green-800 border-green-300';
      case 'Daviplata':
        return 'bg-red-200 text-red-800 border-red-300';
      case 'Nequi':
        return 'bg-blue-200 text-blue-800 border-blue-300';
      default:
        return 'bg-gray-200 text-gray-800 border-gray-300';
    }
  };

  const handleSelect = (method) => {
    if (typeof onChange === 'function') onChange(method);
    if (typeof setSelectedPayment === 'function') setSelectedPayment(method); // compat
  };

  return (
    <div className="bg-gradient-to-r from-green-50 to-green-100 p-1 sm:p-2 rounded-lg shadow-sm">
      <h2 className="text-xs sm:text-sm font-semibold mb-1 sm:mb-2 flex items-center text-green-700">
        <span className="mr-1">💰</span> ¿Cómo vas a pagar?
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-2">
        {paymentMethods.map((method) => {
          const isActive = selectedPayment?.id === method.id;
          return (
            <button
              key={method.id}
              type="button"
              onClick={() => handleSelect(method)}
              className={`payment-btn p-1 sm:p-2 rounded text-xs sm:text-sm font-medium transition-all duration-200
                          flex flex-col items-center justify-center text-center min-h-[30px] sm:min-h-[40px]
                          shadow-sm gap-y-1 ${isActive ? getColorClass(method.name) : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'}`}
              aria-label={`Seleccionar ${method.name}`}
            >
              <span>{method.name}</span>

              {method.name === 'Efectivo' &&               <img src={EfectivoPNG} alt="Efectivo" className="h-20 w-20" />
}
              {method.name === 'Daviplata' && <DaviplataLogo className="h-20 w-20" />}
              {method.name === 'Nequi' && <NequiLogo className="h-20 w-20" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default PaymentSelector;
