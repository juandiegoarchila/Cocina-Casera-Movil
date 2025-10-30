import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import PrinterPlugin from '../plugins/PrinterPlugin.ts';
import QRCode from 'qrcode';
import { calculateBreakfastPrice } from '../utils/BreakfastCalculations.js';

const AutoPrintContext = createContext();

export const useAutoPrint = () => {
  const context = useContext(AutoPrintContext);
  if (!context) {
    throw new Error('useAutoPrint debe usarse dentro de AutoPrintProvider');
  }
  return context;
};

export const AutoPrintProvider = ({ children }) => {
  const [isEnabled] = useState(true); // Siempre habilitado
  const lastProcessedOrderId = useRef(null);
  const isFirstLoad = useRef(true);
  
  // Función para calcular total correcto de desayunos
  const calculateCorrectBreakfastTotal = useCallback((order) => {
    if (order.type !== 'breakfast' || !Array.isArray(order.breakfasts)) {
      return order.total || 0;
    }
    
    return order.breakfasts.reduce((sum, breakfast) => {
      const breakfastForPricing = { ...breakfast, orderType: 'table' };
      return sum + calculateBreakfastPrice(breakfastForPricing, 3);
    }, 0);
  }, []);

  // Función para obtener logo como base64
  const getLogoBase64 = useCallback(async () => {
    try {
      const response = await fetch('/logo.png');
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.warn('No se pudo cargar el logo:', error);
      return null;
    }
  }, []);

  // Función para generar recibo térmico mejorado
  const generateThermalReceipt = useCallback((order) => {
    const ESC = '\x1B';
    const GS = '\x1D';
    
    const isBreakfast = order.type === 'breakfast';
    const pago = order.payment || order.paymentMethod || 'N/A';
    
    // Calcular el total correcto para desayunos
    const totalValue = isBreakfast ? calculateCorrectBreakfastTotal(order) : order.total || 0;
    const total = totalValue.toLocaleString('es-CO') || 'N/A';
    
    const tipo = isBreakfast ? 'Desayuno' : 'Almuerzo';
    const address = (isBreakfast ? order.breakfasts?.[0]?.address : order.meals?.[0]?.address) || order.address || {};
    const direccion = address.address || '';
    const telefono = address.phoneNumber || '';
    const barrio = address.neighborhood || '';
    const detalles = address.details || '';
    const now = new Date();
    const fecha = now.toLocaleDateString('es-CO') + ' ' + now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    
    // Obtener la hora de entrega
    const timeValue = order.meals?.[0]?.time || order.breakfasts?.[0]?.time || order.time || null;
    let deliveryTime = '';
    
    if (typeof timeValue === 'string' && timeValue.trim()) {
      deliveryTime = timeValue;
    } else if (timeValue instanceof Date) {
      deliveryTime = timeValue.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    } else if (timeValue && typeof timeValue === 'object') {
      if (typeof timeValue.toDate === 'function') {
        try {
          const d = timeValue.toDate();
          deliveryTime = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
          deliveryTime = timeValue.name || '';
        }
      } else if (timeValue.name && typeof timeValue.name === 'string') {
        deliveryTime = timeValue.name;
      }
    }

    let receipt = '';
    
    // Inicializar impresora
    receipt += ESC + '@'; // Inicializar
    
    // El logo se imprime como imagen separadamente
    // Después del logo, agregar el título centrado
    receipt += ESC + 'a' + '\x01'; // Centrar texto
    receipt += ESC + '!' + '\x18'; // Texto doble altura y ancho
    receipt += 'Cocina Casera\n';
    receipt += ESC + '!' + '\x00'; // Texto normal
    receipt += '(Uso interno - No es factura DIAN)\n';
    receipt += ESC + 'a' + '\x00'; // Alinear izquierda
    receipt += '================================\n';
    
    // Información del pedido con mejor estructura
    receipt += ESC + '!' + '\x10'; // Texto en negrita
    receipt += `PEDIDO #${order.id?.slice(-8) || 'N/A'}\n`;
    receipt += ESC + '!' + '\x00'; // Texto normal
    receipt += '================================\n';
    receipt += `Tipo: ${tipo}\n`;
    receipt += `Metodo de pago: ${pago}\n`;
    receipt += ESC + '!' + '\x11'; // Texto grande
    receipt += `TOTAL: $${total}\n`;
    receipt += ESC + '!' + '\x00'; // Texto normal
    receipt += `Fecha: ${fecha}\n`;
    if (deliveryTime) receipt += `Hora entrega: ${deliveryTime}\n`;
    receipt += '================================\n';
    receipt += ESC + '!' + '\x10'; // Texto en negrita
    receipt += 'DIRECCION DE ENTREGA\n';
    receipt += ESC + '!' + '\x00'; // Texto normal
    receipt += '================================\n';
    receipt += `${direccion}\n`;
    if (barrio) receipt += `Barrio: ${barrio}\n`;
    receipt += `Telefono: ${telefono}\n`;
    if (detalles) receipt += `Detalles: ${detalles}\n`;
    receipt += '================================\n';
    
    // Resumen del pedido simplificado para térmica
    if (!isBreakfast && Array.isArray(order.meals)) {
      receipt += ESC + '!' + '\x10'; // Texto en negrita
      receipt += 'RESUMEN DEL PEDIDO\n';
      receipt += ESC + '!' + '\x00'; // Texto normal
      receipt += '================================\n';
      receipt += `${order.meals.length} ALMUERZO${order.meals.length > 1 ? 'S' : ''} EN TOTAL\n`;
      receipt += '--------------------------------\n';
      
      order.meals.forEach((meal, index) => {
        receipt += ESC + '!' + '\x08'; // Texto subrayado
        receipt += `ALMUERZO ${index + 1}:\n`;
        receipt += ESC + '!' + '\x00'; // Texto normal
        
        // Sopa
        if (meal.soup?.name === 'Solo bandeja') {
          receipt += '• Solo bandeja\n';
        } else if (meal.soupReplacement?.name) {
          receipt += `• ${meal.soupReplacement.name} (por sopa)\n`;
        } else if (meal.soup?.name && meal.soup.name !== 'Sin sopa') {
          receipt += `• ${meal.soup.name}\n`;
        }
        
        // Principio
        if (meal.principleReplacement?.name) {
          receipt += `• ${meal.principleReplacement.name} (por principio)\n`;
        } else if (Array.isArray(meal.principle) && meal.principle.length > 0) {
          const filteredPrinciples = meal.principle.filter(p => 
            !p.name.includes('Remplazo') && !p.name.includes('remplazo')
          );
          if (filteredPrinciples.length > 0) {
            const principles = filteredPrinciples.map(p => p.name).join(', ');
            receipt += `• ${principles}\n`;
          }
        }
        
        // Proteína
        const specialRice = Array.isArray(meal.principle) && 
          meal.principle.some(p => ['Arroz con pollo', 'Arroz paisa', 'Arroz tres carnes'].includes(p.name));
        
        if (!specialRice && meal.protein?.name) {
          receipt += `• ${meal.protein.name}\n`;
        }
        
        // Bebida
        if (meal.drink?.name) {
          const drinkName = meal.drink.name === 'Juego de mango' ? 'Jugo de mango' : meal.drink.name;
          receipt += `• ${drinkName}\n`;
        }
        
        // Cubiertos
        receipt += `• Cubiertos: ${meal.cutlery ? 'SI' : 'NO'}\n`;
        
        // Acompañamientos
        if (specialRice) {
          receipt += '• Acompañamientos: Ya incluidos\n';
        } else if (Array.isArray(meal.sides) && meal.sides.length > 0) {
          const sides = meal.sides.map(s => s.name).join(', ');
          receipt += `• Acompañamientos: ${sides}\n`;
        } else {
          receipt += '• Acompañamientos: Ninguno\n';
        }
        
        // Adiciones
        if (Array.isArray(meal.additions) && meal.additions.length > 0) {
          receipt += '• Adiciones:\n';
          meal.additions.forEach(addition => {
            receipt += `  - ${addition.name} (${addition.quantity || 1})\n`;
          });
        }
        
        // Notas
        if (meal.notes) {
          receipt += `• Notas: ${meal.notes}\n`;
        }
        
        if (index < order.meals.length - 1) {
          receipt += '- - - - - - - - - - - - - - - -\n';
        }
      });
    } else if (isBreakfast && Array.isArray(order.breakfasts)) {
      receipt += ESC + '!' + '\x10'; // Texto en negrita
      receipt += 'RESUMEN DEL PEDIDO\n';
      receipt += ESC + '!' + '\x00'; // Texto normal
      receipt += '================================\n';
      receipt += `${order.breakfasts.length} DESAYUNO${order.breakfasts.length > 1 ? 'S' : ''} EN TOTAL\n`;
      receipt += '--------------------------------\n';
      
      order.breakfasts.forEach((breakfast, index) => {
        receipt += ESC + '!' + '\x08'; // Texto subrayado
        receipt += `DESAYUNO ${index + 1}:\n`;
        receipt += ESC + '!' + '\x00'; // Texto normal
        
        if (breakfast.type) {
          const typeName = typeof breakfast.type === 'string' ? breakfast.type : breakfast.type?.name || '';
          receipt += `• ${typeName}\n`;
        }
        if (breakfast.broth) {
          const brothName = typeof breakfast.broth === 'string' ? breakfast.broth : breakfast.broth?.name || '';
          receipt += `• ${brothName}\n`;
        }
        if (breakfast.eggs) {
          const eggsName = typeof breakfast.eggs === 'string' ? breakfast.eggs : breakfast.eggs?.name || '';
          receipt += `• ${eggsName}\n`;
        }
        if (breakfast.riceBread) {
          const riceBreadName = typeof breakfast.riceBread === 'string' ? breakfast.riceBread : breakfast.riceBread?.name || '';
          receipt += `• ${riceBreadName}\n`;
        }
        if (breakfast.protein) {
          const proteinName = typeof breakfast.protein === 'string' ? breakfast.protein : breakfast.protein?.name || '';
          receipt += `• ${proteinName}\n`;
        }
        if (breakfast.drink) {
          const drinkName = typeof breakfast.drink === 'string' ? breakfast.drink : breakfast.drink?.name || '';
          receipt += `• ${drinkName}\n`;
        }
        
        receipt += `• Cubiertos: ${breakfast.cutlery === true ? 'SI' : 'NO'}\n`;
        
        if (breakfast.additions && breakfast.additions.length > 0) {
          receipt += '• Adiciones:\n';
          breakfast.additions.forEach(a => {
            receipt += `  - ${a.name} (${a.quantity || 1})\n`;
          });
        }
        
        if (breakfast.notes) {
          receipt += `• Notas: ${breakfast.notes}\n`;
        }
        
        if (index < order.breakfasts.length - 1) {
          receipt += '- - - - - - - - - - - - - - - -\n';
        }
      });
    }
    
    receipt += '================================\n';
    receipt += ESC + 'a' + '\x01'; // Centrar texto
    receipt += ESC + '!' + '\x10'; // Texto en negrita
    receipt += 'GRACIAS POR PEDIR EN\n';
    receipt += 'COCINA CASERA\n';
    receipt += ESC + '!' + '\x00'; // Texto normal
    receipt += '\n';
    receipt += 'Te esperamos mañana con un\n';
    receipt += 'nuevo menu.\n';
    receipt += '\n';
    receipt += 'Escribenos al 301 6476916\n';
    receipt += 'Calle 133#126c-09\n';
    receipt += ESC + 'a' + '\x00'; // Alinear izquierda
    receipt += '================================\n';
    receipt += ESC + 'a' + '\x01'; // Centrar texto
    receipt += 'Escanea este codigo QR para\n';
    receipt += 'unirte a nuestro canal de\n';
    receipt += 'WhatsApp y recibir nuestro\n';
    receipt += 'menu diario:\n';
    receipt += '\n';
    
    // Generar QR code nativo para WhatsApp con tamaño optimizado para 80mm
    receipt += GS + '(k' + '\x04' + '\x00' + '\x31' + '\x41' + '\x32' + '\x00'; // QR setup
    receipt += GS + '(k' + '\x03' + '\x00' + '\x31' + '\x43' + '\x05'; // QR size 5 (optimizado para 80mm)
    receipt += GS + '(k' + '\x03' + '\x00' + '\x31' + '\x45' + '\x31'; // QR error correction level M
    
    // Datos del QR (canal de WhatsApp)
    const qrData = 'https://whatsapp.com/channel/0029VafyYdVAe5VskWujmK0C';
    const qrLength = qrData.length + 3;
    const qrLenLow = qrLength % 256;
    const qrLenHigh = Math.floor(qrLength / 256);
    
    receipt += GS + '(k' + String.fromCharCode(qrLenLow, qrLenHigh) + '\x00' + '\x31' + '\x50' + '\x30' + qrData;
    receipt += GS + '(k' + '\x03' + '\x00' + '\x31' + '\x51' + '\x30'; // Imprimir QR
    
    receipt += '\n\n';
    receipt += ESC + 'a' + '\x00'; // Alinear izquierda
    receipt += '================================\n';
    receipt += '\n\n';
    
    // Cortar papel
    receipt += GS + 'V' + '\x41' + '\x03'; // Corte parcial
    
    return receipt;
  }, [calculateCorrectBreakfastTotal]);

  // Función de impresión automática
  const printOrderAutomatically = useCallback(async (order) => {
    try {
      console.log('🖨️ [GLOBAL-AUTO-PRINT] Iniciando impresión automática para:', order.id);
      
      const currentPrinterIp = localStorage.getItem('printerIp') || '192.168.1.100';
      const currentPrinterPort = parseInt(localStorage.getItem('printerPort')) || 9100;
      
      const thermalData = generateThermalReceipt(order);
      const logoBase64 = await getLogoBase64();
      
      if (logoBase64) {
        await PrinterPlugin.printWithImage({
          ip: currentPrinterIp,
          port: currentPrinterPort,
          data: thermalData,
          imageBase64: logoBase64
        });
      } else {
        await PrinterPlugin.printTCP({
          ip: currentPrinterIp,
          port: currentPrinterPort,
          data: thermalData
        });
      }
      
      console.log('✅ [GLOBAL-AUTO-PRINT] Pedido impreso exitosamente:', order.id);
      
    } catch (error) {
      console.warn('⚠️ [GLOBAL-AUTO-PRINT] Error en impresión:', error);
    }
  }, [generateThermalReceipt, getLogoBase64]);

  // Efecto para escuchar nuevos pedidos en tiempo real
  useEffect(() => {
    if (!isEnabled) return;

    console.log('🔄 [GLOBAL-AUTO-PRINT] Iniciando listener global de pedidos');

    // Crear listener para la colección de pedidos
    const ordersQuery = query(
      collection(db, 'orders'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
      console.log('📡 [GLOBAL-AUTO-PRINT] Snapshot recibido, cambios:', snapshot.docChanges().length);

      // En la primera carga, solo marcar el pedido más reciente sin imprimir
      if (isFirstLoad.current) {
        const docs = snapshot.docs;
        if (docs.length > 0) {
          const mostRecentOrder = docs[0];
          lastProcessedOrderId.current = mostRecentOrder.id;
          console.log('🏁 [GLOBAL-AUTO-PRINT] Primera carga - último pedido marcado:', mostRecentOrder.id);
        }
        isFirstLoad.current = false;
        return;
      }

      // Procesar solo los cambios nuevos (documentos añadidos)
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const newOrder = { id: change.doc.id, ...change.doc.data() };
          
          console.log('🆕 [GLOBAL-AUTO-PRINT] Nuevo pedido detectado:', {
            id: newOrder.id,
            type: newOrder.type,
            status: newOrder.status,
            lastProcessed: lastProcessedOrderId.current
          });

          // Solo imprimir si es realmente un pedido nuevo (no procesado antes)
          if (newOrder.id !== lastProcessedOrderId.current) {
            // Verificar que es un pedido de hoy
            const today = new Date().toISOString().split('T')[0];
            let orderDate = '';
            
            if (newOrder.createdAt?.toDate) {
              orderDate = newOrder.createdAt.toDate().toISOString().split('T')[0];
            } else if (newOrder.createdAt instanceof Date) {
              orderDate = newOrder.createdAt.toISOString().split('T')[0];
            } else if (typeof newOrder.createdAt === 'string') {
              orderDate = new Date(newOrder.createdAt).toISOString().split('T')[0];
            }

            if (orderDate === today && newOrder.status !== 'Cancelado') {
              console.log('🎯 [GLOBAL-AUTO-PRINT] Imprimiendo pedido nuevo del día:', newOrder.id);
              printOrderAutomatically(newOrder);
              lastProcessedOrderId.current = newOrder.id;
            } else {
              console.log('⏭️ [GLOBAL-AUTO-PRINT] Saltando pedido (no es de hoy o está cancelado):', newOrder.id);
            }
          } else {
            console.log('⏭️ [GLOBAL-AUTO-PRINT] Saltando pedido ya procesado:', newOrder.id);
          }
        }
      });
    }, (error) => {
      console.error('❌ [GLOBAL-AUTO-PRINT] Error en listener:', error);
    });

    return () => {
      console.log('🔌 [GLOBAL-AUTO-PRINT] Desconectando listener global');
      unsubscribe();
    };
  }, [isEnabled, printOrderAutomatically]);

  const value = {
    isEnabled,
    printOrderAutomatically
  };

  return (
    <AutoPrintContext.Provider value={value}>
      {children}
    </AutoPrintContext.Provider>
  );
};