// src/constants/dashboardConstants.js
export const ORDER_STATUS = {
  PENDING: 'pendiente',
  DELIVERED: 'entregado',
  CANCELLED: 'cancelado',
};

export const ORDER_STATUS_DISPLAY = {
  [ORDER_STATUS.PENDING]: 'Pendientes',
  [ORDER_STATUS.DELIVERED]: 'Entregados',
  [ORDER_STATUS.CANCELLED]: 'Cancelados',
};

export const BAR_COLORS = {
  Efectivo: '#22c55e',
  Daviplata: '#ef4444',
  Nequi: '#3b82f6',
  Domicilios: '#8B5CF6',
  Mesas: '#10B981'
};

export const PIE_COLORS = ['#fbbf24', '#4ade80', '#ef4444', '#60a5fa', '#a78bfa'];

export const INGRESOS_COLLECTION = 'Ingresos';
export const PEDIDOS_DIARIOS_GUARDADOS_COLLECTION = 'PedidosDiariosGuardados';