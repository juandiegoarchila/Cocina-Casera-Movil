// src/utils/TotalsCalculatioexport const calculateGeneralTotals = (orders) => {
  const totals = {
    cash: 0,
    nequi: 0,
    daviplata: 0,
    other: 0
  };

  // Procesar solo órdenes que NO son domicilio
  orders.forEach(order => {
    if (isDeliveryOrder(order)) return; // Ignorar domicilios

    if (order.payments && Array.isArray(order.payments)) {
      order.payments.forEach(payment => {
        const methodKey = normalizePaymentMethodKey(payment.method);
        const amount = Number(payment.amount || 0);
        totals[methodKey] += amount;
      });
    } else {
      const methodKey = normalizePaymentMethodKey(order.payment || order.paymentMethod);
      const amount = Number(order.total || 0);
      totals[methodKey] += amount;
    }
  });lizePaymentMethodKey = (method) => {
  const raw = (typeof method === 'string' ? method : method?.name || '').toLowerCase().trim();
  if (raw.includes('efect') || raw.includes('cash')) return 'cash';
  if (raw.includes('nequi')) return 'nequi';
  if (raw.includes('davi')) return 'daviplata';
  return 'other';
};

// Función auxiliar para verificar si una orden es de domicilio
const isDeliveryOrder = (order) => {
  return order.isDelivery || 
         order.type?.includes('delivery') || 
         order.orderType?.includes('delivery') ||
         (order.address && Object.keys(order.address).length > 0);
};

// Función auxiliar para verificar si un pago está liquidado
const isPaymentSettled = (order, methodKey) => {
  if (methodKey === 'cash') {
    return order.settled === true;
  }
  if (methodKey === 'nequi' || methodKey === 'daviplata') {
    return order.paymentSettled?.[methodKey] === true;
  }
  return order.settled === true;
};

export const calculateGeneralTotals = (orders, deliveryOrders) => {
  const totals = {
    cash: 0,
    nequi: 0,
    daviplata: 0,
    other: 0
  };

  // Sumar SOLO órdenes de mesa/llevar (se suman automáticamente)
  orders.forEach(order => {
    // Verificar que sea una orden de mesa/llevar y no un domicilio
    if (order.type === 'dineIn' || order.type === 'takeaway') {
      const payment = order.payment || order.paymentMethod;
      const methodKey = normalizePaymentMethodKey(payment);
      const amount = Number(order.total || 0);
      totals[methodKey] += amount;
    }
  });

  // Los pedidos de domicilio se procesan por separado y no se incluyen en estos totales
  // Ya que se manejan en calculateDeliveryTotals

  return totals;
};

export const calculateDeliveryTotals = (orders) => {
  const totals = {
    cash: 0,
    nequi: 0,
    daviplata: 0,
    other: 0
  };

  let totalGeneral = 0;

  // Procesar todas las órdenes de domicilio
  (orders || []).forEach(order => {
    if (order.payments && Array.isArray(order.payments)) {
      // Nueva estructura con payments[]
      order.payments.forEach(payment => {
        const methodKey = normalizePaymentMethodKey(payment.method);
        const amount = Number(payment.amount || 0);
        
        // Verificar si el pago específico está liquidado
        const isSettled = methodKey === 'cash' ? 
          order.settled === true : 
          (methodKey === 'nequi' || methodKey === 'daviplata') ? 
            order.paymentSettled?.[methodKey] === true : 
            order.settled === true;

        // Solo sumar si NO está liquidado
        if (!isSettled) {
          totals[methodKey] += amount;
          totalGeneral += amount;
        }
      });
    } else {
      // Estructura antigua
      const methodKey = normalizePaymentMethodKey(order.payment || order.paymentMethod);
      const amount = Number(order.total || 0);
      
      if (!order.settled) {
        totals[methodKey] += amount;
        totalGeneral += amount;
      }
    }
  });

  totals.total = totalGeneral;

  return totals;
};

export const calculateDeliveryPersonTotals = (deliveryOrders, deliveryPerson) => {
  const totals = {
    lunch: { cash: 0, nequi: 0, daviplata: 0, other: 0, total: 0 },
    breakfast: { cash: 0, nequi: 0, daviplata: 0, other: 0, total: 0 },
    total: { cash: 0, nequi: 0, daviplata: 0, other: 0, total: 0 }
  };

  // Solo contar órdenes no liquidadas del domiciliario específico
  deliveryOrders
    .filter(order => !order.settled && order.deliveryPerson === deliveryPerson)
    .forEach(order => {
      const type = order.type === 'breakfast' ? 'breakfast' : 'lunch';
      const payments = order.payments || [];
      
      payments.forEach(payment => {
        const methodKey = normalizePaymentMethodKey(payment.method);
        const amount = Number(payment.amount || 0);
        
        totals[type][methodKey] += amount;
        totals[type].total += amount;
        totals.total[methodKey] += amount;
        totals.total.total += amount;
      });
    });

  return totals;
};
