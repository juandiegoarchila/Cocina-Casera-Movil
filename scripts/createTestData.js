// scripts/createTestData.js
const admin = require('firebase-admin');

// Carga tu clave de servicio de Firebase
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function createTestData() {
  // Fechas para crear datos: 26, 27, 28, 29, 30 de agosto 2025
  const dates = [
    '2025-08-26',
    '2025-08-27',
    '2025-08-28',
    '2025-08-29',
    '2025-08-30'
  ];

  console.log('Creando datos de prueba para fechas:', dates.join(', '));

  for (const dateISO of dates) {
    const currentDate = new Date(dateISO + 'T00:00:00.000Z');
    const ts = admin.firestore.Timestamp.fromDate(currentDate);

    console.log(`\n📅 Creando datos para ${dateISO}...`);

    try {
      // Crear algunos pedidos básicos para cada fecha
      const orders = [
        {
          id: `test-order-1-${dateISO}`,
          type: 'delivery',
          mealType: 'lunch',
          paymentMethod: 'Efectivo',
          total: 50000,
          createdAt: ts,
          status: 'completed'
        },
        {
          id: `test-order-2-${dateISO}`,
          type: 'delivery',
          mealType: 'breakfast',
          paymentMethod: 'Nequi',
          total: 25000,
          createdAt: ts,
          status: 'completed'
        }
      ];

      for (const order of orders) {
        const { id, ...orderData } = order;
        await db.collection('orders').doc(id).set(orderData);
      }

      // Crear gastos
      const expenses = [
        {
          id: `gasto-${dateISO}`,
          amount: 5000,
          description: 'Gasto de prueba',
          createdAt: ts
        }
      ];

      for (const expense of expenses) {
        const { id, ...expenseData } = expense;
        await db.collection('payments').doc(id).set(expenseData);
      }

      console.log(`✅ Datos básicos creados para ${dateISO}`);

    } catch (error) {
      console.error(`❌ Error creando datos para ${dateISO}:`, error);
    }
  }

  console.log('\n✅ Proceso completado! Datos creados para las fechas:', dates.join(', '));
  console.log('💡 Ahora puedes probar el dashboard cambiando entre estas fechas.');
}

createTestData().catch(console.error);
