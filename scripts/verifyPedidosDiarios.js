// scripts/verifyPedidosDiarios.js
const admin = require('firebase-admin');

// Carga tu clave de servicio de Firebase
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function verifyPedidosDiarios() {
  console.log('🔍 Verificando datos de pedidos diarios...\n');

  try {
    // Verificar datos de pedidos diarios guardados
    const pedidosSnapshot = await db.collection('pedidosDiariosGuardados').get();
    console.log('📊 Datos de pedidos diarios guardados:');
    pedidosSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`Fecha: ${doc.id}`);
      console.log(`Desayunos - Domicilio: ${data.breakfast?.domicilio || 0}, Mesa: ${data.breakfast?.mesa || 0}, Llevar: ${data.breakfast?.llevar || 0}, Total: ${data.breakfast?.total || 0}`);
      console.log(`Almuerzos - Domicilio: ${data.lunch?.domicilio || 0}, Mesa: ${data.lunch?.mesa || 0}, Llevar: ${data.lunch?.llevar || 0}, Total: ${data.lunch?.total || 0}`);
      console.log(`Total pedidos: ${data.total || 0}`);
    });

    console.log('\n📋 Comparación con pedidos reales creados:');

    // Contar pedidos reales
    const ordersSnapshot = await db.collection('orders').get();
    const tableOrdersSnapshot = await db.collection('tableOrders').get();
    const breakfastOrdersSnapshot = await db.collection('breakfastOrders').get();
    const deliveryBreakfastSnapshot = await db.collection('deliveryBreakfastOrders').get();

    let realBreakfastDomicilio = 0;
    let realBreakfastMesa = 0;
    let realBreakfastLlevar = 0;
    let realLunchDomicilio = 0;
    let realLunchMesa = 0;
    let realLunchLlevar = 0;

    // Procesar orders (domicilio)
    ordersSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.mealType === 'breakfast') {
        realBreakfastDomicilio++;
      } else if (data.mealType === 'lunch') {
        realLunchDomicilio++;
      }
    });

    // Procesar deliveryBreakfastOrders
    deliveryBreakfastSnapshot.forEach(doc => {
      realBreakfastDomicilio++;
    });

    // Procesar tableOrders
    tableOrdersSnapshot.forEach(doc => {
      const data = doc.data();
      const serviceType = data.serviceType || 'mesa';

      if (data.mealType === 'breakfast') {
        if (serviceType === 'llevar') {
          realBreakfastLlevar++;
        } else {
          realBreakfastMesa++;
        }
      } else if (data.mealType === 'lunch') {
        if (serviceType === 'llevar') {
          realLunchLlevar++;
        } else {
          realLunchMesa++;
        }
      }
    });

    // Procesar breakfastOrders
    breakfastOrdersSnapshot.forEach(doc => {
      const data = doc.data();
      const serviceType = data.serviceType || 'mesa';

      if (serviceType === 'llevar') {
        realBreakfastLlevar++;
      } else {
        realBreakfastMesa++;
      }
    });

    console.log('PEDIDOS REALES:');
    console.log(`Desayunos - Domicilio: ${realBreakfastDomicilio}, Mesa: ${realBreakfastMesa}, Llevar: ${realBreakfastLlevar}, Total: ${realBreakfastDomicilio + realBreakfastMesa + realBreakfastLlevar}`);
    console.log(`Almuerzos - Domicilio: ${realLunchDomicilio}, Mesa: ${realLunchMesa}, Llevar: ${realLunchLlevar}, Total: ${realLunchDomicilio + realLunchMesa + realLunchLlevar}`);
    console.log(`Total pedidos reales: ${realBreakfastDomicilio + realBreakfastMesa + realBreakfastLlevar + realLunchDomicilio + realLunchMesa + realLunchLlevar}`);

    console.log('\n✅ Verificación completada!');

  } catch (error) {
    console.error('❌ Error verificando pedidos diarios:', error);
  }
}

verifyPedidosDiarios().catch(console.error);
