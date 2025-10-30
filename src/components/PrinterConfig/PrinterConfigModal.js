// src/components/PrinterConfig/PrinterConfigModal.js
import React, { useState, useEffect } from 'react';
import { 
  XCircleIcon, 
  PrinterIcon, 
  WifiIcon, 
  CheckCircleIcon, 
  ExclamationTriangleIcon,
  CogIcon,
  PlayIcon,
  CheckIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import PrinterPlugin from '../../plugins/PrinterPlugin.ts';

const PrinterConfigModal = ({ isOpen, onClose, theme = 'dark' }) => {
  // Estados principales
  const [activeTab, setActiveTab] = useState('config'); // 'config', 'test', 'models'
  const [printerIp, setPrinterIp] = useState('');
  const [printerPort, setPrinterPort] = useState('9100');
  const [printerName, setPrinterName] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(''); // 'success', 'error', 'testing'
  const [logs, setLogs] = useState([]);
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);
  const [foundPrinters, setFoundPrinters] = useState([]);

  // Modelos de impresora populares
  const printerModels = [
    { id: 'epson-tm-t20ii', name: 'Epson TM-T20II (Ethernet)', port: 9100, icon: '🖨️' },
    { id: 'epson-tm-t88v', name: 'Epson TM-T88V', port: 9100, icon: '🖨️' },
    { id: 'epson-tm-t82', name: 'Epson TM-T82', port: 9100, icon: '🖨️' },
    { id: 'star-tsp143', name: 'Star TSP143', port: 9100, icon: '⭐' },
    { id: 'star-tsp650', name: 'Star TSP650', port: 9100, icon: '⭐' },
    { id: 'bixolon-srp-350', name: 'Bixolon SRP-350', port: 9100, icon: '🏷️' },
    { id: 'citizen-ct-s310a', name: 'Citizen CT-S310A', port: 9100, icon: '🏛️' },
    { id: 'zebra-zd220', name: 'Zebra ZD220', port: 9100, icon: '🦓' },
    { id: 'manual', name: 'Configuración Manual', port: 9100, icon: '⚙️' }
  ];

  // Cargar configuración al abrir
  useEffect(() => {
    if (isOpen) {
      loadSavedConfig();
      setLogs([]);
      setConnectionStatus('');
      setFoundPrinters([]);
    }
  }, [isOpen]);

  const loadSavedConfig = () => {
    const savedIp = localStorage.getItem('printerIp') || '192.168.1.100';
    const savedPort = localStorage.getItem('printerPort') || '9100';
    const savedName = localStorage.getItem('printerName') || 'Mi Impresora';
    const savedModel = localStorage.getItem('printerModel') || '';
    
    setPrinterIp(savedIp);
    setPrinterPort(savedPort);
    setPrinterName(savedName);
    setSelectedModel(savedModel);
    
    addLog('💾 Configuración cargada desde localStorage');
  };

  const addLog = (message) => {
    const timestamp = new Date().toLocaleTimeString('es-CO');
    setLogs(prev => [...prev, { time: timestamp, message }]);
  };

  const saveConfiguration = async () => {
    if (!printerIp || !printerPort || !printerName) {
      addLog('❌ Faltan campos obligatorios');
      return;
    }

    // Guardar en localStorage
    localStorage.setItem('printerIp', printerIp);
    localStorage.setItem('printerPort', printerPort);
    localStorage.setItem('printerName', printerName);
    localStorage.setItem('printerModel', selectedModel);

    addLog('✅ Configuración guardada exitosamente');
    
    // Probar conexión automáticamente
    await testConnection();
  };

  const testConnection = async () => {
    if (!printerIp || !printerPort) {
      addLog('❌ IP y puerto son obligatorios para probar');
      return;
    }

    setIsConnecting(true);
    setConnectionStatus('testing');
    addLog(`🔄 Probando conexión a ${printerIp}:${printerPort}...`);

    try {
      const result = await PrinterPlugin.testConnection({
        ip: printerIp,
        port: parseInt(printerPort)
      });

      if (result.success) {
        setConnectionStatus('success');
        addLog(`✅ Conexión exitosa a ${printerIp}:${printerPort}`);
        addLog(`📡 ${result.message || 'Impresora respondió correctamente'}`);
      } else {
        setConnectionStatus('error');
        addLog(`❌ Error de conexión: ${result.error}`);
      }
    } catch (error) {
      setConnectionStatus('error');
      addLog(`❌ Error de conexión: ${error.message}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const openCashDrawer = async () => {
    if (!printerIp || !printerPort) {
      addLog('❌ Configure la impresora primero');
      return;
    }

    addLog('💰 Intentando abrir caja registradora...');

    try {
      await PrinterPlugin.openCashDrawer({
        ip: printerIp,
        port: parseInt(printerPort)
      });
      addLog('✅ Comando de apertura enviado exitosamente');
    } catch (error) {
      addLog(`❌ Error abriendo caja: ${error.message}`);
    }
  };

  const printTestReceipt = async () => {
    if (!printerIp || !printerPort) {
      addLog('❌ Configure la impresora primero');
      return;
    }

    addLog('🧾 Imprimiendo recibo de prueba...');

    const testReceipt = `
================================
      COCINA CASERA
   Recibo de Prueba
================================
Fecha: ${new Date().toLocaleString('es-CO')}
IP: ${printerIp}:${printerPort}
Modelo: ${selectedModel || 'No especificado'}

Test Item 1 x1    $10,000
Test Item 2 x2    $15,000
-----------------------
TOTAL:            $25,000

¡Impresión exitosa!
================================



\x1b\x69`;  // Comando ESC/POS para corte automático completo

    try {
      await PrinterPlugin.printTCP({
        ip: printerIp,
        port: parseInt(printerPort),
        data: testReceipt
      });
      addLog('✅ Recibo de prueba impreso exitosamente');
    } catch (error) {
      addLog(`❌ Error imprimiendo: ${error.message}`);
    }
  };

  const autoDetectPrinters = async () => {
    setIsAutoDetecting(true);
    setFoundPrinters([]);
    addLog('🔍 Buscando impresoras en la red local...');

    try {
      // Buscar en diferentes rangos comunes
      const baseIps = ['192.168.1', '192.168.0', '10.0.0'];
      
      for (const baseIp of baseIps) {
        addLog(`🔍 Escaneando rango ${baseIp}.100-110...`);
        
        try {
          const result = await PrinterPlugin.autodetectPrinter({
            baseIp: baseIp,
            startRange: 100,
            endRange: 110,
            port: 9100
          });

          if (result.success) {
            const foundPrinter = {
              ip: result.ip,
              port: result.port,
              status: 'found'
            };
            setFoundPrinters(prev => [...prev, foundPrinter]);
            addLog(`✅ Impresora encontrada en ${result.ip}:${result.port}`);
          }
        } catch (error) {
          // Continuar con el siguiente rango
        }
      }

      addLog('🔍 Búsqueda automática completada');
    } catch (error) {
      addLog(`❌ Error en autodetección: ${error.message}`);
    } finally {
      setIsAutoDetecting(false);
    }
  };

  const selectFoundPrinter = (printer) => {
    setPrinterIp(printer.ip);
    setPrinterPort(printer.port.toString());
    addLog(`📡 Seleccionada impresora ${printer.ip}:${printer.port}`);
  };

  const selectModel = (model) => {
    setSelectedModel(model.id);
    setPrinterPort(model.port.toString());
    if (model.id !== 'manual') {
      setPrinterName(model.name);
    }
    addLog(`🖨️ Modelo seleccionado: ${model.name}`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} w-full max-w-4xl rounded-xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col`}>
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-600">
              <PrinterIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-100">Configuración de Impresora</h2>
              <p className="text-sm text-gray-400">Configure su impresora térmica para el punto de venta</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-gray-200 transition"
          >
            <XCircleIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          {[
            { id: 'config', label: 'Configuración', icon: CogIcon },
            { id: 'test', label: 'Pruebas', icon: PlayIcon },
            { id: 'models', label: 'Modelos', icon: PrinterIcon }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition ${
                activeTab === tab.id 
                  ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-600/10' 
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* Tab: Configuración */}
          {activeTab === 'config' && (
            <div className="space-y-6">
              
              {/* Status actual */}
              {connectionStatus && (
                <div className={`p-4 rounded-lg border ${
                  connectionStatus === 'success' 
                    ? 'bg-green-600/20 border-green-500/40 text-green-300'
                    : connectionStatus === 'error'
                    ? 'bg-red-600/20 border-red-500/40 text-red-300'
                    : 'bg-yellow-600/20 border-yellow-500/40 text-yellow-300'
                }`}>
                  <div className="flex items-center gap-2">
                    {connectionStatus === 'success' && <CheckCircleIcon className="w-5 h-5" />}
                    {connectionStatus === 'error' && <XMarkIcon className="w-5 h-5" />}
                    {connectionStatus === 'testing' && <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
                    <span className="font-medium">
                      {connectionStatus === 'success' && 'Impresora conectada exitosamente'}
                      {connectionStatus === 'error' && 'Error de conexión con la impresora'}
                      {connectionStatus === 'testing' && 'Probando conexión...'}
                    </span>
                  </div>
                </div>
              )}

              {/* Autodetección */}
              <div className="bg-gray-700/30 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-100 mb-3 flex items-center gap-2">
                  <WifiIcon className="w-5 h-5" />
                  Búsqueda Automática
                </h3>
                <button
                  onClick={autoDetectPrinters}
                  disabled={isAutoDetecting}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white rounded-lg transition"
                >
                  {isAutoDetecting ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <WifiIcon className="w-4 h-4" />
                  )}
                  {isAutoDetecting ? 'Buscando...' : 'Buscar Impresoras'}
                </button>

                {foundPrinters.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <h4 className="text-sm font-medium text-gray-300">Impresoras encontradas:</h4>
                    {foundPrinters.map((printer, idx) => (
                      <button
                        key={idx}
                        onClick={() => selectFoundPrinter(printer)}
                        className="w-full flex items-center justify-between p-3 bg-gray-600/40 hover:bg-gray-600/60 rounded-lg border border-gray-600 transition"
                      >
                        <div className="flex items-center gap-3">
                          <CheckCircleIcon className="w-5 h-5 text-green-400" />
                          <span className="text-gray-200 font-medium">{printer.ip}:{printer.port}</span>
                        </div>
                        <span className="text-xs text-gray-400">Click para usar</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Configuración manual */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Dirección IP de la Impresora *
                    </label>
                    <input
                      type="text"
                      value={printerIp}
                      onChange={(e) => setPrinterIp(e.target.value)}
                      placeholder="192.168.1.100"
                      className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Puerto *
                    </label>
                    <input
                      type="number"
                      value={printerPort}
                      onChange={(e) => setPrinterPort(e.target.value)}
                      placeholder="9100"
                      className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Nombre de la Impresora *
                    </label>
                    <input
                      type="text"
                      value={printerName}
                      onChange={(e) => setPrinterName(e.target.value)}
                      placeholder="Mi Impresora Térmica"
                      className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Modelo Seleccionado
                    </label>
                    <div className="p-3 bg-gray-700/50 rounded-lg border border-gray-600">
                      <span className="text-gray-200">
                        {selectedModel ? printerModels.find(m => m.id === selectedModel)?.name : 'Ninguno seleccionado'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Botones de acción */}
              <div className="flex gap-3 pt-4 border-t border-gray-700">
                <button
                  onClick={saveConfiguration}
                  className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition"
                >
                  <CheckIcon className="w-4 h-4" />
                  Guardar Configuración
                </button>
                
                <button
                  onClick={testConnection}
                  disabled={isConnecting}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg font-medium transition"
                >
                  {isConnecting ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <WifiIcon className="w-4 h-4" />
                  )}
                  Probar Conexión
                </button>
              </div>
            </div>
          )}

          {/* Tab: Pruebas */}
          {activeTab === 'test' && (
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                
                {/* Pruebas */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-100">Pruebas de Funcionalidad</h3>
                  
                  <button
                    onClick={printTestReceipt}
                    className="w-full flex items-center gap-3 p-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
                  >
                    <PrinterIcon className="w-5 h-5" />
                    <div className="text-left">
                      <div className="font-medium">Imprimir Recibo de Prueba</div>
                      <div className="text-sm opacity-75">Prueba la impresión de recibos</div>
                    </div>
                  </button>

                  <button
                    onClick={openCashDrawer}
                    className="w-full flex items-center gap-3 p-4 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition"
                  >
                    <div className="w-5 h-5 text-center">💰</div>
                    <div className="text-left">
                      <div className="font-medium">Abrir Caja Registradora</div>
                      <div className="text-sm opacity-75">Prueba la apertura del cajón</div>
                    </div>
                  </button>

                  <button
                    onClick={testConnection}
                    disabled={isConnecting}
                    className="w-full flex items-center gap-3 p-4 bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white rounded-lg transition"
                  >
                    {isConnecting ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <WifiIcon className="w-5 h-5" />
                    )}
                    <div className="text-left">
                      <div className="font-medium">Probar Conexión</div>
                      <div className="text-sm opacity-75">Verifica que la impresora responda</div>
                    </div>
                  </button>
                </div>

                {/* Estado actual */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-100">Configuración Actual</h3>
                  
                  <div className="space-y-3 p-4 bg-gray-700/30 rounded-lg">
                    <div className="flex justify-between">
                      <span className="text-gray-400">IP:</span>
                      <span className="text-gray-200 font-mono">{printerIp || 'No configurada'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Puerto:</span>
                      <span className="text-gray-200 font-mono">{printerPort || 'No configurado'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Nombre:</span>
                      <span className="text-gray-200">{printerName || 'No configurado'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Modelo:</span>
                      <span className="text-gray-200">
                        {selectedModel ? printerModels.find(m => m.id === selectedModel)?.name : 'No seleccionado'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Logs en tiempo real */}
              <div className="bg-gray-900/50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-300 mb-3">Registro de Actividad</h4>
                <div className="h-40 overflow-y-auto font-mono text-xs space-y-1">
                  {logs.length === 0 ? (
                    <div className="text-gray-500">Sin actividad registrada...</div>
                  ) : (
                    logs.map((log, idx) => (
                      <div key={idx} className="text-gray-300">
                        <span className="text-gray-500">[{log.time}]</span> {log.message}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab: Modelos */}
          {activeTab === 'models' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-100 mb-4">Selecciona tu Modelo de Impresora</h3>
                <p className="text-sm text-gray-400 mb-6">
                  Selecciona el modelo que coincida con tu impresora térmica para configuración automática
                </p>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {printerModels.map(model => (
                  <button
                    key={model.id}
                    onClick={() => selectModel(model)}
                    className={`p-4 rounded-lg border transition text-left ${
                      selectedModel === model.id
                        ? 'border-blue-500 bg-blue-600/20 text-blue-300'
                        : 'border-gray-600 bg-gray-700/30 text-gray-300 hover:bg-gray-700/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{model.icon}</span>
                      <div className="flex-1">
                        <div className="font-medium">{model.name}</div>
                        <div className="text-xs text-gray-400">Puerto: {model.port}</div>
                      </div>
                      {selectedModel === model.id && (
                        <CheckCircleIcon className="w-5 h-5 text-blue-400" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {selectedModel && (
                <div className="p-4 bg-blue-600/20 border border-blue-500/40 rounded-lg">
                  <div className="flex items-center gap-2 text-blue-300">
                    <CheckCircleIcon className="w-5 h-5" />
                    <span className="font-medium">
                      Modelo seleccionado: {printerModels.find(m => m.id === selectedModel)?.name}
                    </span>
                  </div>
                  <p className="text-sm text-blue-200 mt-2">
                    La configuración se actualizará automáticamente al guardar.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-6 py-2 text-gray-400 hover:text-gray-200 transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrinterConfigModal;