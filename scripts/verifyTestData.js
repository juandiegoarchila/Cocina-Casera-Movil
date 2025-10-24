// scripts/verifyTestData.js
const admin = require('firebase-admin');

// Carga tu clave de servicio de Firebase
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function verifyTestData() {
  console.log('🔍 Verificando datos de prueba...\n');

  try {
    // Verificar órdenes de domicilio almuerzo
    const ordersSnapshot = await db.collection('orders').get();
    console.log('📦 Órdenes de domicilio almuerzo:', ordersSnapshot.size);
    ordersSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`  - ${doc.id}: ${data.total} (${data.deliveryPerson})`);
    });

    // Verificar órdenes de salón almuerzo
    const tableOrdersSnapshot = await db.collection('tableOrders').get();
    console.log('\n🍽️ Órdenes de salón almuerzo:', tableOrdersSnapshot.size);
    tableOrdersSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`  - ${doc.id}: ${data.total} (${data.type})`);
    });

    // Verificar desayunos delivery
    const deliveryBreakfastSnapshot = await db.collection('deliveryBreakfastOrders').get();
    console.log('\n🚚 Desayunos delivery:', deliveryBreakfastSnapshot.size);
    deliveryBreakfastSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`  - ${doc.id}: ${data.total} (${data.deliveryPerson})`);
    });

    // Verificar desayunos salón
    const breakfastOrdersSnapshot = await db.collection('breakfastOrders').get();
    console.log('\n🏠 Desayunos salón:', breakfastOrdersSnapshot.size);
    breakfastOrdersSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`  - ${doc.id}: ${data.total} (${data.type})`);
    });

    // Verificar proteínas
    const proteinsSnapshot = await db.collection('dailyProteins').get();
    console.log('\n🥩 Proteínas:', proteinsSnapshot.size);
    let totalProteins = 0;
    proteinsSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`  - ${data.name}: ${data.quantity} unidades`);
      totalProteins += data.quantity;
    });
    console.log(`  Total proteínas: ${totalProteins} unidades`);

    // Verificar domiciliarios
    const deliveryPersonsSnapshot = await db.collection('deliveryPersons').get();
    console.log('\n👥 Domiciliarios:', deliveryPersonsSnapshot.size);
    deliveryPersonsSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`  - ${data.name}: $${data.total.total} (liquidado: ${data.isLiquidated})`);
    });

    // Verificar gastos
    const paymentsSnapshot = await db.collection('payments').get();
    console.log('\n💸 Gastos:', paymentsSnapshot.size);
    let totalGastos = 0;
    paymentsSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`  - ${data.description}: $${data.amount}`);
      totalGastos += data.amount;
    });
    console.log(`  Total gastos: $${totalGastos}`);

    console.log('\n✅ Verificación completada!');

  } catch (error) {
    console.error('❌ Error verificando datos:', error);
  }
}

verifyTestData().catch(console.error);
