// scripts/cleanTestData.js
const admin = require('firebase-admin');

// Carga tu clave de servicio de Firebase
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function cleanTestData() {
  console.log('🧹 Iniciando limpieza de datos de prueba...');

  const collectionsToClean = [
    'orders',           // Domicilios almuerzo
    'tableOrders',      // Salón almuerzo y desayunos
    'breakfastOrders',  // Desayunos domicilio
    'payments',         // Gastos
    'dailyProteins',    // Proteínas
    'deliveryPersons',  // Domiciliarios
    'ingresos',         // Datos históricos
    'pedidosDiariosGuardados' // Pedidos diarios
  ];

  try {
    for (const collectionName of collectionsToClean) {
      console.log(`🗑️  Limpiando colección: ${collectionName}`);

      const collectionRef = db.collection(collectionName);
      const snapshot = await collectionRef.get();

      if (snapshot.empty) {
        console.log(`   📭 ${collectionName} ya está vacío`);
        continue;
      }

      // Eliminar documentos en lotes para evitar límites
      const batchSize = 10;
      let batch = db.batch();
      let count = 0;
      let batchCount = 0;

      snapshot.forEach((doc) => {
        batch.delete(doc.ref);
        count++;

        if (count % batchSize === 0) {
          batchCount++;
          console.log(`   📦 Ejecutando lote ${batchCount} (${count} documentos)`);
          // No esperamos aquí, continuamos
        }
      });

      if (count > 0) {
        await batch.commit();
        console.log(`   ✅ Eliminados ${count} documentos de ${collectionName}`);
      }
    }

    console.log('\n🎉 Limpieza completada exitosamente!');
    console.log('💡 Ahora puedes ejecutar createTestData.js para crear datos frescos');

  } catch (error) {
    console.error('❌ Error durante la limpieza:', error);
  }
}

cleanTestData().catch(console.error);
