// src/components/Waiter/WaiterTasks.js
import { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
import { onSnapshot, collection, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { CheckIcon, ClockIcon } from '@heroicons/react/24/outline';

const WaiterTasks = ({ setError, setSuccess, theme }) => {
  const [tasks, setTasks] = useState([]);
  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  // Solo mostramos tareas del mesero

  // Perfiles disponibles (solo lectura)
  const profiles = [
    { id: 'mesero', name: 'Mesero', color: 'blue' },
    { id: 'cocinera', name: 'Cocinera', color: 'green' },
    { id: 'domiciliario', name: 'Domiciliario', color: 'yellow' },
    { id: 'cajero', name: 'Cajero', color: 'purple' },
    { id: 'limpieza', name: 'Limpieza', color: 'pink' },
    { id: 'todos', name: 'Todos', color: 'gray' }
  ];

  // Cargar tareas desde Firestore (solo lectura)
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'tasks'), (snapshot) => {
      const taskList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTasks(taskList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    }, (error) => setError(`Error al cargar tareas: ${error.message}`));
    return () => unsubscribe();
  }, [setError]);

  // Cambiar estado de tarea (solo para tareas de mesero)
  const handleStatusChange = async (taskId, newStatus) => {
    try {
      const currentTask = tasks.find(t => t.id === taskId);
      
      // Solo permitir cambios en tareas de mesero
      if (currentTask.assignedTo !== 'mesero') {
        setError('❌ Solo puedes modificar tus propias tareas de mesero');
        return;
      }
      
      // Validar dependencias y flujo correcto antes de cambiar estado
      if (newStatus === 'en_progreso') {
        const tasksForProfile = tasks.filter(t => t.assignedTo === currentTask.assignedTo)
                                   .sort((a, b) => {
                                     const orderA = a.customOrder !== undefined ? a.customOrder : 999999;
                                     const orderB = b.customOrder !== undefined ? b.customOrder : 999999;
                                     if (orderA !== orderB) return orderA - orderB;
                                     return new Date(a.createdAt) - new Date(b.createdAt);
                                   });
        
        const currentIndex = tasksForProfile.findIndex(t => t.id === taskId);
        
        // Verificar que todas las tareas anteriores estén completadas
        for (let i = 0; i < currentIndex; i++) {
          if (tasksForProfile[i].status !== 'completada') {
            setError(`⛔ Debes completar primero la tarea: "${tasksForProfile[i].title}" antes de iniciar esta.`);
            return;
          }
        }
      }
      
      // Validar que no se pueda completar una tarea que no está en progreso
      if (newStatus === 'completada' && currentTask.status !== 'en_progreso') {
        setError(`⛔ No puedes completar una tarea que no has iniciado. Primero debes ponerla "En Progreso".`);
        return;
      }

      const updateData = {
        status: newStatus,
        updatedAt: serverTimestamp()
      };

      // Registrar timestamps según el estado
      if (newStatus === 'en_progreso') {
        updateData.startedAt = serverTimestamp();
        updateData.completedAt = null;
      } else if (newStatus === 'completada') {
        updateData.completedAt = serverTimestamp();
        
        if (currentTask.isRecurringDaily) {
          updateData.lastCompletedDate = new Date().toISOString().split('T')[0];
          setSuccess('🔄 Tarea recurrente completada - Se reiniciará automáticamente a las 6pm');
        }
      } else if (newStatus === 'pendiente') {
        updateData.startedAt = null;
        updateData.completedAt = null;
      }

      await updateDoc(doc(db, 'tasks', taskId), updateData);
      
      if (newStatus === 'completada' && !currentTask.isRecurringDaily) {
        setSuccess('✅ Tarea completada exitosamente');
      } else if (newStatus !== 'completada') {
        setSuccess('✅ Estado actualizado');
      }
    } catch (error) {
      setError(`Error al actualizar estado: ${error.message}`);
    }
  };

  // Obtener color del perfil
  const getProfileColor = (profileId) => {
    const profile = profiles.find(p => p.id === profileId);
    return profile ? profile.color : 'gray';
  };

  // Obtener nombre del perfil
  const getProfileName = (profileId) => {
    const profile = profiles.find(p => p.id === profileId);
    return profile ? profile.name : profileId;
  };

  // Funciones helper
  const formatEstimatedTime = (minutes) => {
    if (!minutes) return '';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${mins}m`;
  };

  // Obtener tareas filtradas por perfil (solo mesero)
  const getFilteredPendingTasks = () => {
    // Solo mostrar tareas del mesero
    let filteredTasks = tasks.filter(t => t.status === 'pendiente' && t.assignedTo === 'mesero');
    
    return filteredTasks.sort((a, b) => {
      const orderA = a.customOrder !== undefined ? a.customOrder : 999999;
      const orderB = b.customOrder !== undefined ? b.customOrder : 999999;
      if (orderA !== orderB) return orderA - orderB;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });
  };

  // Calcular tiempo total estimado para el perfil seleccionado
  const calculateTotalEstimatedTime = () => {
    const filteredTasks = getFilteredPendingTasks();
    const totalMinutes = filteredTasks.reduce((total, task) => {
      return total + (parseInt(task.estimatedTime) || 0);
    }, 0);
    
    if (totalMinutes === 0) return '';
    
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    if (hours > 0) {
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    return `${minutes}m`;
  };

  const isTaskBlocked = (task) => {
    // Solo verificar bloqueos para tareas de mesero
    if (task.assignedTo !== 'mesero') return null;
    
    const tasksForProfile = tasks.filter(t => t.assignedTo === task.assignedTo)
                               .sort((a, b) => {
                                 const orderA = a.customOrder !== undefined ? a.customOrder : 999999;
                                 const orderB = b.customOrder !== undefined ? b.customOrder : 999999;
                                 if (orderA !== orderB) return orderA - orderB;
                                 return new Date(a.createdAt) - new Date(b.createdAt);
                               });
    
    const currentIndex = tasksForProfile.findIndex(t => t.id === task.id);
    
    for (let i = 0; i < currentIndex; i++) {
      if (tasksForProfile[i].status !== 'completada') {
        return tasksForProfile[i];
      }
    }
    return null;
  };

  // Funciones para Drag & Drop (limitadas - solo cambio de estado)
  const handleDragStart = (e, task) => {
    // Solo permitir drag para tareas de mesero
    if (task.assignedTo === 'mesero') {
      setDraggedTask(task);
      e.dataTransfer.effectAllowed = 'move';
    } else {
      e.preventDefault();
    }
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e, columnStatus) => {
    e.preventDefault();
    if (draggedTask && draggedTask.assignedTo === 'mesero') {
      e.dataTransfer.dropEffect = 'move';
      setDragOverColumn(columnStatus);
    }
  };

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = async (e, newStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    
    if (!draggedTask || draggedTask.assignedTo !== 'mesero') {
      setDraggedTask(null);
      return;
    }

    if (draggedTask.status === newStatus) {
      setDraggedTask(null);
      return;
    }

    // Validar dependencias antes del drop
    if (newStatus === 'en_progreso') {
      const blockedBy = isTaskBlocked(draggedTask);
      if (blockedBy) {
        setError(`⛔ Esta tarea está bloqueada. Completa primero: "${blockedBy.title}"`);
        setDraggedTask(null);
        return;
      }
    }
    
    if (newStatus === 'completada' && draggedTask.status !== 'en_progreso') {
      setError(`⛔ No puedes completar una tarea que no has iniciado. Primero debes ponerla "En Progreso".`);
      setDraggedTask(null);
      return;
    }

    await handleStatusChange(draggedTask.id, newStatus);
    setDraggedTask(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-4 sm:py-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-100">📋 Mis Tareas de Mesero</h2>
      </div>

      {/* Lista de tareas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna: Pendientes */}
        <div 
          className={`bg-${theme === 'dark' ? 'gray-800' : 'white'} rounded-xl shadow-lg p-4 transition-all duration-200 ${
            dragOverColumn === 'pendiente' ? 'bg-red-500/10 border-2 border-dashed border-red-400' : ''
          }`}
          onDragOver={(e) => handleDragOver(e, 'pendiente')}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, 'pendiente')}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-red-400 flex items-center">
              <ClockIcon className="w-5 h-5 mr-2" />
              Pendientes ({getFilteredPendingTasks().length})
            </h3>
          </div>
          
          {/* Información del filtro actual */}
          <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-3 mb-4 text-xs">
            <div className="flex items-center space-x-2 text-blue-300">
              <span>👤</span>
              <span><strong>Mis Tareas de Mesero</strong></span>
            </div>
            
            {/* Resumen de tiempo estimado */}
            {calculateTotalEstimatedTime() && (
              <div className="flex items-center space-x-2 text-green-300 border-t border-blue-500/30 pt-2 mt-2">
                <span>⏱️</span>
                <span><strong>Tiempo total estimado:</strong> {calculateTotalEstimatedTime()}</span>
              </div>
            )}
          </div>
          
          {getFilteredPendingTasks().map((task, index) => (
            <WaiterTaskCard 
              key={task.id}
              task={task} 
              onStatusChange={handleStatusChange}
              getProfileColor={getProfileColor}
              getProfileName={getProfileName}
              theme={theme}
              isDragging={draggedTask?.id === task.id}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              isBlocked={isTaskBlocked(task)}
              formatEstimatedTime={formatEstimatedTime}
              index={index}
              canEdit={task.assignedTo === 'mesero'}
            />
          ))}
        </div>

        {/* Columna: En Progreso */}
        <div 
          className={`bg-${theme === 'dark' ? 'gray-800' : 'white'} rounded-xl shadow-lg p-4 transition-all duration-200 ${
            dragOverColumn === 'en_progreso' ? 'bg-yellow-500/10 border-2 border-dashed border-yellow-400' : ''
          }`}
          onDragOver={(e) => handleDragOver(e, 'en_progreso')}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, 'en_progreso')}
        >
          <h3 className="text-lg font-semibold text-yellow-400 flex items-center mb-4">
            <ClockIcon className="w-5 h-5 mr-2 animate-pulse" />
            En Progreso ({tasks.filter(t => t.status === 'en_progreso' && t.assignedTo === 'mesero').length})
          </h3>
          {tasks.filter(t => t.status === 'en_progreso' && t.assignedTo === 'mesero').map((task, index) => (
            <WaiterTaskCard 
              key={task.id}
              task={task} 
              onStatusChange={handleStatusChange}
              getProfileColor={getProfileColor}
              getProfileName={getProfileName}
              theme={theme}
              isDragging={draggedTask?.id === task.id}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              isBlocked={false}
              formatEstimatedTime={formatEstimatedTime}
              orderIndex={index + 1}
              canEdit={task.assignedTo === 'mesero'}
            />
          ))}
        </div>

        {/* Columna: Completadas */}
        <div 
          className={`bg-${theme === 'dark' ? 'gray-800' : 'white'} rounded-xl shadow-lg p-4 transition-all duration-200 ${
            dragOverColumn === 'completada' ? 'bg-green-500/10 border-2 border-dashed border-green-400' : ''
          }`}
          onDragOver={(e) => handleDragOver(e, 'completada')}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, 'completada')}
        >
          <h3 className="text-lg font-semibold text-green-400 flex items-center mb-4">
            <CheckIcon className="w-5 h-5 mr-2" />
            Completadas ({tasks.filter(t => t.status === 'completada' && t.assignedTo === 'mesero').length})
          </h3>
          {tasks.filter(t => t.status === 'completada' && t.assignedTo === 'mesero').map((task, index) => (
            <WaiterTaskCard 
              key={task.id}
              task={task} 
              onStatusChange={handleStatusChange}
              getProfileColor={getProfileColor}
              getProfileName={getProfileName}
              theme={theme}
              isDragging={draggedTask?.id === task.id}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              isBlocked={false}
              formatEstimatedTime={formatEstimatedTime}
              orderIndex={index + 1}
              canEdit={false} // No se pueden editar las completadas
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// Componente de tarjeta de tarea
const WaiterTaskCard = ({ 
  task, 
  onStatusChange, 
  getProfileColor, 
  getProfileName,
  theme, 
  isDragging, 
  onDragStart, 
  onDragEnd,
  isBlocked,
  formatEstimatedTime,
  orderIndex,
  canEdit 
}) => {
  const getPriorityEmoji = (priority) => {
    switch(priority) {
      case 'alta': return '🔴';
      case 'media': return '🟡';
      case 'baja': return '🟢';
      default: return '⚪';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('es-CO');
  };

  const formatDateTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('es-CO', { 
      dateStyle: 'short', 
      timeStyle: 'short' 
    });
  };

  const calculateDuration = (startedAt, completedAt) => {
    if (!startedAt || !completedAt) return null;
    
    const start = startedAt.toDate ? startedAt.toDate() : new Date(startedAt);
    const end = completedAt.toDate ? completedAt.toDate() : new Date(completedAt);
    
    const diffMs = end.getTime() - start.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const profileColor = getProfileColor(task.assignedTo);
  
  const isRecurring = task.isRecurringDaily;
  const hasVideo = task.tutorialVideoUrl;
  const hasEstimatedTime = task.estimatedTime && parseInt(task.estimatedTime) > 0;
  
  return (
    <div
      draggable={canEdit && task.status !== 'completada'}
      onDragStart={canEdit && task.status !== 'completada' ? (e) => onDragStart(e, task) : undefined}
      onDragEnd={onDragEnd}
      className={`p-3 sm:p-4 rounded-lg shadow-md mb-3 transition-all duration-200 cursor-${canEdit && task.status !== 'completada' ? 'move' : 'default'} ${
        isDragging ? 'opacity-50 transform scale-95' : ''
      } ${
        theme === 'dark' 
          ? isBlocked 
            ? 'bg-red-900/50 border-l-4 border-red-500' 
            : 'bg-gray-700 hover:bg-gray-600'
          : isBlocked
            ? 'bg-red-50 border-l-4 border-red-500'
            : 'bg-gray-50 hover:bg-gray-100'
      }`}
    >
      {/* Indicador de orden y bloqueo */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          {task.status === 'pendiente' && orderIndex && (
            <span className={`inline-flex items-center px-2 py-1 text-xs rounded-full ${
              theme === 'dark'
                ? 'bg-blue-800 text-blue-200'
                : 'bg-blue-100 text-blue-800'
            }`}>
              #{orderIndex}
            </span>
          )}
          {isRecurring && (
            <span className={`inline-flex items-center px-2 py-1 text-xs rounded-full ${
              theme === 'dark'
                ? 'bg-purple-800 text-purple-200'
                : 'bg-purple-100 text-purple-800'
            }`}>
              🔄 Recurrente
            </span>
          )}
        </div>
        
        {/* Badge del perfil */}
        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-${profileColor}-100 text-${profileColor}-800`}>
          {getProfileName(task.assignedTo)}
        </span>
      </div>

      {/* Alerta de bloqueo */}
      {isBlocked && (
        <div className={`mb-3 p-2 rounded-md ${
          theme === 'dark' 
            ? 'bg-red-900/50 border border-red-600/50' 
            : 'bg-red-50 border border-red-200'
        }`}>
          <p className="text-xs text-red-400">
            ⛔ <strong>Bloqueada por:</strong> "{isBlocked.title}"
          </p>
        </div>
      )}

      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 mr-3">
          <h4 className={`font-medium text-sm sm:text-base ${
            theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
          }`}>
            {task.title}
          </h4>
          {task.description && (
            <p className={`text-xs sm:text-sm mt-1 ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
            }`}>
              {task.description}
            </p>
          )}

          {/* Información de prioridad y fecha */}
          <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
            <span>{getPriorityEmoji(task.priority)} {task.priority}</span>
          </div>
          
          {task.dueDate && (
            <p className="text-xs text-yellow-400 mb-2">
              📅 Vence: {formatDate(task.dueDate)}
            </p>
          )}

          {/* Información adicional */}
          <div className="flex flex-wrap gap-2 mt-2">
            {hasEstimatedTime && (
              <span className={`inline-flex items-center px-2 py-1 text-xs rounded-full ${
                theme === 'dark'
                  ? 'bg-green-800 text-green-200'
                  : 'bg-green-100 text-green-800'
              }`}>
                ⏱️ {formatEstimatedTime(parseInt(task.estimatedTime))}
              </span>
            )}
            {hasVideo && (
              <span className={`inline-flex items-center px-2 py-1 text-xs rounded-full ${
                theme === 'dark'
                  ? 'bg-red-800 text-red-200'
                  : 'bg-red-100 text-red-800'
              }`}>
                🎥 Video
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Botones de acción - Solo para tareas que puede editar */}
      {canEdit && (
        <div className="flex space-x-2 mt-3">
          {task.status === 'pendiente' && !isBlocked && (
            <button
              onClick={() => onStatusChange(task.id, 'en_progreso')}
              className="px-3 py-1 bg-yellow-500 text-white text-xs rounded hover:bg-yellow-600 transition-colors"
            >
              Iniciar
            </button>
          )}
          {task.status === 'en_progreso' && (
            <>
              <button
                onClick={() => onStatusChange(task.id, 'completada')}
                className="px-3 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600 transition-colors"
              >
                Completar
              </button>
              <button
                onClick={() => onStatusChange(task.id, 'pendiente')}
                className="px-3 py-1 bg-gray-500 text-white text-xs rounded hover:bg-gray-600 transition-colors"
              >
                Pausar
              </button>
            </>
          )}
        </div>
      )}

      {/* Historial de tiempo */}
      {(task.startedAt || task.completedAt) && (
        <div className="bg-gray-600 p-2 rounded text-xs mb-2">
          <div className="text-blue-300 font-semibold mb-1">⏱️ Historial de Tiempo</div>
          {task.startedAt && (
            <div className="text-gray-300">
              ▶️ Iniciado: {formatDateTime(task.startedAt)}
            </div>
          )}
          {task.completedAt && (
            <div className="text-gray-300">
              ✅ Completado: {formatDateTime(task.completedAt)}
            </div>
          )}
          {task.startedAt && task.completedAt && (
            <div className="text-green-400 font-semibold mt-1">
              🎯 Duración: {calculateDuration(task.startedAt, task.completedAt)}
            </div>
          )}
          {task.startedAt && !task.completedAt && task.status === 'en_progreso' && (
            <div className="text-yellow-400 font-semibold mt-1">
              ⏳ En progreso...
            </div>
          )}
          {task.isRecurringDaily && (
            <div className="text-purple-400 text-xs mt-1">
              🔄 Recurrente - {task.dailyResetCount ? `Reset ${task.dailyResetCount} veces` : 'Primer ciclo'}
              {task.status === 'completada' && (
                <div className="text-yellow-400 animate-pulse">
                  ⏰ Se reiniciará automáticamente a las 6pm
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {task.videoUrl && (
        <div className="mb-2">
          <button
            onClick={() => window.open(task.videoUrl, '_blank')}
            className="inline-flex items-center space-x-1 px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors"
            title="Ver video tutorial"
          >
            <span>📹</span>
            <span>Ver Tutorial</span>
          </button>
        </div>
      )}

      {!canEdit && (
        <div className="bg-gray-600/50 p-2 rounded text-xs text-center text-gray-400">
          👁️ Solo lectura - Tarea de {getProfileName(task.assignedTo)}
        </div>
      )}
      
      <div className="text-xs text-gray-500 mt-2">
        Creada: {formatDate(task.createdAt?.toDate?.() || task.createdAt)}
      </div>
    </div>
  );
};

export default WaiterTasks;