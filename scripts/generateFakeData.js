
const admin = require('firebase-admin');

// Configuración de la cuenta de servicio (reemplaza con la ruta a tu clave)
const serviceAccount = require('./serviceAccountKey.json');

// Inicializar Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://servi-96624.firebaseio.com'
});

const db = admin.firestore();

// Constantes para las colecciones
const INGRESOS_COLLECTION = 'Ingresos';
const PEDIDOS_DIARIOS_GUARDADOS_COLLECTION = 'PedidosDiariosGuardados';

// Función para generar un número aleatorio en un rango
const getRandomInt = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Función para determinar si es fin de semana (sábado o domingo)
const isWeekend = (date) => date.getDay() === 0 || date.getDay() === 6;

// Función para generar datos falsos de ingresos
const generateFakeIngresos = async (date) => {
  // Generar total diario: más alto en fines de semana
  const totalSales = isWeekend(date) ? getRandomInt(500000, 2000000) : getRandomInt(100000, 1000000);
  
  // Distribuir el total entre los métodos de pago (suma siempre igual a 100%)
  const cashPercentage = getRandomInt(20, 50); // Efectivo: 20-50%
  const daviplataPercentage = getRandomInt(20, 50); // Daviplata: 20-50%
  const nequiPercentage = 100 - cashPercentage - daviplataPercentage; // Nequi: resto
  
  const cash = Math.round((totalSales * cashPercentage) / 100);
  const daviplata = Math.round((totalSales * daviplataPercentage) / 100);
  const nequi = totalSales - cash - daviplata; // Ajustar para que sume exactamente totalSales

  const dateString = date.toISOString().split('T')[0];
  const timestamp = admin.firestore.Timestamp.fromDate(date);

  try {
    await db.collection(INGRESOS_COLLECTION).add({
      date: dateString,
      cash,
      daviplata,
      nequi,
      totalSales,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    console.log(`Ingresos generados para ${dateString}: Efectivo: ${cash}, Daviplata: ${daviplata}, Nequi: ${nequi}, Total: ${totalSales}`);
  } catch (error) {
    console.error(`Error al generar ingresos para ${dateString}:`, error);
  }
};

// Función para generar datos falsos de pedidos diarios
const generateFakePedidosDiarios = async (date) => {
  // Generar conteo de pedidos: más alto en fines de semana
  const count = isWeekend(date) ? getRandomInt(30, 60) : getRandomInt(5, 30);
  const dateString = date.toISOString().split('T')[0];
  const timestamp = admin.firestore.Timestamp.fromDate(date);

  try {
    await db.collection(PEDIDOS_DIARIOS_GUARDADOS_COLLECTION).add({
      date: dateString,
      count,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    console.log(`Pedidos diarios generados para ${dateString}: Conteo: ${count}`);
  } catch (error) {
    console.error(`Error al generar pedidos diarios para ${dateString}:`, error);
  }
};

// Función principal para generar datos desde el 1 de enero hasta el 16 de julio de 2025
const generateFakeData = async () => {
  const startDate = new Date('2025-01-01');
  const endDate = new Date('2025-07-21');
  
  // Iterar por cada día en el rango
  for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    await generateFakeIngresos(new Date(date));
    await generateFakePedidosDiarios(new Date(date));
  }
  
  console.log('Generación de datos falsos completada.');
};

// Ejecutar la generación de datos
generateFakeData().catch((error) => {
  console.error('Error en la generación de datos:', error);
});

// node scripts/generateFakeData.js