// src/components/Admin/utilities/exportToCSV.js
export const exportToCSV = (orders, totals, deliveryPersons, setSuccess) => {
  const headers = [
    'ID Pedido', 'Nº Bandeja', 'Sopa', 'Principio', 'Proteína', 'Bebida', 'Cubiertos', 'Acompañamientos', 'Adiciones', 'Notas',
    'Hora de Entrega', 'Dirección', 'Tipo de Lugar', 'Nombre del Local', 'Nombre del Destinatario', 'Detalles de Unidad',
    'Teléfono', 'Pago (Bandeja)', 'Total (COP)', 'Pago (General)', 'Domiciliario', 'Estado', 'Fecha de Creación', 'Última Actualización'
  ];

  const orderRows = orders.flatMap(order => 
    order.meals.map((meal, index) => [
      order.id, index + 1, meal.soup?.name || meal.soup || 'Sin sopa',
      Array.isArray(meal.principle) ? meal.principle.map(p => p.name || p).join(', ') : meal.principle?.name || meal.principle || 'Sin principio',
      meal.protein?.name || meal.protein || 'Sin proteína', meal.drink?.name || meal.drink || 'Sin bebida',
      meal.cutlery?.name || meal.cutlery || 'No', meal.sides?.map(s => s.name || s).join(', ') || 'Ninguno',
      meal.additions?.map(a => `${a.name || ''}${a.protein || a.replacement ? ` (${a.protein || a.replacement})` : ''} (${a.quantity || 1})`).join(', ') || 'Ninguna',
      meal.notes || 'Ninguna', meal.time?.name || meal.time || 'No especificada', meal.address?.address || 'Sin dirección',
      meal.address?.addressType || 'No especificado', meal.address?.localName || '', meal.address?.recipientName || '',
      meal.address?.unitDetails || '', meal.address?.phoneNumber || 'No especificado',
      meal.payment?.name || meal.payment || 'Efectivo', `$${order.total?.toLocaleString('es-CO') || '0'}`,
      order.payment || 'Efectivo', order.deliveryPerson || 'Sin asignar', order.status || 'Pendiente',
      order.createdAt ? new Date(order.createdAt.seconds * 1000).toLocaleString('es-CO') : 'N/A',
      order.updatedAt ? new Date(order.updatedAt.seconds * 1000).toLocaleString('es-CO') : 'N/A',
    ].map(cell => `"${String(cell || '').replace(/"/g, '""')}"`))
  );

  const totalsRows = [
    ['Total Efectivo', `$${totals.cash.toLocaleString('es-CO')}`],
    ['Total Daviplata', `$${totals.daviplata.toLocaleString('es-CO')}`],
    ['Total Nequi', `$${totals.nequi.toLocaleString('es-CO')}`],
    ['Total General', `$${(totals.cash + totals.daviplata + totals.nequi).toLocaleString('es-CO')}`],
  ].map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`));

  const deliveryRows = Object.entries(deliveryPersons).map(([name, data]) => [
    name, `$${data.cash.toLocaleString('es-CO')}`, `$${data.daviplata.toLocaleString('es-CO')}`, 
    `$${data.nequi.toLocaleString('es-CO')}`, `$${data.total.toLocaleString('es-CO')}`
  ].map(cell => `"${String(cell || '').replace(/"/g, '""')}"`));

  const csvContent = [
    headers.join(','),
    ...orderRows,
    '',
    '"Resumen de Totales"',
    '"Concepto","Monto (COP)"',
    ...totalsRows,
    '"Resumen por Domiciliarios"',
    '"Domiciliario","Efectivo (COP)","Daviplata (COP)","Nequi (COP)","Total (COP)"',
    ...deliveryRows,
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pedidos_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
  setSuccess('Pedidos exportados a CSV.');
};