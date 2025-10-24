// scripts/createRealisticData.js
const admin = require('firebase-admin');

// Carga tu clave de servicio de Firebase
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function createRealisticData() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Helper para convertir a Timestamp
  const ts = admin.firestore.Timestamp.fromDate(today);
  const todayISO = today.toISOString().split('T')[0];

  console.log('Creando datos realistas para:', todayISO);

  try {
    // ===== DATOS REALISTAS DE UN DÍA TÍPICO =====

    // 1. Pedidos de domicilio almuerzo (colección 'orders')
    const domicilioAlmuerzoOrders = [
      {
        id: 'dom-001',
        type: 'delivery',
        mealType: 'lunch',
        paymentMethod: 'Efectivo',
        total: 45000,
        settled: false,
        deliveryPerson: 'Carlos Rodríguez',
        address: { address: 'Calle 45 #23-12, Laureles' },
        meals: [{
          address: { address: 'Calle 45 #23-12, Laureles' },
          payment: { name: 'Efectivo' },
          time: { hour: 12, minute: 30 }
        }],
        payments: [{ method: 'cash', amount: 45000 }],
        customerName: 'María López',
        customerPhone: '3001234567'
      },
      {
        id: 'dom-002',
        type: 'delivery',
        mealType: 'lunch',
        paymentMethod: 'Nequi',
        total: 52000,
        settled: false,
        deliveryPerson: 'Carlos Rodríguez',
        address: { address: 'Carrera 65 #45-67, Poblado' },
        meals: [{
          address: { address: 'Carrera 65 #45-67, Poblado' },
          payment: { name: 'Nequi' },
          time: { hour: 13, minute: 15 }
        }],
        payments: [{ method: 'nequi', amount: 52000 }],
        customerName: 'Juan Pérez',
        customerPhone: '3012345678'
      },
      {
        id: 'dom-003',
        type: 'delivery',
        mealType: 'lunch',
        paymentMethod: 'Daviplata',
        total: 38000,
        settled: false,
        deliveryPerson: 'Ana María',
        address: { address: 'Transversal 39 #45-23, Envigado' },
        meals: [{
          address: { address: 'Transversal 39 #45-23, Envigado' },
          payment: { name: 'Daviplata' },
          time: { hour: 12, minute: 45 }
        }],
        payments: [{ method: 'daviplata', amount: 38000 }],
        customerName: 'Pedro Gómez',
        customerPhone: '3023456789'
      },
      {
        id: 'dom-004',
        type: 'delivery',
        mealType: 'lunch',
        paymentMethod: 'Efectivo',
        total: 41000,
        settled: false,
        deliveryPerson: 'Ana María',
        address: { address: 'Diagonal 75 #34-56, Itagüí' },
        meals: [{
          address: { address: 'Diagonal 75 #34-56, Itagüí' },
          payment: { name: 'Efectivo' },
          time: { hour: 13, minute: 30 }
        }],
        payments: [{ method: 'cash', amount: 41000 }],
        customerName: 'Carmen Díaz',
        customerPhone: '3034567890'
      },
      {
        id: 'dom-005',
        type: 'delivery',
        mealType: 'lunch',
        paymentMethod: 'Nequi',
        total: 47000,
        settled: false,
        deliveryPerson: 'Miguel Ángel',
        address: { address: 'Avenida 80 #12-34, Belén' },
        meals: [{
          address: { address: 'Avenida 80 #12-34, Belén' },
          payment: { name: 'Nequi' },
          time: { hour: 14, minute: 0 }
        }],
        payments: [{ method: 'nequi', amount: 47000 }],
        customerName: 'Roberto Sánchez',
        customerPhone: '3045678901'
      }
    ];

    for (const order of domicilioAlmuerzoOrders) {
      const { id, ...orderData } = order;
      await db.collection('orders').doc(id).set({
        ...orderData,
        createdAt: ts,
        timestamp: ts,
        date: ts,
        status: 'completed',
        orderType: 'delivery'
      });
    }

    // 2. Pedidos de salón almuerzo (colección 'tableOrders')
    const salonAlmuerzoOrders = [
      {
        id: 'mesa-001',
        type: 'dineIn',
        serviceType: 'mesa',
        mealType: 'lunch',
        paymentMethod: 'Efectivo',
        total: 65000,
        tableNumber: 5,
        payments: [{ method: 'cash', amount: 65000 }],
        customerName: 'Familia Martínez',
        peopleCount: 4
      },
      {
        id: 'llevar-001',
        type: 'takeaway',
        serviceType: 'llevar',
        mealType: 'lunch',
        paymentMethod: 'Nequi',
        total: 42000,
        payments: [{ method: 'nequi', amount: 42000 }],
        customerName: 'Luis Fernando',
        customerPhone: '3056789012'
      },
      {
        id: 'mesa-002',
        type: 'dineIn',
        serviceType: 'mesa',
        mealType: 'lunch',
        paymentMethod: 'Daviplata',
        total: 58000,
        tableNumber: 3,
        payments: [{ method: 'daviplata', amount: 58000 }],
        customerName: 'Grupo Empresarial',
        peopleCount: 3
      }
    ];

    for (const order of salonAlmuerzoOrders) {
      const { id, ...orderData } = order;
      await db.collection('tableOrders').doc(id).set({
        ...orderData,
        createdAt: ts,
        timestamp: ts,
        date: ts,
        status: 'completed'
      });
    }

    // 3. Pedidos de desayuno delivery (colección 'deliveryBreakfastOrders')
    const breakfastOrders = [
      {
        id: 'breakfast-dom-001',
        type: 'delivery',
        mealType: 'breakfast',
        paymentMethod: 'Efectivo',
        total: 18000,
        settled: false,
        deliveryPerson: 'Carlos Rodríguez',
        address: { address: 'Calle 10 #5-23, Centro' },
        breakfasts: [{ category: 'desayuno', quantity: 1 }],
        payments: [{ method: 'cash', amount: 18000 }],
        customerName: 'Andrea Gutiérrez',
        customerPhone: '3067890123'
      },
      {
        id: 'breakfast-dom-002',
        type: 'delivery',
        mealType: 'breakfast',
        paymentMethod: 'Nequi',
        total: 22000,
        settled: false,
        deliveryPerson: 'Ana María',
        address: { address: 'Carrera 43 #29-15, Aranjuez' },
        breakfasts: [{ category: 'desayuno', quantity: 1 }],
        payments: [{ method: 'nequi', amount: 22000 }],
        customerName: 'Diego Ramírez',
        customerPhone: '3078901234'
      },
      {
        id: 'breakfast-dom-003',
        type: 'delivery',
        mealType: 'breakfast',
        paymentMethod: 'Efectivo',
        total: 16000,
        settled: false,
        deliveryPerson: 'Miguel Ángel',
        address: { address: 'Transversal 48 #67-89, Castilla' },
        breakfasts: [{ category: 'desayuno', quantity: 1 }],
        payments: [{ method: 'cash', amount: 16000 }],
        customerName: 'Patricia Moreno',
        customerPhone: '3089012345'
      }
    ];

    for (const order of breakfastOrders) {
      const { id, ...orderData } = order;
      await db.collection('deliveryBreakfastOrders').doc(id).set({
        ...orderData,
        createdAt: ts,
        timestamp: ts,
        date: ts,
        status: 'completed'
      });
    }

    // 4. Pedidos de desayuno salón (colección 'breakfastOrders')
    const breakfastSalonOrders = [
      {
        id: 'breakfast-mesa-001',
        type: 'dineIn',
        serviceType: 'mesa',
        mealType: 'breakfast',
        paymentMethod: 'Efectivo',
        total: 25000,
        tableNumber: 2,
        breakfasts: [{ category: 'desayuno', quantity: 1 }],
        payments: [{ method: 'cash', amount: 25000 }],
        customerName: 'Señor González',
        peopleCount: 2
      },
      {
        id: 'breakfast-llevar-001',
        type: 'takeaway',
        serviceType: 'llevar',
        mealType: 'breakfast',
        paymentMethod: 'Daviplata',
        total: 19000,
        breakfasts: [{ category: 'desayuno', quantity: 1 }],
        payments: [{ method: 'daviplata', amount: 19000 }],
        customerName: 'María José',
        customerPhone: '3090123456'
      }
    ];

    for (const order of breakfastSalonOrders) {
      const { id, ...orderData } = order;
      await db.collection('breakfastOrders').doc(id).set({
        ...orderData,
        createdAt: ts,
        timestamp: ts,
        date: ts,
        status: 'completed'
      });
    }

    // 5. Gastos del día (colección 'payments')
    const expenses = [
      {
        id: 'gasto-carnes',
        provider: 'Carnes del Valle',
        store: 'principal',
        amount: 45000,
        description: 'Compra de carnes (res, pollo, cerdo)',
        timestamp: ts,
        createdAt: ts,
        date: ts,
        category: 'insumos'
      },
      {
        id: 'gasto-verduras',
        provider: 'Verduras Frescas S.A.',
        store: 'principal',
        amount: 25000,
        description: 'Compra de verduras y frutas',
        timestamp: ts,
        createdAt: ts,
        date: ts,
        category: 'insumos'
      },
      {
        id: 'gasto-limpieza',
        provider: 'Productos de Limpieza Ltda.',
        store: 'principal',
        amount: 12000,
        description: 'Productos de limpieza y desinfección',
        timestamp: ts,
        createdAt: ts,
        date: ts,
        category: 'limpieza'
      },
      {
        id: 'gasto-utilidades',
        provider: 'EPM',
        store: 'principal',
        amount: 35000,
        description: 'Pago de servicios públicos (luz, agua, gas)',
        timestamp: ts,
        createdAt: ts,
        date: ts,
        category: 'servicios'
      }
    ];

    for (const expense of expenses) {
      const { id, ...expenseData } = expense;
      await db.collection('payments').doc(id).set(expenseData);
    }

    // 6. Inventario de proteínas (colección 'dailyProteins')
    const proteinDocuments = [
      {
        id: 'res-001',
        name: 'res',
        quantity: 25,
        remaining: 18,
        sold: 7,
        unitCost: 15000,
        date: ts
      },
      {
        id: 'pollo-001',
        name: 'pollo',
        quantity: 30,
        remaining: 22,
        sold: 8,
        unitCost: 12000,
        date: ts
      },
      {
        id: 'cerdo-001',
        name: 'cerdo',
        quantity: 15,
        remaining: 12,
        sold: 3,
        unitCost: 14000,
        date: ts
      }
    ];

    for (const protein of proteinDocuments) {
      const { id, ...proteinData } = protein;
      await db.collection('dailyProteins').doc(id).set(proteinData);
    }

    // 7. Resumen por domiciliario (colección 'deliveryPersons')
    const deliveryPersonsData = {
      'Carlos Rodríguez': {
        name: 'Carlos Rodríguez',
        date: ts,
        createdAt: ts,
        breakfast: {
          cash: 18000,
          nequi: 0,
          daviplata: 0,
          total: 18000
        },
        lunch: {
          cash: 45000,
          nequi: 52000,
          daviplata: 0,
          total: 97000
        },
        total: {
          cash: 63000,
          nequi: 52000,
          daviplata: 0,
          total: 115000
        },
        isLiquidated: false
      },
      'Ana María': {
        name: 'Ana María',
        date: ts,
        createdAt: ts,
        breakfast: {
          cash: 0,
          nequi: 22000,
          daviplata: 0,
          total: 22000
        },
        lunch: {
          cash: 41000,
          nequi: 0,
          daviplata: 38000,
          total: 79000
        },
        total: {
          cash: 41000,
          nequi: 22000,
          daviplata: 38000,
          total: 101000
        },
        isLiquidated: false
      },
      'Miguel Ángel': {
        name: 'Miguel Ángel',
        date: ts,
        createdAt: ts,
        breakfast: {
          cash: 16000,
          nequi: 0,
          daviplata: 0,
          total: 16000
        },
        lunch: {
          cash: 0,
          nequi: 47000,
          daviplata: 0,
          total: 47000
        },
        total: {
          cash: 16000,
          nequi: 47000,
          daviplata: 0,
          total: 63000
        },
        isLiquidated: false
      }
    };

    for (const [personId, data] of Object.entries(deliveryPersonsData)) {
      await db.collection('deliveryPersons').doc(personId.replace(/\s+/g, '-').toLowerCase()).set(data);
    }

    // 8. Datos históricos para gráficos (últimos 7 días)
    const ingresosData = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateISO = date.toISOString().split('T')[0];
      const dateTs = admin.firestore.Timestamp.fromDate(date);

      const dailyData = {
        date: dateTs,
        createdAt: dateTs,
        totalIncome: Math.floor(Math.random() * 200000) + 300000, // Entre 300k y 500k
        expenses: Math.floor(Math.random() * 30000) + 20000, // Entre 20k y 50k
        categories: {
          domiciliosAlmuerzo: Math.floor(Math.random() * 80000) + 120000,
          domiciliosDesayuno: Math.floor(Math.random() * 30000) + 20000,
          mesasAlmuerzo: Math.floor(Math.random() * 60000) + 80000,
          mesasDesayuno: Math.floor(Math.random() * 20000) + 15000,
          llevarAlmuerzo: Math.floor(Math.random() * 30000) + 20000,
          llevarDesayuno: Math.floor(Math.random() * 15000) + 10000
        },
        neto: 0
      };

      dailyData.neto = dailyData.totalIncome - dailyData.expenses;
      ingresosData.push(dailyData);

      await db.collection('ingresos').doc(dateISO).set(dailyData);
    }

    // 9. Estadísticas de pedidos diarios
    const pedidosDiariosData = {
      date: ts,
      createdAt: ts,
      breakfast: {
        domicilio: 3,
        mesa: 1,
        llevar: 1,
        total: 5
      },
      lunch: {
        domicilio: 5,
        mesa: 2,
        llevar: 1,
        total: 8
      },
      total: 13
    };

    await db.collection('pedidosDiariosGuardados').doc(todayISO).set(pedidosDiariosData);

    console.log('✅ Datos realistas creados exitosamente!');
    console.log('\n📊 Resumen del Día:');
    console.log('='.repeat(50));
    console.log('🍽️  PEDIDOS:');
    console.log(`   • Domicilio Almuerzo: ${domicilioAlmuerzoOrders.length}`);
    console.log(`   • Salón Almuerzo: ${salonAlmuerzoOrders.length}`);
    console.log(`   • Desayuno Domicilio: ${breakfastOrders.length}`);
    console.log(`   • Desayuno Salón: ${breakfastSalonOrders.length}`);
    console.log(`   • Total Pedidos: ${domicilioAlmuerzoOrders.length + salonAlmuerzoOrders.length + breakfastOrders.length + breakfastSalonOrders.length}`);

    console.log('\n👥 DOMICILIARIOS:');
    console.log('   • Carlos Rodríguez: $115,000');
    console.log('   • Ana María: $101,000');
    console.log('   • Miguel Ángel: $63,000');

    console.log('\n💰 INGRESOS POR MÉTODO:');
    const totalCash = domicilioAlmuerzoOrders.filter(o => o.paymentMethod === 'Efectivo').reduce((sum, o) => sum + o.total, 0) +
                     salonAlmuerzoOrders.filter(o => o.paymentMethod === 'Efectivo').reduce((sum, o) => sum + o.total, 0) +
                     breakfastOrders.filter(o => o.paymentMethod === 'Efectivo').reduce((sum, o) => sum + o.total, 0) +
                     breakfastSalonOrders.filter(o => o.paymentMethod === 'Efectivo').reduce((sum, o) => sum + o.total, 0);
    const totalNequi = domicilioAlmuerzoOrders.filter(o => o.paymentMethod === 'Nequi').reduce((sum, o) => sum + o.total, 0) +
                      salonAlmuerzoOrders.filter(o => o.paymentMethod === 'Nequi').reduce((sum, o) => sum + o.total, 0) +
                      breakfastOrders.filter(o => o.paymentMethod === 'Nequi').reduce((sum, o) => sum + o.total, 0) +
                      breakfastSalonOrders.filter(o => o.paymentMethod === 'Nequi').reduce((sum, o) => sum + o.total, 0);
    const totalDaviplata = domicilioAlmuerzoOrders.filter(o => o.paymentMethod === 'Daviplata').reduce((sum, o) => sum + o.total, 0) +
                          salonAlmuerzoOrders.filter(o => o.paymentMethod === 'Daviplata').reduce((sum, o) => sum + o.total, 0) +
                          breakfastOrders.filter(o => o.paymentMethod === 'Daviplata').reduce((sum, o) => sum + o.total, 0) +
                          breakfastSalonOrders.filter(o => o.paymentMethod === 'Daviplata').reduce((sum, o) => sum + o.total, 0);

    console.log(`   • Efectivo: $${totalCash.toLocaleString('es-CO')}`);
    console.log(`   • Nequi: $${totalNequi.toLocaleString('es-CO')}`);
    console.log(`   • Daviplata: $${totalDaviplata.toLocaleString('es-CO')}`);

    const totalIncome = totalCash + totalNequi + totalDaviplata;
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const netIncome = totalIncome - totalExpenses;

    console.log('\n💸 TOTALES:');
    console.log(`   • Ingresos Brutos: $${totalIncome.toLocaleString('es-CO')}`);
    console.log(`   • Gastos: $${totalExpenses.toLocaleString('es-CO')}`);
    console.log(`   • Ingreso Neto: $${netIncome.toLocaleString('es-CO')}`);

    console.log('\n🥩 INVENTARIO DE PROTEÍNAS:');
    proteinDocuments.forEach(protein => {
      console.log(`   • ${protein.name}: ${protein.quantity}kg (Restante: ${protein.remaining}kg)`);
    });

    console.log('\n📈 DATOS HISTÓRICOS: 7 días creados');
    console.log('\n✅ ¡Datos realistas listos para testing!');

  } catch (error) {
    console.error('❌ Error creando datos realistas:', error);
  }
}

createRealisticData().catch(console.error);
