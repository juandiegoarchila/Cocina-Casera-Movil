//src/components/Admin/utilities/exportToExcel.js
import ExcelJS from 'exceljs';

export const exportToExcel = async (orders, totals, deliveryPersons, totalProteinUnits, proteins) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Gestión de Pedidos');

    const cleanText = (text) => {
      if (text == null || text === undefined) return '';
      if (typeof text === 'string') return text.replace(' NUEVO', '').trim();
      if (typeof text === 'boolean') return text.toString();
      if (typeof text === 'object' && text !== null && 'name' in text && typeof text.name === 'string') {
        return text.name.replace(' NUEVO', '').trim();
      }
      return String(text).replace(' NUEVO', '').trim();
    };

    const applyThinBorder = (cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } },
      };
    };

    // 🟡 1. Resumen de Proteínas
    worksheet.addRow(['', 'PROTEÍNAS DEL DÍA']);
    const proteinHeaderRow = worksheet.lastRow.number;
    worksheet.mergeCells(proteinHeaderRow, 2, proteinHeaderRow, 3);
    const ourHeader = worksheet.getCell(`B${proteinHeaderRow}`);
    ourHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ourHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0066CC' } };
    ourHeader.alignment = { horizontal: 'center' };

    worksheet.getRow(proteinHeaderRow + 1).values = ['', 'Proteína', 'Unidades', '', ''];
    const proteinTableHeader = worksheet.getRow(proteinHeaderRow + 1);
    proteinTableHeader.eachCell((cell, colNumber) => {
      if (colNumber === 2 || colNumber === 3) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF28A745' } };
        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
        cell.alignment = { horizontal: 'center' };
        applyThinBorder(cell);
      }
      if (colNumber === 4 || colNumber === 5) {
        cell.value = '';
      }
    });

    const proteinData = proteins.length === 0
      ? [{ name: '-', quantity: '-', extra: '', extraValue: '' }]
      : [
          ...proteins.slice(0, -2),
          {
            name: proteins[proteins.length - 2]?.name || '-',
            quantity: proteins[proteins.length - 2]?.quantity || '-',
            extra: 'TOTAL PROTEÍNAS:',
            extraValue: totalProteinUnits.toLocaleString('es-CO'),
          },
          {
            name: proteins[proteins.length - 1]?.name || '-',
            quantity: proteins[proteins.length - 1]?.quantity || '-',
            extra: 'Fecha actual:',
            extraValue: `${String(new Date().getDate()).padStart(2, '0')}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}`,
          },
        ];

    proteinData.forEach((protein, index) => {
      const row = worksheet.addRow(['', cleanText(protein.name), protein.quantity, protein.extra, protein.extraValue]);
      row.eachCell((cell, colNumber) => {
        if (colNumber >= 2) {
          if (index >= proteinData.length - 2 || colNumber === 2 || colNumber === 3) {
            applyThinBorder(cell);
          }
          if (colNumber === 3) {
            cell.numFmt = '#,##0';
            cell.alignment = { horizontal: 'right' };
          }
          if (colNumber === 4) cell.alignment = { horizontal: 'left' };
          if (colNumber === 5) cell.alignment = { horizontal: 'right' };
        }
      });
    });

    worksheet.addRow({});
    worksheet.addRow({});

    // 🟢 2. Pedidos
    let mealCounter = 0;
    const pedidos = orders.map((order, index) => {
      mealCounter += 1;
      const meal = order.meals?.[0] || {};
      const paymentValue = order.payment || (typeof meal.payment === 'object' && meal.payment?.name) || meal.payment || 'Efectivo';
      if (!paymentValue || (typeof paymentValue === 'object' && !('name' in paymentValue))) {
        console.warn(`Invalid payment data in order ${order.id || index}:`, { order, paymentValue });
      }
      return {
        N: mealCounter,
        Dirección: cleanText(meal.address?.address),
        Teléfono: cleanText(meal.address?.phoneNumber),
        Total: order.total || 0,
        MétodoDePago: cleanText(paymentValue),
        Domiciliario: cleanText(order.deliveryPerson || 'Sin asignar'),
      };
    });

    if (pedidos.length === 0) {
      pedidos.push({ N: '-', Dirección: '-', Teléfono: '-', Total: '-', MétodoDePago: '-', Domiciliario: '-' });
    }

    worksheet.columns = [
      { key: 'N', width: 10 },
      { key: 'Dirección', width: 30 },
      { key: 'Teléfono', width: 15 },
      { key: 'Total', width: 15 },
      { key: 'MétodoDePago', width: 15 },
      { key: 'Domiciliario', width: 25 },
    ];

    const pedidosHeaderRow = proteinData.length + 4;
    const headerRow = worksheet.getRow(pedidosHeaderRow);
    headerRow.values = ['N', 'Dirección', 'Teléfono', 'Total', 'Método de Pago', 'Domiciliario'];
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0066CC' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      cell.alignment = { horizontal: 'center' };
      applyThinBorder(cell);
    });

    pedidos.forEach(pedido => {
      const row = worksheet.addRow(pedido);
      row.eachCell(cell => applyThinBorder(cell));
    });

    worksheet.addRow({});
    worksheet.addRow({});

    // 🟠 3. Resumen de Totales
    worksheet.addRow([]);
    const resumenRow = worksheet.lastRow.number;
    worksheet.getCell(`C${resumenRow}`).value = 'Resumen de Totales';
    worksheet.mergeCells(`C${resumenRow}:D${resumenRow}`);
    const resumenCell = worksheet.getCell(`C${resumenRow}`);
    resumenCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    resumenCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0066CC' } };
    resumenCell.alignment = { horizontal: 'center' };
    applyThinBorder(resumenCell);
    applyThinBorder(worksheet.getCell(`D${resumenRow}`));

    const resumenData = [
      ['Total Efectivo', totals.cash || 0],
      ['Total Daviplata', totals.daviplata || 0],
      ['Total Nequi', totals.nequi || 0],
      ['Total General', (totals.cash || 0) + (totals.daviplata || 0) + (totals.nequi || 0)],
    ];

    resumenData.forEach(([label, value]) => {
      const row = worksheet.addRow(['', '', label, value]);
      row.getCell(3).alignment = { horizontal: 'left' };
      row.getCell(4).alignment = { horizontal: 'right' };
      row.getCell(4).numFmt = '$#,##0';
      row.getCell(4).font = { bold: true };
      applyThinBorder(row.getCell(3));
      applyThinBorder(row.getCell(4));
    });

    worksheet.addRow({});
    worksheet.addRow({});

    // 🔵 4. Resumen por Domiciliarios
    worksheet.addRow(['', 'Resumen por Domiciliarios']);
    const resumenDomiciliariosRow = worksheet.lastRow.number;
    worksheet.mergeCells(resumenDomiciliariosRow, 2, resumenDomiciliariosRow, 6);
    const deliveryHeader = worksheet.getCell(`B${resumenDomiciliariosRow}`);
    deliveryHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    deliveryHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0066CC' } };
    deliveryHeader.alignment = { horizontal: 'center' };
    for (let i = 2; i <= 6; i++) applyThinBorder(worksheet.getCell(resumenDomiciliariosRow, i));

    worksheet.addRow(['', 'Domiciliario', 'Efectivo', 'Daviplata', 'Nequi', 'Total']);
    const domHeader = worksheet.lastRow;
    domHeader.eachCell((cell, colNumber) => {
      if (colNumber >= 2) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF28A745' } };
        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
        cell.alignment = { horizontal: 'center' };
        applyThinBorder(cell);
      }
    });

    Object.entries(deliveryPersons).forEach(([name, data]) => {
      const row = worksheet.addRow([
        '',
        cleanText(name),
        data.cash || 0,
        data.daviplata || 0,
        data.nequi || 0,
        data.total || 0,
      ]);
      row.eachCell((cell, colNumber) => {
        if (colNumber >= 2) {
          if (colNumber >= 3) {
            cell.numFmt = '$#,##0';
            cell.alignment = { horizontal: 'right' };
          }
          applyThinBorder(cell);
        }
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = `pedidos_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('Error al exportar Excel:', error);
    alert('Error al generar el archivo Excel: ' + error.message);
  }
};