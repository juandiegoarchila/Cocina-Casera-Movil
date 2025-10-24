//src/components/Admin/utilities/previewOrders.js
export const generatePreviewHtml = (orders, totals, deliveryPersons) => {
  let mealCounter = 0;
  const pedidosBody = orders.flatMap((order) => {
    if (!order || !Array.isArray(order.meals) || order.meals.length === 0) return [];
    return order.meals.filter(meal => meal).map((meal) => {
      mealCounter += 1;
      return [
        mealCounter,
        meal?.address?.address || '',
        meal?.address?.phoneNumber || '',
        `$${order.total?.toLocaleString('es-CO') || '0'}`,
        order?.deliveryPerson || ''
      ];
    });
  });

  if (pedidosBody.length === 0) pedidosBody.push(Array(5).fill('-'));

  const deliveryBody = Object.entries(deliveryPersons).map(([name, data]) => [
    name || '',
    `$${data.cash?.toLocaleString('es-CO') || '0'}`,
    `$${data.daviplata?.toLocaleString('es-CO') || '0'}`,
    `$${data.nequi?.toLocaleString('es-CO') || '0'}`,
    `$${data.total?.toLocaleString('es-CO') || '0'}`
  ]);

  const now = new Date();
  const dateStr = now.toLocaleDateString('es-CO');
  const timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });

  return `
    <html>
      <head>
        <title>Previsualización de Pedidos</title>
        <style>
          body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
          h1 { text-align: center; font-size: 24px; }
          p.date { text-align: center; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { padding: 8px; border: 1px solid black; }
          th { background-color: #0066cc; color: white; font-weight: bold; }
          td { text-align: left; }
          td:nth-child(4) { text-align: right; }
          tr:nth-child(even) { background-color: #f5f5f5; }
          .totals-table { width: 50%; }
          .delivery-table th:nth-child(n+2), .delivery-table td:nth-child(n+2) { text-align: right; }
          .button-container { margin-top: 20px; text-align: center; }
          .button { padding: 10px 20px; background-color: #0066cc; color: white; border: none; border-radius: 5px; cursor: pointer; margin: 5px; }
          .button.print { background-color: #28a745; }
          @media print {
              .button-container { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>Gestión de Pedidos</h1>
        <p class="date">Fecha: ${dateStr} ${timeStr}</p>
        <table>
          <thead>
            <tr>
              <th>N</th>
              <th>Dirección</th>
              <th>Teléfono</th>
              <th>Total</th>
              <th>Domiciliario</th>
            </tr>
          </thead>
          <tbody>
            ${pedidosBody.map(row => `
              <tr>
                <td>${row[0]}</td>
                <td>${row[1]}</td>
                <td>${row[2]}</td>
                <td>${row[3]}</td>
                <td>${row[4]}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <h2 style="margin-top: 20px; font-size: 18px;">Resumen de Totales</h2>
        <table class="totals-table">
          <tbody>
            <tr><td style="padding: 8px;">Total Efectivo</td><td style="padding: 8px; text-align: right;">${pedidosBody.length > 0 ? `$${totals.cash?.toLocaleString('es-CO') || '0'}` : '$0'}</td></tr>
            <tr><td style="padding: 8px;">Total Daviplata</td><td style="padding: 8px; text-align: right;">${pedidosBody.length > 0 ? `$${totals.daviplata?.toLocaleString('es-CO') || '0'}` : '$0'}</td></tr>
            <tr><td style="padding: 8px;">Total Nequi</td><td style="padding: 8px; text-align: right;">${pedidosBody.length > 0 ? `$${totals.nequi?.toLocaleString('es-CO') || '0'}` : '$0'}</td></tr>
            <tr><td style="padding: 8px;">Total General</td><td style="padding: 8px; text-align: right;">${pedidosBody.length > 0 ? `$${(totals.cash + totals.daviplata + totals.nequi || 0).toLocaleString('es-CO')}` : '$0'}</td></tr>
          </tbody>
        </table>
        <h2 style="margin-top: 20px; font-size: 18px;">Resumen por Domiciliarios</h2>
        <table class="delivery-table">
          <thead>
            <tr>
              <th>Domiciliario</th>
              <th>Efectivo</th>
              <th>Daviplata</th>
              <th>Nequi</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${deliveryBody.map(row => `
              <tr>
                <td>${row[0]}</td>
                <td>${row[1]}</td>
                <td>${row[2]}</td>
                <td>${row[3]}</td>
                <td>${row[4]}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="button-container">
          <button class="button print" onclick="window.print()">Imprimir</button>
          <button class="button" onclick="window.close()">Cerrar Previsualización</button>
        </div>
      </body>
    </html>
  `;
};