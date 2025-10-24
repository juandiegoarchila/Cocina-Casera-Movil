//src/components/Admin/utilities/previewExcel.js
export const generateExcelPreviewHtml = (orders, totals, deliveryPersons, totalProteinUnits = 0, proteins = []) => {
  let mealCounter = 0;
  const pedidosBody = orders.map((order) => {
    mealCounter += 1;
    const meal = order.meals?.[0] || {};
    const payment = order.payment?.name || order.payment || meal?.payment?.name || meal?.payment || 'Efectivo';

    return [
      mealCounter,
      meal?.address?.address || '',
      meal?.address?.phoneNumber || '',
      `$${order.total?.toLocaleString('es-CO') || '0'}`,
      payment,
      order?.deliveryPerson || ''
    ];
  });

  if (pedidosBody.length === 0) pedidosBody.push(Array(6).fill('-'));

  const deliveryBody = Object.entries(deliveryPersons).map(([name, data]) => [
    name || '',
    `$${data.cash?.toLocaleString('es-CO') || '0'}`,
    `$${data.daviplata?.toLocaleString('es-CO') || '0'}`,
    `$${data.nequi?.toLocaleString('es-CO') || '0'}`,
    `$${data.total?.toLocaleString('es-CO') || '0'}`
  ]);

  const proteinsBody = proteins.length === 0
    ? [['-', '-']]
    : proteins.map((protein, index) => {
        const isPenultimate = index === proteins.length - 2;
        const isLast = index === proteins.length - 1;
        return [
          protein.name || 'Sin nombre',
          protein.quantity?.toLocaleString('es-CO') || '0',
          isPenultimate ? 'TOTAL PROTEÍNAS:' : isLast ? 'Fecha actual:' : '',
          isPenultimate ? totalProteinUnits.toLocaleString('es-CO') : isLast ? new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
        ];
      });

  // Se calculan los totales de forma precisa
  const calculatedTotals = {
    cash: totals.cash || 0,
    daviplata: totals.daviplata || 0,
    nequi: totals.nequi || 0
  };
  const totalGeneral = calculatedTotals.cash + calculatedTotals.daviplata + calculatedTotals.nequi;

  return `
    <html>
      <head>
        <title>Previsualización de Excel</title>
        <style>
          body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
          h1 { text-align: center; font-size: 24px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 8px; border: 1px solid black; }
          th { background-color: #0066cc; color: white; font-weight: bold; text-align: center; font-size: 16px; }
          td { text-align: left; vertical-align: middle; }
          td:nth-child(4), td:nth-child(6) { text-align: right; }
          tr:nth-child(even) { background-color: #f5f5f5; }
          .totals-table { width: 50%; margin-left: auto; margin-right: auto; }

          .proteins-container { width: auto; margin: 0 auto; max-width: 700px; }
          .proteins-table {
            border-collapse: collapse;
            font-size: 14px;
            width: 100%;
            max-width: 700px;
          }
          .proteins-table th, .proteins-table td {
            padding: 6px 12px;
            border: 1px solid black;
            white-space: nowrap;
          }
          .proteins-table th:nth-child(1), .proteins-table td:nth-child(1) { width: 160px; text-align: left; }
          .proteins-table th:nth-child(2), .proteins-table td:nth-child(2) { width: 80px; text-align: right; }
          .proteins-table th:nth-child(3), .proteins-table td:nth-child(3) { width: 220px; text-align: left; }

          .delivery-table th { background-color: #0066cc; color: white; font-weight: bold; text-align: center; font-size: 16px; }
          .delivery-table .green-header th { background-color: #28a745; }
          .delivery-table td:nth-child(n+2) { text-align: right; }

          .spacer { height: 16px; }
          .button-container { margin-top: 20px; text-align: center; }
          .button { padding: 10px 20px; background-color: #0066cc; color: white; border: none; border-radius: 5px; cursor: pointer; margin: 5px; }
          .button.print { background-color: #28a745; }
          @media print { .button-container { display: none; } }
        </style>
      </head>
      <body>
        <h1>Gestión de Pedidos</h1>
        <div class="spacer"></div>

        <div class="proteins-container">
          <table class="proteins-table" aria-label="Resumen de proteínas">
            <thead>
              <tr>
                <th style="background-color: #0066cc; color: white; border: 1px solid black;">Proteína</th>
                <th style="background-color: #0066cc; color: white; border: 1px solid black;">Unidades</th>
                <th style="background-color: #0066cc; color: white; border: 1px solid black;"></th>
              </tr>
            </thead>
            <tbody>
              ${proteinsBody.map((row, index) => {
                const thirdColumn = row[2] ? `
                  <td style="padding: 0;">
                    <div style="display: flex; width: 100%; height: 100%;">
                      <div style="flex: 1; padding: 6px 12px; font-weight: bold; display: flex; align-items: center;">${row[2]}</div>
                      <div style="width: 1px; background-color: black;"></div>
                      <div style="flex: 1; padding: 6px 12px; display: flex; justify-content: flex-end; align-items: center; font-weight: ${row[2] === 'TOTAL PROTEÍNAS:' ? 'bold' : 'normal'};">${row[3]}</div>
                    </div>
                  </td>
                ` : '<td style="border: none; background-color: white;"></td>';

                return `
                  <tr>
                    <td title="${row[0]}">${row[0]}</td>
                    <td style="text-align: right;">${row[1]}</td>
                    ${thirdColumn}
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <div class="spacer"></div><div class="spacer"></div>

        <table>
          <thead>
            <tr>
              <th>N</th>
              <th>Dirección</th>
              <th>Teléfono</th>
              <th>Total</th>
              <th>Método de Pago</th>
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
                <td>${row[5]}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="spacer"></div><div class="spacer"></div>

        <table class="totals-table">
          <thead>
            <tr><th colspan="2">Resumen de Totales</th></tr>
          </thead>
          <tbody>
            <tr><td>Total Efectivo</td><td style="text-align: right;">$${calculatedTotals.cash.toLocaleString('es-CO')}</td></tr>
            <tr><td>Total Daviplata</td><td style="text-align: right;">$${calculatedTotals.daviplata.toLocaleString('es-CO')}</td></tr>
            <tr><td>Total Nequi</td><td style="text-align: right;">$${calculatedTotals.nequi.toLocaleString('es-CO')}</td></tr>
            <tr><td>Total General</td><td style="text-align: right;">$${totalGeneral.toLocaleString('es-CO')}</td></tr>
          </tbody>
        </table>

        <div class="spacer"></div><div class="spacer"></div>

        <table class="delivery-table">
          <thead>
            <tr><th colspan="5">Resumen por Domiciliarios</th></tr>
            <tr class="green-header">
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
          <button class="button" onclick="window.opener.postMessage('downloadExcel', '*')">Descargar Excel</button>
        </div>
      </body>
    </html>
  `;
};