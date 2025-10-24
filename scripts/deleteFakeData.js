const admin = require('firebase-admin');

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://servi-96624.firebaseio.com'
});

const db = admin.firestore();

const INGRESOS_COLLECTION = 'Ingresos';
const PEDIDOS_DIARIOS_GUARDADOS_COLLECTION = 'PedidosDiariosGuardados';

const deleteFakeData = async () => {
  const startDate = '2025-04-01';
  const endDate = '2025-08-23';
  const ONLY_FLAGGED = true; // si true solo borra docs con fake:true

  for (const col of [INGRESOS_COLLECTION, PEDIDOS_DIARIOS_GUARDADOS_COLLECTION]) {
    console.log(`Buscando en ${col}...`);
    let q = db.collection(col).where('date', '>=', startDate).where('date', '<=', endDate);
    if (ONLY_FLAGGED) q = q.where('fake', '==', true);
    const snapshot = await q.get();
    if (snapshot.empty) {
      console.log(`No se encontraron documentos para borrar en ${col}`);
      continue;
    }
    const batchSize = 400; // Firestore batch limit 500 (margen)
    let batch = db.batch();
    let count = 0;
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
      count++;
      if (count % batchSize === 0) {
        await batch.commit();
        console.log(`Commit parcial (${count}) en ${col}`);
        batch = db.batch();
      }
    }
    if (count % batchSize !== 0) await batch.commit();
    console.log(`Eliminados ${count} documentos en ${col}`);
  }
  console.log('Eliminación de datos falsos completada.');
};

deleteFakeData().catch((error) => {
  console.error('Error al eliminar datos:', error);
});

// Ejecutar: node scripts/deleteFakeData.js