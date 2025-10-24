// src/components/Admin/utilities/exportToPDF.js
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const exportToPDF = async (orders, totals = {}, deliveryPersons = {}) => {
  try {
    const doc = new jsPDF();

    const logoUrl = '/logo.png'; // Asegúrate de que esta ruta sea accesible
    try {
      doc.addImage(logoUrl, 'PNG', 160, 10, 30, 20);
    } catch (imgError) {
      console.warn('No se pudo cargar el logo para el PDF:', imgError);
    }

    doc.setFontSize(16);
    doc.text('Gestión de Pedidos', 14, 20);
    doc.setFontSize(12);
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-CO');
    const timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
    doc.text(`Fecha: ${dateStr} ${timeStr}`, 14, 30);

let mealCounter = 0;
const pedidosBody = orders.map((order) => {
  mealCounter += 1;
  const meal = order.meals?.[0] || {};
  const paymentMethod = order.payment?.name || order.payment || meal.payment?.name || meal.payment || 'Efectivo';

  return [
    mealCounter,
    meal.address?.address || '',
    meal.address?.phoneNumber || '',
    `$${order.total?.toLocaleString('es-CO') || '0'}`,
    paymentMethod,
    order?.deliveryPerson || ''
  ];
});

if (pedidosBody.length === 0) pedidosBody.push(Array(6).fill('-'));


    if (pedidosBody.length === 0) pedidosBody.push(Array(5).fill('-'));

    autoTable(doc, {
      startY: 40,
      head: [['N', 'Dirección', 'Teléfono', 'Total', 'Domiciliario']],
      body: pedidosBody,
      styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [0, 102, 204], textColor: 255, fontStyle: 'bold', lineWidth: 0.2, lineColor: [0, 0, 0] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      columnStyles: {
        1: { cellWidth: 'wrap' },
        3: { halign: 'right' }
      },
      tableLineColor: [0, 0, 0],
      tableLineWidth: 0.2,
      didDrawPage: (data) => {
        doc.setFontSize(10);
        doc.text(`Página ${data.pageNumber}`, 180, 287);
      }
    });

    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(14);
    doc.text('Resumen de Totales', 14, finalY);

    autoTable(doc, {
      startY: finalY + 5,
      head: [['Concepto', 'Monto']],
      body: [
        ['Total Efectivo', `$${totals.cash?.toLocaleString('es-CO') || '0'}`],
        ['Total Daviplata', `$${totals.daviplata?.toLocaleString('es-CO') || '0'}`],
        ['Total Nequi', `$${totals.nequi?.toLocaleString('es-CO') || '0'}`],
        ['Total General', `$${(totals.cash + totals.daviplata + totals.nequi || 0).toLocaleString('es-CO')}`]
      ],
      styles: { fontSize: 10, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [0, 102, 204], textColor: 255, fontStyle: 'bold', lineWidth: 0.2, lineColor: [0, 0, 0] },
      columnStyles: { 1: { halign: 'right' } },
      tableLineColor: [0, 0, 0],
      tableLineWidth: 0.2
    });

    const deliveryY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(14);
    doc.text('Resumen por Domiciliarios', 14, deliveryY);

    const deliveryBody = Object.entries(deliveryPersons).map(([name, data]) => [
      name || '',
      `$${data.cash?.toLocaleString('es-CO') || '0'}`,
      `$${data.daviplata?.toLocaleString('es-CO') || '0'}`,
      `$${data.nequi?.toLocaleString('es-CO') || '0'}`,
      `$${data.total?.toLocaleString('es-CO') || '0'}`
    ]);

    autoTable(doc, {
      startY: deliveryY + 5,
      head: [['Domiciliario', 'Efectivo', 'Daviplata', 'Nequi', 'Total']],
      body: deliveryBody.length > 0 ? deliveryBody : [['-', '-', '-', '-', '-']],
      styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [0, 102, 204], textColor: 255, fontStyle: 'bold', lineWidth: 0.2, lineColor: [0, 0, 0] },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' }
      },
      tableLineColor: [0, 0, 0],
      tableLineWidth: 0.2
    });

    doc.save(`pedidos_${new Date().toISOString().split('T')[0]}.pdf`);
  } catch (error) {
    console.error('Error al generar el PDF:', error);
    alert('Error al generar el PDF: ' + error.message);
  }
};