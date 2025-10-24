// src/utils/payments.js
// Utilidades para normalizar métodos de pago y sumar exactamente por split o legado.

const norm = (s) => (s ?? '').toString().trim().toLowerCase();

export const normalizePaymentMethodKey = (methodLike) => {
  const raw =
    typeof methodLike === 'string'
      ? methodLike
      : methodLike?.name || methodLike?.label || methodLike?.title || methodLike?.method || methodLike?.type || methodLike?.payment || '';
  const t = norm(raw);
  if (t.includes('efect') || t.includes('cash')) return 'cash';
  if (t.includes('nequi')) return 'nequi';
  if (t.includes('davi')) return 'daviplata';
  return 'other';
};

const pickMethodLabel = (methodLike) => {
  if (typeof methodLike === 'string') return methodLike;
  return (
    methodLike?.name ||
    methodLike?.label ||
    methodLike?.title ||
    methodLike?.method ||
    methodLike?.type ||
    methodLike?.payment ||
    'Otro'
  );
};

/**
 * Extrae filas [{methodKey, amount, rawLabel}] desde una orden.
 * - Si existe order.payments (split), lo usa.
 * - Sino, detecta método legado y asigna 100% del total.
 * - Sino, cae en {other}.
 */
export const extractOrderPayments = (order) => {
  // Para pedidos de desayuno, calculamos correctamente el total
  const isBreakfast = order.type === 'breakfast' || Array.isArray(order?.breakfasts);
  const total = isBreakfast && typeof window !== 'undefined' && window.calculateCorrectBreakfastTotal
    ? Math.floor(window.calculateCorrectBreakfastTotal(order)) || 0
    : Math.floor(Number(order?.total || 0)) || 0;

  // Prefer `paymentLines` (newer canonical field) over `payments` if present
  const candidateLines = Array.isArray(order?.paymentLines) && order.paymentLines.length ? order.paymentLines : (Array.isArray(order?.payments) && order.payments.length ? order.payments : null);
  if (candidateLines && candidateLines.length) {
    // Si es un pedido de desayuno, ajustar los montos proporcionalmente al total correcto
    const linesSource = candidateLines;
    // Si es desayuno y la suma no coincide, ajustar proporcionalmente
    if (isBreakfast) {
      const originalTotal = linesSource.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      if (originalTotal > 0 && originalTotal !== total) {
        const ratio = total / originalTotal;
        return linesSource.map((p) => {
          const amount = Math.floor((Number(p?.amount || 0) * ratio)) || 0;
          return {
            methodKey: normalizePaymentMethodKey(p?.method),
            amount,
            rawLabel: pickMethodLabel(p?.method),
          };
        });
      }
    }

    return linesSource.map((p) => {
      const amount = Math.floor(Number(p?.amount || 0)) || 0;
      return {
        methodKey: normalizePaymentMethodKey(p?.method),
        amount,
        rawLabel: pickMethodLabel(p?.method),
      };
    });
  }

  const legacySources = [
    order?.meals?.[0]?.paymentMethod ?? order?.meals?.[0]?.payment,
    order?.breakfasts?.[0]?.payment ?? order?.breakfasts?.[0]?.paymentMethod,
    order?.paymentMethod ?? order?.payment,
  ].filter(Boolean);

  if (legacySources.length) {
    const label = pickMethodLabel(legacySources[0]);
    return [
      {
        methodKey: normalizePaymentMethodKey(legacySources[0]),
        amount: total,
        rawLabel: label,
      },
    ];
  }

  return [{ methodKey: 'other', amount: total, rawLabel: 'Otro' }];
};

/** Texto compacto: "Efectivo $6.000 + Nequi $6.000" */
export const summarizePayments = (paymentsRows = []) => {
  if (!Array.isArray(paymentsRows) || !paymentsRows.length) return 'Sin pago';
  const agg = paymentsRows.reduce((a, r) => {
    const key = r.methodKey || normalizePaymentMethodKey(r?.method);
    a[key] = (a[key] || 0) + (Math.floor(Number(r.amount || 0)) || 0);
    return a;
  }, {});
  const asText = [];
  if (agg.cash) asText.push(`Efectivo $${agg.cash.toLocaleString('es-CO')}`);
  if (agg.nequi) asText.push(`Nequi $${agg.nequi.toLocaleString('es-CO')}`);
  if (agg.daviplata) asText.push(`Daviplata $${agg.daviplata.toLocaleString('es-CO')}`);
  if (agg.other && !asText.length) asText.push(`Otro $${agg.other.toLocaleString('es-CO')}`);
  return asText.join(' + ') || 'Sin pago';
};

/**
 * Valor por defecto para el editor de split:
 * - Si hay split → se usa tal cual
 * - Si hay método legado → 100% al método
 * - Sino → 100% Efectivo
 */
export const defaultPaymentsForOrder = (order) => {
  const rows = extractOrderPayments(order);
  if (rows?.length) return rows.map(({ methodKey, amount }) => ({ method: methodKey, amount }));
  const total = Math.floor(Number(order?.total || 0)) || 0;
  return [{ method: 'cash', amount: total }];
};

/**
 * Totales simples por método (para tiles/chips rápidos).
 * Devuelve: { cash, nequi, daviplata, other, total }
 */
export const sumPaymentsByMethod = (orders = []) => {
  const out = { cash: 0, nequi: 0, daviplata: 0, other: 0, total: 0 };
  for (const order of orders) {
    const rows = extractOrderPayments(order);
    for (const r of rows) {
      const amt = Math.floor(Number(r.amount || 0)) || 0;
      out[r.methodKey] = (out[r.methodKey] || 0) + amt;
      out.total += amt;
    }
  }
  return out;
};

/** Helpers de clasificación por tipo/ubicación */
export const isBreakfastOrder = (order) =>
  order?.type === 'breakfast' || Array.isArray(order?.breakfasts);

export const isDeliveryOrder = (order) => {
  const tag =
    order?.orderType ||
    order?.meals?.[0]?.orderType ||
    order?.breakfasts?.[0]?.orderType ||
    '';
  const collection = (order?.__collection || '').toLowerCase();
  const c = norm(tag);
  if (collection.includes('delivery')) return true;
  if (c.includes('delivery') || c.includes('domicil')) return true;
  return false;
};

export const isTableOrder = (order) => {
  const collection = (order?.__collection || '').toLowerCase();
  if (collection.includes('table')) return true;
  const tableNumber =
    order?.meals?.[0]?.tableNumber ?? order?.breakfasts?.[0]?.tableNumber;
  return !!tableNumber;
};

/** Consideramos "salón" lo hecho por mesero: mesa o llevar desde mesa/breakfast table/takeaway */
export const isSalonOrder = (order) => {
  const collection = (order?.__collection || '').toLowerCase();
  // Cualquier cosa que provenga de colecciones de mesa pertenece a salón
  if (collection.includes('table')) return true;

  // Para desayunos creados como mesa o para llevar por mesero, también cuenta como salón
  const t = norm(order?.orderType || order?.breakfasts?.[0]?.orderType || '');
  if (Array.isArray(order?.breakfasts) && (t.includes('table') || t.includes('takeaway') || t.includes('para llevar') || t.includes('llevar'))) {
    return true;
  }

  return false;
};


/** Marcas típicas para saber si el domiciliario ya liquidó el efectivo */
export const isCashSettled = (order) => {
  if (order?.settlement?.status && norm(order.settlement.status) === 'liquidated') return true;
  if (order?.liquidated === true) return true;
  if (order?.cashSettled === true) return true;
  if (order?.settledAt) return true;
  return false;
};

/** Totales por método con semántica de caja */
export const calcMethodTotalsAll = (orders = [], tableOrders = [], breakfastOrders = []) => {
  const acc = {
    nequiTotal: 0,
    daviplataTotal: 0,
    nequiPendiente: 0,
    daviplatasPendiente: 0,
    cashSalon: 0,
    cashClientesSettled: 0,
    cashClientesPendiente: 0,
    totalLiquidado: 0,
    totalPendiente: 0,
    totalDomicilios: 0,
    totalSalon: 0
  };

  const accumulate = (list = []) => {
    for (const o of list) {
      const rows = extractOrderPayments(o);
      const isSalon = isSalonOrder(o);
      
      // Para cada método de pago en la orden
      for (const r of rows) {
        const amt = Math.floor(Number(r?.amount || 0)) || 0;
        if (amt <= 0) continue;

        if (isSalon) {
          // Los pagos de salón siempre se suman al total
          acc.totalSalon += amt;
          if (r.methodKey === 'cash') acc.cashSalon += amt;
          else if (r.methodKey === 'nequi') acc.nequiTotal += amt;
          else if (r.methodKey === 'daviplata') acc.daviplataTotal += amt;
          acc.totalLiquidado += amt;
        } else {
          // Para domicilios
          acc.totalDomicilios += amt;
          
          // Depende del estado de liquidación
          if (r.methodKey === 'cash') {
            if (o?.settled || o?.paymentSettled?.cash) {
              acc.cashClientesSettled += amt;
              acc.totalLiquidado += amt;
            } else {
              acc.cashClientesPendiente += amt;
              acc.totalPendiente += amt;
            }
          }
          else if (r.methodKey === 'nequi') {
            if (o?.settled || o?.paymentSettled?.nequi) {
              acc.nequiTotal += amt;
              acc.totalLiquidado += amt;
            } else {
              acc.nequiPendiente += amt;
              acc.totalPendiente += amt;
            }
          }
          else if (r.methodKey === 'daviplata') {
            if (o?.settled || o?.paymentSettled?.daviplata) {
              acc.daviplataTotal += amt;
              acc.totalLiquidado += amt;
            } else {
              acc.daviplatasPendiente += amt;
              acc.totalPendiente += amt;
            }
          }
        }
      }
    }
  };

  accumulate(orders);
  accumulate(tableOrders);
  accumulate(breakfastOrders);

  acc.cashCaja = acc.cashSalon + acc.cashClientesSettled;
  
  return acc;
};
