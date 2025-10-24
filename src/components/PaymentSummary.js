// src/components/PaymentSummary.js
import React from 'react';

const PaymentSummary = ({ 
  paymentSummary, 
  total, 
  isWaiterView,
  titleClass = 'text-gray-800',
  contentClass = 'text-gray-600'
}) => {
  const allCashOrUnspecified = Object.keys(paymentSummary).every(method => method === 'Efectivo' || method === 'No especificado');

  return (
    <div className="pt-2 border-t">
      <p className={`text-sm sm:text-base font-bold text-right ${titleClass}`}>
        Total: <span className={titleClass || "text-green-600"}>${total.toLocaleString('es-CO')}</span>
      </p>
      {!isWaiterView && (
        <>
          {allCashOrUnspecified ? (
            <>
              <p className={`font-medium ${titleClass} text-xs sm:text-sm`}>Paga en efectivo al momento de la entrega.</p>
              <p className={`text-xs sm:text-sm ${contentClass}`}>💵 Efectivo: ${total.toLocaleString('es-CO')}</p>
              <p className={`text-xs sm:text-sm ${contentClass}`}>Si no tienes efectivo,  puedes transferir.</p>
              <div className="mt-1">
                <p className={`text-xs sm:text-sm ${contentClass}`}>Bancolombia (Ahorros – Nequi a Bancolombia): 📲 54706725531</p>
                <p className={`text-xs sm:text-sm ${contentClass}`}>Daviplata: 📲 313 850 5647</p>
              </div>
            </>
          ) : (
            <>
              <p className={`font-medium ${titleClass} text-xs sm:text-sm`}>💳 Formas de pago:</p>
              <div className={`text-xs sm:text-sm ${contentClass} space-y-0.5`}>
                <p>Bancolombia (Ahorros – Nequi a Bancolombia): 📲 54706725531</p>
                <p>Daviplata: 📲 313 850 5647</p>
                {Object.entries(paymentSummary).map(([method, amount]) => (
                  method !== 'No especificado' && amount > 0 && method !== 'Efectivo' && (
                    <p key={method}>🔹 {method}: ${amount.toLocaleString('es-CO')}</p>
                  )
                ))}
                {paymentSummary['Efectivo'] > 0 && (
                  <p>🔹 Efectivo: ${paymentSummary['Efectivo'].toLocaleString('es-CO')}</p>
                )}
              </div>
            </>
          )}
          <p className={`font-medium ${titleClass} text-xs sm:text-sm`}>💰 Total: ${total.toLocaleString('es-CO')}</p>
        </>
      )}
    </div>
  );
};

export default PaymentSummary;
