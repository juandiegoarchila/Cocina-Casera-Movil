// Utilidades para el manejo de liquidación de pagos

/**
 * Verifica si un pago específico está liquidado
 */
export const isPaymentMethodSettled = (order, methodKey) => {
  if (!order) return false;
  
  // Para efectivo
  if (methodKey === 'cash') {
    return order.settled === true;
  }
  
  // Para pagos electrónicos (Nequi, Daviplata)
  if (methodKey === 'nequi' || methodKey === 'daviplata') {
    return order.paymentSettled?.[methodKey] === true;
  }
  
  // Para otros métodos
  return order.settled === true;
};

/**
 * Prepara el objeto de liquidación para actualizarlo en Firebase
 */
export const prepareSettlementUpdate = (order, methodsToSettle) => {
  const currentPaymentSettled = order.paymentSettled || {};
  const paymentSettled = {
    ...currentPaymentSettled
  };

  methodsToSettle.forEach(method => {
    if (method === 'cash') {
      paymentSettled.cash = true;
    } else if (method === 'nequi' || method === 'daviplata') {
      paymentSettled[method] = true;
    }
  });

  // Una orden está completamente liquidada si:
  // 1. Todos los pagos en efectivo están liquidados (orden.settled)
  // 2. Todos los pagos electrónicos están marcados como liquidados en paymentSettled
  const hasUnSettledPayments = order.payments?.some(payment => {
    const methodKey = normalizePaymentMethodKey(payment.method);
    return !isPaymentMethodSettled({ ...order, paymentSettled }, methodKey);
  });

  return {
    settled: !hasUnSettledPayments,
    settledAt: new Date().toISOString(),
    paymentSettled
  };
};

/**
 * Verifica si un método de pago específico debería incluirse en los totales
 */
export const shouldIncludeInTotals = (order, methodKey) => {
  return !isPaymentMethodSettled(order, methodKey);
};
