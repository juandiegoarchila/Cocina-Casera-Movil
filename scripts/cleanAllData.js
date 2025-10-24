// scripts/cleanAllData.js
const admin = require('firebase-admin');

// Carga tu clave de servicio de Firebase
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function cleanAllData() {
  console.log('🧹 Iniciando limpieza COMPLETA de TODOS los datos...');

  try {
    // Lista de TODAS las colecciones que pueden existir
    const collections = [
      'orders',
      'tableOrders',
      'breakfastOrders',
      'deliveryBreakfastOrders',
      'payments',
      'dailyProteins',
      'deliveryPersons',
      'ingresos',
      'pedidosDiariosGuardados',
      'dailyOrders',
      'proteinTracking',
      'expenses',
      'sales',
      'customers',
      'menuItems',
      'settings',
      'logs',
      'audit',
      'userProfiles',
      'notifications',
      'reports',
      'backups'
    ];

    for (const collectionName of collections) {
      try {
        console.log(`🗑️  Eliminando colección: ${collectionName}`);

        // Obtener todos los documentos de la colección
        const snapshot = await db.collection(collectionName).get();

        if (snapshot.empty) {
          console.log(`   📭 ${collectionName} ya está vacío`);
          continue;
        }

        // Eliminar cada documento en lotes
        const batchSize = 10;
        const batches = [];
        let totalDeleted = 0;

        for (let i = 0; i < snapshot.docs.length; i += batchSize) {
          const batch = db.batch();
          const batchDocs = snapshot.docs.slice(i, i + batchSize);

          batchDocs.forEach((doc) => {
            batch.delete(doc.ref);
          });

          batches.push(batch.commit());
          totalDeleted += batchDocs.length;
        }

        await Promise.all(batches);
        console.log(`   ✅ Eliminados ${totalDeleted} documentos de ${collectionName}`);

      } catch (error) {
        console.log(`   ⚠️  Error eliminando ${collectionName}: ${error.message}`);
      }
    }

    console.log('\n🎉 Limpieza COMPLETA finalizada exitosamente!');
    console.log('💡 Ahora puedes ejecutar createRealisticData.js para crear datos frescos');

  } catch (error) {
    console.error('❌ Error en limpieza completa:', error);
  }
}

cleanAllData().catch(console.error);
