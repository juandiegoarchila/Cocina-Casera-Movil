// src/components/Waiter/CajaPOS.js
import React, { useState, useEffect, useMemo, useRef } from 'react';
import QRCode from 'qrcode';
import { db } from '../../config/firebase';
import { collection, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { CurrencyDollarIcon, PlusCircleIcon, PencilIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../Auth/AuthProvider';
import PrinterPlugin from '../../plugins/PrinterPlugin.ts';

const formatPrice = (v) => new Intl.NumberFormat('es-CO',{ style:'currency', currency:'COP', maximumFractionDigits:0 }).format(v||0);

const CajaPOS = ({ theme='dark', setError=()=>{}, setSuccess=()=>{} }) => {
  const { role } = useAuth(); // 2 = admin, 3 = mesera

  // Estado principal
  const [posItems, setPosItems] = useState([]);
  const [cartItems, setCartItems] = useState([]); // {id, refId, name, price, quantity}
  const [posOrderType, setPosOrderType] = useState('almuerzo');
  const [posTableNumber, setPosTableNumber] = useState('');
  const [posPaymentMethod, setPosPaymentMethod] = useState('efectivo');
  const [posCashAmount, setPosCashAmount] = useState('');
  const [posCalculatedChange, setPosCalculatedChange] = useState(0);
  const [posNote, setPosNote] = useState('');
  const [posStage, setPosStage] = useState('select'); // 'select' | 'pay'

  // Estados para impresora nativa
  const [showPrinterConfig, setShowPrinterConfig] = useState(false);
  const [printerModel, setPrinterModel] = useState('epson-tm-t20ii-ethernet');
  const [printerIp, setPrinterIp] = useState('192.168.1.100');
  const [printerPort, setPrinterPort] = useState(9100);
  const [printerTestResults, setPrinterTestResults] = useState([]);
  const [isDetecting, setIsDetecting] = useState(false);

  // Modelos de impresoras disponibles
  const printerModels = [
    { id: 'epson-tm-t20ii-ethernet', name: 'Epson TM-T20II (Ethernet)', port: 9100 },
    { id: 'epson-tm-t88v', name: 'Epson TM-T88V', port: 9100 },
    { id: 'epson-tm-t82', name: 'Epson TM-T82', port: 9100 },
    { id: 'star-tsp143', name: 'Star TSP143', port: 9100 },
    { id: 'star-tsp650', name: 'Star TSP650', port: 9100 },
    { id: 'bixolon-srp-350', name: 'Bixolon SRP-350', port: 9100 },
    { id: 'citizen-ct-s310a', name: 'Citizen CT-S310A', port: 9100 },
    { id: 'zebra-zd220', name: 'Zebra ZD220', port: 9100 },
    { id: 'autodetect', name: '🔍 Autodetectar Modelo', port: 9100 },
    { id: 'manual', name: '⚙️ Configuración Manual', port: 9100 }
  ];

  // Editor de artículos
  const [showItemEditor, setShowItemEditor] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemEditorMode, setItemEditorMode] = useState('color'); // 'color' | 'image'
  const [itemColor, setItemColor] = useState('#fb923c');
  const [itemShape, setItemShape] = useState('circle'); // circle | square | hex | outline
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemType, setItemType] = useState('almuerzo_mesa');
  const [itemCategory, setItemCategory] = useState('');
  const [itemImageData, setItemImageData] = useState(null);
  const [itemActive, setItemActive] = useState(true);

  // Filtro de categorías
  const [categoryFilter, setCategoryFilter] = useState('');

  const colorPalette = ['#fb923c','#fbbf24','#10b981','#0ea5e9','#6366f1','#ec4899','#f43f5e','#6b7280','#f59e0b'];
  const shapeOptions = [
    { id:'circle', label:'Círculo' },
    { id:'square', label:'Cuadrado' },
    { id:'hex', label:'Hexágono' },
    { id:'outline', label:'Borde' }
  ];

  // Suscripción a items POS
  useEffect(()=>{
    const unsub = onSnapshot(collection(db,'posItems'), snap => {
      const docs = snap.docs.map(d => ({ id:d.id, ...d.data() }))
        .sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
      setPosItems(docs);
    });
    return () => unsub && unsub();
  },[]);

  // Derivados
  const activeItems = useMemo(()=> posItems.filter(i => i.active!==false), [posItems]);
  const categories = useMemo(()=> { const s=new Set(); activeItems.forEach(i=>{ if(i.category) s.add(i.category); }); return Array.from(s).sort(); }, [activeItems]);
  const filteredItems = useMemo(()=> categoryFilter ? activeItems.filter(i=>i.category===categoryFilter) : activeItems, [activeItems, categoryFilter]);
  const groupedItems = useMemo(()=>{
    const map = new Map();
    filteredItems.forEach(it => { const k = it.category || ''; if(!map.has(k)) map.set(k, []); map.get(k).push(it); });
    return Array.from(map.entries()).map(([category, items]) => ({ category, items }));
  }, [filteredItems]);
  const cartTotal = useMemo(()=> cartItems.reduce((s,i)=> s + i.price * i.quantity, 0), [cartItems]);

  // Scroll vertical del catálogo (sin indicador de categoría)

  // Cambio efectivo
  useEffect(()=>{
    if (posPaymentMethod !== 'efectivo' || !posCashAmount){ setPosCalculatedChange(0); return; }
    const paid = parseFloat(posCashAmount)||0;
    setPosCalculatedChange(paid - cartTotal > 0 ? Math.round(paid - cartTotal) : 0);
  },[posCashAmount,posPaymentMethod,cartTotal]);

  // Carrito
  const handleAddPosItem = (item) => {
    setCartItems(prev => {
      const existing = prev.find(ci=>ci.refId===item.id);
      if (existing) return prev.map(ci => ci.refId===item.id ? { ...ci, quantity: ci.quantity+1 } : ci);
      // incluir tipo y categoría para mejor inferencia en dashboards
      return [
        ...prev,
        {
          id: `${item.id}-${Date.now()}`,
          refId: item.id,
          name: item.name,
          price: Number(item.price||0),
          quantity: 1,
          type: item.type || null,
          category: item.category || null,
        }
      ];
    });
  };
  const updateCartItemQuantity = (id, qty) => setCartItems(prev => prev.filter(ci => (ci.id===id && qty<=0)? false : true).map(ci => ci.id===id ? { ...ci, quantity: qty } : ci));
  const removeCartItem = (id) => setCartItems(prev => prev.filter(ci=>ci.id!==id));
  const resetCart = () => { setCartItems([]); setPosCashAmount(''); setPosCalculatedChange(0); setPosNote(''); setPosStage('select'); };

  // Funciones de impresora nativa
  const addTestResult = (message) => {
    const timestamp = new Date().toLocaleTimeString('es-CO', { hour12: true });
    setPrinterTestResults(prev => [...prev, `${timestamp}: ${message}`]);
  };

  const clearTestResults = () => setPrinterTestResults([]);

  const handlePrinterModelChange = (modelId) => {
    setPrinterModel(modelId);
    const model = printerModels.find(m => m.id === modelId);
    if (model && model.port !== 9100) {
      setPrinterPort(model.port);
    }
  };

  const testPrinterConnection = async () => {
    addTestResult('Iniciando conexión universal...');
    addTestResult(`Probando conexión TCP nativa a ${printerIp}:${printerPort}`);
    
    try {
      const result = await PrinterPlugin.testConnection({
        ip: printerIp,
        port: printerPort
      });
      
      if (result.success) {
        addTestResult('Conectado vía TCP nativo (como Loyverse)');
        setSuccess('✅ Conexión exitosa con impresora');
      } else {
        addTestResult(`Error de conexión nativa: ${result.error}`);
        setError('❌ No se pudo conectar a la impresora');
      }
    } catch (error) {
      addTestResult(`Error de conexión nativa: Error: ${error.message}`);
      setError('❌ Error al probar conexión');
    }
  };

  const testPrint = async () => {
    addTestResult('Iniciando impresión universal...');
    addTestResult('Iniciando conexión universal...');
    addTestResult(`Probando conexión TCP nativa a ${printerIp}:${printerPort}`);
    
    try {
      // Generar datos de prueba para impresión
      const testData = `
        Cocina Casera
        ================================
        PRUEBA DE IMPRESIÓN
        ================================
        Fecha: ${new Date().toLocaleString('es-CO')}
        IP: ${printerIp}:${printerPort}
        Modelo: ${printerModels.find(m => m.id === printerModel)?.name || 'Manual'}
        ================================
        Esta es una prueba de impresión
        desde el plugin nativo de
        Capacitor para Android.
        ================================
        ¡Todo funciona correctamente!
        
        
        
      `;
      
      addTestResult('Conectado vía TCP nativo (como Loyverse)');
      addTestResult('Enviando vía TCP nativo...');
      
      const result = await PrinterPlugin.printTCP({
        ip: printerIp,
        port: printerPort,
        data: testData
      });
      
      if (result.success) {
        addTestResult('Impresión TCP nativa exitosa');
        setSuccess('✅ Impresión de prueba exitosa');
      } else {
        addTestResult(`Error de impresión: ${result.error}`);
        setError('❌ Error en impresión de prueba');
      }
    } catch (error) {
      addTestResult(`Error de impresión: Error: ${error.message}`);
      setError('❌ Error al imprimir');
    }
  };

  const testCashDrawer = async () => {
    addTestResult('Abriendo caja registradora...');
    addTestResult('Iniciando conexión universal...');
    addTestResult(`Probando conexión TCP nativa a ${printerIp}:${printerPort}`);
    
    try {
      addTestResult('Conectado vía TCP nativo (como Loyverse)');
      addTestResult('Enviando comando de apertura vía TCP nativo...');
      
      const result = await PrinterPlugin.openCashDrawer({
        ip: printerIp,
        port: printerPort
      });
      
      if (result.success) {
        addTestResult('Caja abierta exitosamente');
        addTestResult('Prueba de caja exitosa');
        setSuccess('✅ Caja registradora abierta');
      } else {
        addTestResult(`Error al abrir caja: ${result.error}`);
        addTestResult('No se pudo conectar para abrir caja');
        setError('❌ Error al abrir caja registradora');
      }
    } catch (error) {
      addTestResult(`Error al abrir caja: Error: ${error.message}`);
      addTestResult('No se pudo conectar para abrir caja');
      setError('❌ Error al abrir caja registradora');
    }
  };

  const autodetectPrinter = async () => {
    setIsDetecting(true);
    addTestResult('Iniciando autodetección...');
    addTestResult('Buscando impresoras en red local...');
    
    try {
      const result = await PrinterPlugin.autodetectPrinter({
        baseIp: '192.168.1',
        startRange: 100,
        endRange: 110,
        port: printerPort
      });
      
      if (result.success) {
        setPrinterIp(result.ip);
        addTestResult(`Impresora encontrada en ${result.ip}:${result.port}`);
        setSuccess(`✅ Impresora encontrada: ${result.ip}`);
      } else {
        addTestResult(result.error || 'No se encontraron impresoras');
        setError('❌ No se encontraron impresoras');
      }
    } catch (error) {
      addTestResult(`Error en autodetección: ${error.message}`);
      setError('❌ Error en autodetección');
    } finally {
      setIsDetecting(false);
    }
  };

  const runCompleteTest = async () => {
    addTestResult('Iniciando prueba completa...');
    await testPrinterConnection();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await testPrint();
    await new Promise(resolve => setTimeout(resolve, 3000));
    await testCashDrawer();
  };

  // Sugerencias híbridas escaladas: para totales grandes agregar 60k,70k,80k...
  const quickCashSuggestions = useMemo(()=>{
    const t = cartTotal;
    if (t <= 0) return [];
    const set = new Set();
    const add = v => { if (v>t) set.add(v); };

    // Siempre el siguiente múltiplo de 1000 inmediato
    const next1k = Math.ceil((t+1)/1000)*1000;
    add(next1k);

    if (t >= 40000) {
      // Para montos grandes: saltos de 10k (ej: 60k 70k 80k ...)
      const startTen = Math.ceil((t+1)/10000)*10000; // primer múltiplo de 10k > t
      for (let i=0;i<4;i++) add(startTen + i*10000);
    } else {
      // Para montos pequeños conservar estrategia previa
      const next5k = Math.ceil((t+1)/5000)*5000;
      const next10k = Math.ceil((t+1)/10000)*10000;
      add(next5k);
      add(next10k);
      [20000,50000,100000].forEach(add);
    }

    // Escalado adicional para montos muy altos (>100k): bloques de 50k
    if (t >= 100000) {
      const start50 = Math.ceil((t+1)/50000)*50000;
      add(start50);
      add(start50 + 50000);
    }

    const arr = Array.from(set).sort((a,b)=>a-b);
    const limit = t >= 40000 ? 6 : 4; // más sugerencias cuando el total es grande
    return arr.slice(0, limit);
  },[cartTotal]);

  // Desglose de cambio sugerido (greedy) para COP
  const changeBreakdown = useMemo(()=>{
    if (posPaymentMethod !== 'efectivo') return [];
    const change = posCalculatedChange;
    if (change <= 0) return [];
    const denoms = [50000,20000,10000,5000,2000,1000];
    let remaining = change;
    const parts = [];
    for (const d of denoms){
      if (remaining <= 0) break;
      const q = Math.floor(remaining / d);
      if (q>0){ parts.push({ d, q }); remaining -= q*d; }
    }
    return parts;
  },[posCalculatedChange,posPaymentMethod]);

  // Procesar venta
  const handleProcessPosSale = async () => {
    if (cartItems.length===0) return setError('Agrega artículos');
    if (posStage==='select'){ setPosStage('pay'); return; }
    try {
      // Determinar efectivo recibido y cambio antes de construir payload
      let cashReceived = null;
      let changeGiven = 0;
      if (posPaymentMethod==='efectivo'){
        if (posCashAmount){
          cashReceived = parseFloat(posCashAmount)||0;
          changeGiven = posCalculatedChange;
        } else {
          cashReceived = cartTotal; // exacto implícito
          changeGiven = 0;
        }
      }
      // Inferir servicio (mesa/llevar) y tipo de comida (almuerzo/desayuno)
      const tableNum = (posTableNumber||'').trim();
      const serviceType = tableNum ? 'mesa' : 'llevar';
      const hasBreakfastItem = cartItems.some(ci => {
        const t = (ci.type || (posItems.find(p=>p.id===ci.refId)?.type) || '').toLowerCase();
        return t.includes('desayun') || t.includes('breakfast');
      });
      const inferredMeal = (/desayun/i.test(posOrderType) || hasBreakfastItem) ? 'desayuno' : 'almuerzo';
      const orderTypeNormalized = `${inferredMeal}_${serviceType}`; // ej: desayuno_mesa, almuerzo_llevar

      const payload = {
        orderType: inferredMeal, // compat: campo anterior
        orderTypeNormalized,     // nuevo: usado por dashboards
        serviceType,             // 'mesa' | 'llevar'
        isPaid: true,
        status: 'Completada',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        paymentDate: serverTimestamp(),
        paymentMethod: posPaymentMethod,
        paymentAmount: cartTotal,
        total: cartTotal,
        paymentNote: posNote || '',
        items: cartItems.map(ci=>({
          id: ci.refId,
          name: ci.name,
          unitPrice: ci.price,
          quantity: ci.quantity,
          type: ci.type || (posItems.find(p=>p.id===ci.refId)?.type) || null,
          category: ci.category || (posItems.find(p=>p.id===ci.refId)?.category) || null,
        }))
      };
      if (tableNum) payload.tableNumber = tableNum; else payload.takeaway = true;
      if (posPaymentMethod==='efectivo'){
        payload.cashReceived = cashReceived;
        payload.changeGiven = changeGiven;
      }
      const collectionName = (inferredMeal==='desayuno') ? 'breakfastOrders' : 'tableOrders';
      payload.__collection = collectionName; // pista para normalizadores
      const docRef = await addDoc(collection(db, collectionName), payload);
      // Imprimir recibo (solo en cliente)
      try {
        printReceipt({
          id: docRef.id,
          date: new Date(),
          items: cartItems,
            // Totales
          total: cartTotal,
          paymentMethod: posPaymentMethod,
          cashReceived,
          changeGiven,
          changeBreakdown,
          note: posNote,
          orderType: payload.orderType,
          orderTypeNormalized: payload.orderTypeNormalized,
          serviceType: payload.serviceType,
          tableNumber: payload.tableNumber,
          takeaway: payload.takeaway,
        });
      } catch(printErr){ /* silenciar errores de impresión */ }
      setSuccess('✅ Venta registrada');
      resetCart();
    }catch(err){ setError('Error registrando venta: '+err.message); }
  };

  // Helper para imprimir recibo (híbrido: web + nativo)
  const printReceipt = async ({ id, date, items, total, paymentMethod, cashReceived, changeGiven, note, orderType, orderTypeNormalized, serviceType, tableNumber, takeaway }) => {
    const fecha = date.toLocaleString('es-CO');
    const kind = (orderTypeNormalized?.split('_')[0] || orderType || '').toLowerCase();
    const svc = (orderTypeNormalized?.split('_')[1] || serviceType || (tableNumber ? 'mesa' : (takeaway ? 'llevar' : ''))).toLowerCase();
    const cap = (s) => s ? s.charAt(0).toUpperCase()+s.slice(1) : '';
    const tipoLabel = `${cap(kind)} ${svc ? cap(svc) : ''}`.trim();

    // Generar recibo de texto para impresora térmica
    const generateThermalReceipt = () => {
      let receipt = '';
      
      // Comandos ESC/POS para centrar texto y configurar impresión
      const ESC = '\x1B';
      const GS = '\x1D';
      
      // Inicializar impresora
      receipt += ESC + '@'; // Inicializar
      
      // El logo se imprime como imagen separadamente, así que empezamos con info
      receipt += ESC + 'a' + '\x01'; // Centrar texto
      receipt += ESC + '!' + '\x08'; // Texto en negrita
      receipt += 'COCINA CASERA\n';
      receipt += ESC + '!' + '\x00'; // Texto normal
      receipt += '(Uso interno - No es factura DIAN)\n';
      receipt += '\n';
      
      // Línea divisoria
      receipt += ESC + 'a' + '\x00'; // Alinear izquierda
      receipt += '================================\n';
      
      // Información del pedido
      receipt += `TIPO: ${tipoLabel}\n`;
      if (tableNumber) receipt += `MESA: ${tableNumber}\n`;
      receipt += `FECHA: ${fecha}\n`;
      receipt += `ID: ${id.substring(0, 8)}\n`;
      if (note) receipt += `NOTA: ${note}\n`;
      receipt += '================================\n';
      
      // Items del pedido
      receipt += ESC + '!' + '\x08'; // Texto en negrita
      receipt += 'ITEMS:\n';
      receipt += ESC + '!' + '\x00'; // Texto normal
      
      items.forEach(item => {
        const qty = Number(item.quantity || 0);
        const unit = Number(item.price || 0);
        const lineTotal = qty * unit;
        
        // Nombre del item (línea completa)
        receipt += `${item.name}\n`;
        
        // Cantidad, precio unitario y total (alineado)
        const qtyText = `${qty}x`;
        const unitText = `$${unit.toLocaleString('es-CO')}`;
        const totalText = `$${lineTotal.toLocaleString('es-CO')}`;
        
        // Crear línea con espaciado
        const lineContent = `  ${qtyText} ${unitText}`;
        const spaces = ' '.repeat(Math.max(1, 32 - lineContent.length - totalText.length));
        receipt += `${lineContent}${spaces}${totalText}\n`;
      });
      
      receipt += '================================\n';
      
      // Totales
      receipt += ESC + '!' + '\x08'; // Texto en negrita
      const totalText = `TOTAL: $${total.toLocaleString('es-CO')}`;
      receipt += totalText + '\n';
      receipt += ESC + '!' + '\x00'; // Texto normal
      
      // Información de pago
      receipt += `PAGO: ${paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1)}\n`;
      if (paymentMethod === 'efectivo') {
        receipt += `RECIBIDO: $${(cashReceived || 0).toLocaleString('es-CO')}\n`;
        receipt += `VUELTOS: $${(changeGiven || 0).toLocaleString('es-CO')}\n`;
      }
      
      receipt += '================================\n';
      receipt += ESC + 'a' + '\x01'; // Centrar texto
      receipt += ESC + '!' + '\x08'; // Texto en negrita
      receipt += '¡Gracias por su compra!\n';
      receipt += ESC + '!' + '\x00'; // Texto normal
      receipt += '\n';
      receipt += 'Te esperamos mañana con un\n';
      receipt += 'nuevo menu.\n';
      receipt += 'Escribenos al 301 6476916\n';
      receipt += 'Calle 133#126c-09\n';
      receipt += '\n';
      
      // QR Code para WhatsApp (si la impresora lo soporta)
      receipt += 'Escanea nuestro QR para\n';
      receipt += 'recibir el menu diario:\n';
      receipt += '\n';
      
      // Generar QR code simple (algunos comandos ESC/POS)
      receipt += GS + '(k' + '\x04' + '\x00' + '\x31' + '\x41' + '\x32' + '\x00'; // QR setup
      receipt += GS + '(k' + '\x03' + '\x00' + '\x31' + '\x43' + '\x08'; // QR size
      receipt += GS + '(k' + '\x03' + '\x00' + '\x31' + '\x45' + '\x30'; // QR error correction
      
      // Datos del QR (WhatsApp)
      const qrData = 'https://wa.me/573016476916?text=Hola%20quiero%20el%20menu';
      const qrLength = qrData.length + 3;
      const qrLenLow = qrLength % 256;
      const qrLenHigh = Math.floor(qrLength / 256);
      receipt += GS + '(k' + String.fromCharCode(qrLenLow, qrLenHigh) + '\x00' + '\x31' + '\x50' + '\x30' + qrData;
      receipt += GS + '(k' + '\x03' + '\x00' + '\x31' + '\x51' + '\x30'; // Imprimir QR
      
      receipt += '\n\n\n';
      
      // Cortar papel
      receipt += GS + 'V' + '\x41' + '\x03'; // Corte parcial
      
      return receipt;
    };

    // Función para convertir imagen a base64
    const getLogoBase64 = async () => {
      try {
        const response = await fetch('/logo.png');
        const blob = await response.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result.split(',')[1]; // Remover prefijo data:image/png;base64,
            resolve(base64);
          };
          reader.readAsDataURL(blob);
        });
      } catch (error) {
        console.warn('No se pudo cargar el logo:', error);
        return null;
      }
    };

    // Intentar impresión nativa primero (si está configurada)
    try {
      if (printerIp && printerPort) {
        const thermalData = generateThermalReceipt();
        const logoBase64 = await getLogoBase64();
        
        if (logoBase64) {
          // Usar la nueva función con imagen
          await PrinterPlugin.printWithImage({
            ip: printerIp,
            port: printerPort,
            data: thermalData,
            imageBase64: logoBase64
          });
        } else {
          // Usar función básica sin imagen
          await PrinterPlugin.printTCP({
            ip: printerIp,
            port: printerPort,
            data: thermalData
          });
        }
        console.log('✅ Recibo impreso en impresora térmica');
      }
    } catch (error) {
      console.warn('⚠️ Fallo impresión térmica, usando método web:', error);
    }

    // Impresión web como respaldo (siempre)
    if (typeof window === 'undefined') return;
    const win = window.open('', 'PRINT', 'height=650,width=420');
    if(!win) return;
    
    // Generar QR canal WhatsApp
    let qrDataUrl = '';
    try {
      qrDataUrl = await QRCode.toDataURL('https://wa.me/573016476916?text=Hola%20quiero%20el%20menú');
    } catch(err) { /* ignorar */ }
    
    // Construir items html mostrando total por línea a la derecha
    const itemsHtml = items.map(it => {
      const qty = Number(it.quantity||0);
      const unit = Number(it.price||0);
      const lineTotal = qty * unit;
      return `
        <div class='it-row'>
          <div class='it-left'>
            <div class='it-name'>${it.name}</div>
            <div class='it-line'>${qty}x ${formatPrice(unit)}</div>
          </div>
          <div class='it-right'>${formatPrice(lineTotal)}</div>
        </div>`;
    }).join('');
    win.document.write(`
      <html><head><title>Recibo</title>
      <meta charset='utf-8'/>
      <style>
        body { font-family: monospace; font-size: 13px; margin:0; padding:0 12px; }
        h2 { margin:4px 0 6px; font-size:18px; text-align:center; }
        .line { border-bottom:2px solid #000; margin:8px 0; height:0; }
        .logo { text-align:center; margin-top:6px; }
        .logo img { 
          width:110px; 
          height:auto; 
          filter:brightness(0) contrast(1.5); 
          image-rendering: crisp-edges;
          display: block;
          margin: 0 auto;
          max-width: 110px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .meta div { padding:2px 0; }
        .thanks { text-align:center; margin-top:14px; font-weight:bold; }
        .contact { text-align:center; margin-top:8px; }
        .qr-container { text-align:center; margin-top:14px; }
        .qr-text { font-size:11px; margin-bottom:4px; }
        .small { font-size:11px; }
  .it-row { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:6px; }
  .it-left { flex:1; min-width:0; }
  .it-name { font-weight:bold; }
  .it-line { padding-left:4px; }
  .it-right { min-width:70px; text-align:right; font-weight:bold; }
      </style>
      </head><body>
        <div class='logo'>
          <img src="/logo.png" alt="Logo" />
          <h2>Cocina Casera</h2>
          <div style='text-align:center; font-size:12px; margin-top:4px; font-weight:bold;'>(Uso interno - No es factura DIAN)</div>
        </div>
        <div class='line'></div>
        <div class='meta'>
          <div><b>Tipo:</b> ${tipoLabel}</div>
          ${tableNumber ? `<div><b>Mesa:</b> ${tableNumber}</div>` : ''}
          <div><b>Fecha:</b> ${fecha}</div>
          ${note ? `<div><b>Nota:</b> ${note}</div>`:''}
        </div>
        <div class='line'></div>
        <div><b>Items:</b></div>
        ${itemsHtml}
        <div class='line'></div>
        <div><b>Total:</b> ${formatPrice(total)}</div>
        <div><b>Pago:</b> ${paymentMethod.charAt(0).toUpperCase()+paymentMethod.slice(1)}</div>
        ${paymentMethod==='efectivo' ? `<div><b>Recibido:</b> ${formatPrice(cashReceived||0)}</div>`:''}
        ${paymentMethod==='efectivo' ? `<div><b>Vueltos:</b> ${formatPrice(changeGiven||0)}</div>`:''}
        <div class='line'></div>
        <div class='thanks'>¡Gracias por su compra!</div>
        <div class='contact'>Te esperamos mañana con un<br>nuevo menú.<br>Escríbenos al <strong>301 6476916</strong><br><strong>Calle 133#126c-09</strong></div>
        <div class='qr-container'>
          <div class='qr-text'>Escanea este código QR para unirte a nuestro canal de WhatsApp<br>y recibir nuestro menú diario:</div>
          ${qrDataUrl ? `<img src='${qrDataUrl}' width='140' height='140' />` : ''}
        </div>
        <br/><br/>
      </body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(()=>{ win.print(); setTimeout(()=>win.close(), 400); }, 400);
  };

  // Editor de items
  const openNewItemEditor = () => {
    setEditingItem(null);
    setItemEditorMode('color');
    setItemColor('#fb923c');
    setItemShape('circle');
    setItemName('');
    setItemPrice('');
    setItemType('almuerzo_mesa'); // por defecto
    setItemCategory('');
    setItemImageData(null);
    setItemActive(true);
    setShowItemEditor(true);
  };
  const openEditItem = (item) => {
    const legacyToNew = (t) => {
      if (!t) return 'almuerzo_mesa';
      if (t === 'almuerzo') return 'almuerzo_mesa';
      if (t === 'desayuno') return 'desayuno_mesa';
      if (t === 'general') return 'almuerzo_llevar';
      return t; // ya es nuevo
    };
    setEditingItem(item);
    setItemEditorMode(item.imageData ? 'image':'color');
    setItemColor(item.color||'#fb923c');
    setItemShape(item.shape||'circle');
    setItemName(item.name||'');
    setItemPrice(item.price!=null? String(item.price):'');
    setItemType(legacyToNew(item.type));
    setItemCategory(item.category||'');
    setItemImageData(item.imageData||null);
    setItemActive(item.active!==false);
    setShowItemEditor(true);
  };

  const handleSaveItem = async () => {
    if(!itemName.trim()||!itemPrice) return setError('Nombre y precio obligatorios');
    const base = { name:itemName.trim(), price:Math.round(Number(itemPrice)||0), type:itemType, category:itemCategory.trim()||null, color:itemEditorMode==='color'?itemColor:null, shape:itemEditorMode==='color'?itemShape:null, imageData:itemEditorMode==='image'?itemImageData:null, active:itemActive, sortOrder: editingItem?.sortOrder || Date.now() };
    try {
      if (editingItem) { const { updateDoc, doc } = await import('firebase/firestore'); await updateDoc(doc(db,'posItems',editingItem.id), base); setSuccess('Artículo actualizado'); }
      else { await addDoc(collection(db,'posItems'), base); setSuccess('Artículo creado'); }
      setShowItemEditor(false);
    }catch(err){ setError('Error guardando: '+err.message); }
  };
  const handleImageFile = (e) => { const f=e.target.files?.[0]; if(!f)return; const r=new FileReader(); r.onload=ev=>setItemImageData(ev.target.result); r.readAsDataURL(f); };

  const CategoryFilter = ({ current, onSelect }) => (
    <div className="flex items-center gap-2 text-xs">
      <select value={current} onChange={(e)=>onSelect(e.target.value)} className="px-2 py-1 rounded bg-gray-700 text-gray-200">
        <option value="">Todas</option>
        {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
      </select>
      {current && <button onClick={()=>onSelect('')} className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-gray-100">Limpiar</button>}
    </div>
  );

  return (
  <div className="w-full mx-auto px-3 sm:px-6 py-4 lg:py-3 lg:h-[calc(100vh-5rem)] lg:overflow-hidden">

  <div className={`grid grid-cols-1 ${posStage==='pay' ? 'lg:grid-cols-[440px_1fr]' : 'lg:grid-cols-3'} gap-4 items-start h-full`}>
        {/* Catálogo (columna izquierda 2/3) */}
  <div className={`${posStage==='select' ? 'lg:col-span-2' : 'lg:w-[440px]'} flex flex-col h-full relative min-w-0 min-h-0`}>
          {posStage==='select' ? (
            <>
              {/* Header Catálogo */}
              <div className="sticky top-0 z-20 -mx-3 sm:-mx-6 lg:mx-0 mb-4">
                <div className="relative overflow-hidden backdrop-blur-md bg-gradient-to-r from-gray-800/90 via-gray-800/80 to-gray-800/90 border border-gray-700/60 rounded-b-xl rounded-t-lg lg:rounded-xl shadow-xl px-4 py-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-inner">
                        <CurrencyDollarIcon className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h2 className="text-lg sm:text-xl font-bold text-white leading-tight">Caja POS</h2>
                        <p className="text-[11px] text-gray-400 hidden sm:block">Selecciona artículos y procesa el pago rápido</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <CategoryFilter current={categoryFilter} onSelect={setCategoryFilter} />
                      {role===2 && (
                        <button onClick={openNewItemEditor} className="group flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-[.97] text-white rounded-md text-xs font-medium shadow hover:shadow-lg transition">
                          <PlusCircleIcon className="w-4 h-4"/>
                          <span>Nuevo</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {/* Listado con scroll vertical */}
              <div className="flex-1 relative min-h-0">
                <div className="h-full max-h-full lg:max-h-[calc(100vh-12rem)] overflow-y-auto overscroll-contain pr-4 space-y-4 custom-scrollbar pt-1">
                  {groupedItems.map(g => {
                    const cat = g.category || 'Sin Categoría';
                    return (
                      <div key={cat}>
                        <div className="flex items-center mb-2">
                          <span className="text-[10px] uppercase tracking-wide text-gray-400 bg-gray-700/40 px-2 py-1 rounded">{cat}</span>
                          <span className="ml-2 text-[10px] text-gray-500">{g.items.length}</span>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                          {g.items.map(item => {
                        const shapeClass = item.shape==='circle' ? 'rounded-full' : item.shape==='square' ? 'rounded-lg' : item.shape==='outline' ? 'rounded-full ring-2 ring-offset-2 ring-white' : '';
                        const hexStyle = item.shape==='hex' ? { clipPath:'polygon(25% 5%,75% 5%,95% 50%,75% 95%,25% 95%,5% 50%)' } : {};
                        const bg = item.imageData ? `url(${item.imageData})` : (item.color || '#374151');
                        const isInCart = cartItems.find(ci=>ci.refId===item.id);
                        return (
                          <div key={item.id} className="relative group">
                            {role===2 && <button onClick={()=>openEditItem(item)} className="absolute -top-2 -right-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition"><PencilIcon className="w-4 h-4"/></button>}
                            <button
                              onClick={()=>handleAddPosItem(item)}
                              className={`w-24 h-24 mx-auto flex flex-col items-center justify-center text-center text-xs font-medium text-gray-900 dark:text-gray-100 shadow-md hover:shadow-lg transition relative overflow-hidden ${shapeClass}`}
                              style={{ background: item.imageData?bg: item.shape==='outline'?'transparent': bg, backgroundSize:'cover', backgroundPosition:'center', ...hexStyle }}>
                              {!item.imageData && item.shape==='outline' && <div className="absolute inset-0 rounded-full" style={{ boxShadow:`0 0 0 3px ${item.color || '#ffffff'}` }} />}
                              <span className="z-10 px-1 drop-shadow leading-tight">{item.name}{isInCart && <span className="block text-[10px] font-bold mt-1">x{isInCart.quantity}</span>}</span>
                            </button>
                            <div className="mt-1 text-center text-[11px] text-gray-400">{formatPrice(item.price||0)}</div>
                          </div>
                        );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {groupedItems.length===0 && <div className="text-sm text-gray-400">No hay artículos.</div>}
                </div>
              </div>
            </>
          ) : (
            // Detalle del Pedido en fase de pago (una sola tarjeta)
            <div className="flex flex-col h-full">
              <div className="flex-1 overflow-y-auto overflow-x-auto pr-1 custom-scrollbar">
                {cartItems.length===0 ? (
                  <div className="text-sm text-gray-400">Vacío</div>
                ) : (
                  <div className="bg-gray-800/70 rounded-xl border border-gray-700/70 shadow-inner flex flex-col overflow-x-auto">
                    <div className="sticky top-0 z-10 bg-gray-800/80 backdrop-blur px-2 py-1 flex items-center justify-between border-b border-gray-700/60 min-w-[440px]">
                      <h2 className="text-lg sm:text-xl font-bold text-white">Detalle del Pedido</h2>
                      <button onClick={()=>setPosStage('select')} className="text-xs px-2 py-1 rounded bg-emerald-500 hover:bg-emerald-600 text-white font-medium shadow">← Seguir agregando</button>
                    </div>
                    <div className="divide-y divide-gray-700/60 min-w-[440px]">
                      {cartItems.map(ci => (
                        <div key={ci.id} className="flex items-center justify-between p-1.5 text-sm hover:bg-gray-700/40 transition">
                          <div className="flex-1 mr-2">
                            <div className="font-semibold text-gray-100 leading-tight truncate">{ci.name}</div>
                            <div className="text-[11px] text-gray-400">{formatPrice(ci.price)} c/u</div>
                          </div>
                          <div className="flex items-center gap-0.5">
                            <button onClick={()=>updateCartItemQuantity(ci.id, ci.quantity-1)} className="w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded text-[11px] font-bold">-</button>
                            <input type="number" value={ci.quantity} onChange={(e)=>updateCartItemQuantity(ci.id, Number(e.target.value||0))} className="w-9 px-1 py-0.5 text-center rounded bg-gray-800 text-white text-xs" />
                            <button onClick={()=>updateCartItemQuantity(ci.id, ci.quantity+1)} className="w-6 h-6 bg-green-600 hover:bg-green-700 text-white rounded text-[11px] font-bold">+</button>
                            <button onClick={()=>removeCartItem(ci.id)} className="w-6 h-6 bg-red-700 hover:bg-red-800 text-white rounded text-[11px] font-bold">x</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Resumen / Pago (panel lateral derecho) */}
  <div className={`${theme==='dark' ? 'bg-gray-800':'bg-white'} rounded-xl p-3 shadow-lg flex flex-col lg:sticky lg:top-0 self-start h-full lg:h-full min-h-0 ${posStage==='pay' ? 'min-w-0' : ''}`}>
          {posStage==='select' ? (
            <>
              <h3 className="text-lg font-semibold text-gray-100 mb-3">Resumen</h3>
              <div className="flex-1 min-h-0 overflow-y-auto space-y-2 mb-3 pr-1 custom-scrollbar">
                {cartItems.length===0 && <div className="text-sm text-gray-400">Añade artículos con un click.</div>}
                {cartItems.map(ci => (
                  <div key={ci.id} className="flex items-center justify-between text-sm bg-gray-700 rounded p-2">
                    <div className="flex-1 mr-2">
                      <div className="font-medium text-gray-100 truncate">{ci.name}</div>
                      <div className="text-[11px] text-gray-400">{formatPrice(ci.price)} c/u</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={()=>updateCartItemQuantity(ci.id, ci.quantity-1)} className="w-6 h-6 bg-red-600 text-white rounded text-xs">-</button>
                      <input type="number" value={ci.quantity} onChange={(e)=>updateCartItemQuantity(ci.id, Number(e.target.value||0))} className="w-10 px-1 py-0.5 text-center rounded bg-gray-800 text-white text-xs" />
                      <button onClick={()=>updateCartItemQuantity(ci.id, ci.quantity+1)} className="w-6 h-6 bg-green-600 text-white rounded text-xs">+</button>
                      <button onClick={()=>removeCartItem(ci.id)} className="w-6 h-6 bg-red-700 text-white rounded text-xs">x</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mb-3">
                <label className="block text-gray-400 mb-1 text-xs">Número de mesa (opcional)</label>
                <input
                  value={posTableNumber}
                  onChange={(e)=>setPosTableNumber(e.target.value)}
                  placeholder="Ej: 3"
                  className="w-full px-2 py-2 rounded bg-gray-700 text-white text-xs"
                />
              </div>
              <div className="flex items-center justify-between mb-4 border-t border-gray-700 pt-4">
                <div className="text-base text-gray-300 font-semibold tracking-wide">TOTAL</div>
                <div className="text-2xl font-extrabold text-green-400">{formatPrice(cartTotal)}</div>
              </div>
              <div className="flex gap-2 mb-2">
                <button onClick={resetCart} className="flex-1 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm">Limpiar</button>
                <button onClick={() => setShowPrinterConfig(true)} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">Impresora</button>
                <button onClick={testCashDrawer} className="px-3 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-sm">Abrir Caja</button>
              </div>
              <div className="flex gap-2">
                <button onClick={handleProcessPosSale} className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-semibold" disabled={cartItems.length===0}>Cobrar</button>
              </div>
            </>
          ) : (
            // Panel de Pago (nuevo diseño)
            <>
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar">
                <div className="mb-4 text-center">
                  <div className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Total a pagar</div>
                  <div className="text-3xl font-extrabold text-green-400 leading-tight">{formatPrice(cartTotal)}</div>
                  {posPaymentMethod==='efectivo' && !posCashAmount && (
                    <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-600/15 border border-emerald-500/30 text-[10px] font-medium text-emerald-300">
                      Exacto
                    </div>
                  )}
                </div>
                <div className="mb-4">
                  <label className="block text-gray-400 mb-2 text-xs font-medium">Método de Pago</label>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {['efectivo','nequi','daviplata'].map(m => (
                      <button key={m} onClick={()=>setPosPaymentMethod(m)} className={`py-2 text-xs rounded border-2 transition ${posPaymentMethod===m ? 'border-blue-500 bg-blue-600/30 text-blue-300 shadow':'border-gray-600 text-gray-300 hover:bg-gray-700'}`}>{m}</button>
                    ))}
                  </div>
                  {posPaymentMethod==='efectivo' && (
                    <div className="mb-4">
                      {quickCashSuggestions.length>0 && (
                        <>
                          <label className="block text-gray-400 mb-1 text-xs">Sugerencias</label>
                          <div className={`grid ${quickCashSuggestions.length>4 ? 'grid-cols-3' : 'grid-cols-2'} gap-2 mb-2`}>
                            {quickCashSuggestions.map((b,idx) => (
                              <button
                                key={b}
                                onClick={()=>setPosCashAmount(String(b))}
                                className={`py-1.5 rounded font-medium text-[11px] transition border whitespace-nowrap
                                  ${idx===0
                                    ? 'bg-green-500/90 hover:bg-green-500 text-white shadow border-green-400'
                                    : 'bg-green-600 hover:bg-green-700 text-white border-green-500/40'}`}
                              >{formatPrice(b)}</button>
                            ))}
                          </div>
                        </>
                      )}
                      <input type="number" placeholder="Monto recibido" value={posCashAmount} onChange={(e)=>setPosCashAmount(e.target.value)} className="w-full px-2 py-2 rounded bg-gray-700 text-white text-xs"/>
                      {posCashAmount && (
                        <div className={`mt-1 text-xs ${posCalculatedChange>=0?'text-green-400':'text-red-400'}`}>
                          Vueltos: {formatPrice(posCalculatedChange)}
                        </div>
                      )}
                      {changeBreakdown.length>0 && (
                        <div className="mt-2 text-[10px] text-gray-400 flex flex-wrap items-center gap-1">
                          <span className="text-gray-500">Cambio sugerido:</span>
                          {changeBreakdown.map(p => (
                            <span key={p.d} className="px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-200 border border-gray-600/60">
                              {p.q}x {formatPrice(p.d)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mb-4">
                    <label className="block text-gray-400 mb-1 text-xs">Nota</label>
                    <input value={posNote} onChange={e=>setPosNote(e.target.value)} className="w-full px-2 py-2 rounded bg-gray-700 text-white text-xs"/>
                  </div>
                </div>
              </div>
              <div className="mt-auto pt-2 border-t border-gray-700">
                <div className="flex gap-2 pt-4">
                  <button onClick={()=>setPosStage('select')} className="flex-1 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm">Volver</button>
                  <button onClick={handleProcessPosSale} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-semibold" disabled={cartItems.length===0}>Cobrar</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal Editor */}
      {showItemEditor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`${theme==='dark'?'bg-gray-800':'bg-white'} w-full max-w-md rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto p-6`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-100">{editingItem ? 'Editar Artículo' : 'Nuevo Artículo'}</h3>
              <button onClick={()=>setShowItemEditor(false)} className="text-gray-400 hover:text-gray-200"><XCircleIcon className="w-6 h-6"/></button>
            </div>
            <div className="mb-4 flex gap-6 text-xs">
              <label className="flex items-center gap-1 cursor-pointer"><input type="radio" checked={itemEditorMode==='color'} onChange={()=>setItemEditorMode('color')} /> Color y forma</label>
              <label className="flex items-center gap-1 cursor-pointer"><input type="radio" checked={itemEditorMode==='image'} onChange={()=>setItemEditorMode('image')} /> Imagen</label>
            </div>
            {itemEditorMode==='color' ? (
              <div className="mb-6">
                <div className="grid grid-cols-9 gap-2 mb-4">
                  {colorPalette.map(c => (
                    <button key={c} onClick={()=>setItemColor(c)} style={{ background:c }} className={`h-8 rounded ${itemColor===c ? 'ring-2 ring-white':''}`}></button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 mb-4 text-xs">
                  {shapeOptions.map(opt => (
                    <button key={opt.id} onClick={()=>setItemShape(opt.id)} className={`px-2 py-1 rounded border ${itemShape===opt.id ? 'bg-blue-600 border-blue-500 text-white':'border-gray-600 text-gray-300 hover:bg-gray-700'}`}>{opt.label}</button>
                  ))}
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-xs text-gray-300">Preview:</div>
                  <div className={`w-16 h-16 flex items-center justify-center text-[11px] font-semibold text-gray-900 dark:text-gray-100 shadow ${itemShape==='circle'?'rounded-full': itemShape==='square'?'rounded-lg': itemShape==='outline'?'rounded-full ring-2 ring-white':'rounded-full'}`} style={itemShape==='hex'?{clipPath:'polygon(25% 5%,75% 5%,95% 50%,75% 95%,25% 95%,5% 50%)',background:itemColor}:{background:itemShape==='outline'?'transparent':itemColor}}>Item</div>
                </div>
              </div>
            ) : (
              <div className="mb-6 space-y-4">
                <div>
                  <label className="block text-xs text-gray-300 mb-1">Imagen</label>
                  <input type="file" accept="image/*" onChange={handleImageFile} className="text-xs" />
                </div>
                {itemImageData && (
                  <div className="relative w-24 h-24 rounded-full overflow-hidden ring-2 ring-white">
                    <img src={itemImageData} alt="preview" className="object-cover w-full h-full" />
                    <button onClick={()=>setItemImageData(null)} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1"><XCircleIcon className="w-4 h-4"/></button>
                  </div>
                )}
              </div>
            )}
            <div className="space-y-4 text-sm">
              <div>
                <label className="block text-gray-300 mb-1">Nombre</label>
                <input value={itemName} onChange={e=>setItemName(e.target.value)} className="w-full px-3 py-2 rounded bg-gray-700 text-white text-sm" />
              </div>
              <div>
                <label className="block text-gray-300 mb-1">Precio</label>
                <input type="number" value={itemPrice} onChange={e=>setItemPrice(e.target.value)} className="w-full px-3 py-2 rounded bg-gray-700 text-white text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 mb-1">Tipo</label>
                  <select value={itemType} onChange={e=>setItemType(e.target.value)} className="w-full px-3 py-2 rounded bg-gray-700 text-white text-sm">
                    <option value="almuerzo_mesa">🪑 Almuerzo Mesa</option>
                    <option value="almuerzo_llevar">📦 Almuerzo llevar</option>
                    <option value="desayuno_mesa">🪑 Desayuno Mesa</option>
                    <option value="desayuno_llevar">📦 Desayuno llevar</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-300 mb-1">Categoría</label>
                  <input value={itemCategory} onChange={e=>setItemCategory(e.target.value)} placeholder="Ej: Bebidas" className="w-full px-3 py-2 rounded bg-gray-700 text-white text-sm" />
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <input id="activo" type="checkbox" checked={itemActive} onChange={e=>setItemActive(e.target.checked)} />
                <label htmlFor="activo" className="text-gray-300 select-none">Activo</label>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={handleSaveItem} className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-semibold text-sm">Guardar</button>
                <button onClick={()=>setShowItemEditor(false)} className="flex-1 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm">Cancelar</button>
                {editingItem && <button onClick={()=>setItemActive(a=>!a)} className="px-3 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-sm">{itemActive? 'Desactivar':'Activar'}</button>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Configuración de Impresora */}
      {showPrinterConfig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Configuración de Impresora</h3>
              <button onClick={() => setShowPrinterConfig(false)} className="text-gray-400 hover:text-white">
                <XCircleIcon className="w-6 h-6" />
              </button>
            </div>

            {/* Selector de Modelo */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">Modelo de Impresora:</label>
              <select
                value={printerModel}
                onChange={(e) => handlePrinterModelChange(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500"
              >
                {printerModels.map(model => (
                  <option key={model.id} value={model.id}>{model.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Selecciona tu modelo para configuración automática</p>
            </div>

            {/* Configuración IP y Puerto */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">Dirección IP de la impresora:</label>
              <input
                type="text"
                value={printerIp}
                onChange={(e) => setPrinterIp(e.target.value)}
                placeholder="192.168.1.100"
                className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">Puerto:</label>
              <input
                type="number"
                value={printerPort}
                onChange={(e) => setPrinterPort(Number(e.target.value))}
                placeholder="9100"
                className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500"
              />
            </div>

            {/* Botones de Prueba */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <button
                onClick={testPrint}
                className="py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium"
              >
                IMPRESIÓN DE PRUEBA
              </button>
              <button
                onClick={runCompleteTest}
                className="py-2 px-3 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium"
              >
                PRUEBA
              </button>
              <button
                onClick={testCashDrawer}
                className="py-2 px-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-sm font-medium"
              >
                ABRIR CAJA
              </button>
            </div>

            {/* Autodetección */}
            {printerModel === 'autodetect' && (
              <div className="mb-4">
                <button
                  onClick={autodetectPrinter}
                  disabled={isDetecting}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded font-medium"
                >
                  {isDetecting ? 'Detectando...' : '🔍 Buscar Impresoras en Red'}
                </button>
              </div>
            )}

            {/* Log de Diagnóstico */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-300">Log de diagnóstico:</label>
                <button
                  onClick={clearTestResults}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Limpiar Log
                </button>
              </div>
              <div className="bg-gray-900 border border-gray-600 rounded p-3 h-32 overflow-y-auto text-xs font-mono text-gray-300">
                {printerTestResults.length === 0 ? (
                  <p className="text-gray-500">El log de diagnóstico aparecerá aquí...</p>
                ) : (
                  printerTestResults.map((result, index) => (
                    <p key={index} className="mb-1">{result}</p>
                  ))
                )}
              </div>
            </div>

            {/* Botones de Acción */}
            <div className="flex gap-3">
              <button
                onClick={testPrinterConnection}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium"
              >
                Probar Conexión
              </button>
              <button
                onClick={() => setShowPrinterConfig(false)}
                className="flex-1 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded"
              >
                Cerrar
              </button>
            </div>

            {/* Aviso de Configuración */}
            <div className="mt-4 p-3 bg-yellow-600/20 border border-yellow-500/30 rounded">
              <h4 className="text-sm font-medium text-yellow-300 mb-1">⚠️ Configuración Previa Obligatoria</h4>
              <p className="text-xs text-yellow-200">
                Sin configurar IP y modelo → Plugin falla.<br />
                Siempre configura antes de usar la caja.<br />
                Esta configuración se aplica automáticamente a todos los botones de impresión en la caja.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CajaPOS;