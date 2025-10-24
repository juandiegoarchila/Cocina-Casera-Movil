// src/components/Delivery/DeliveryTasks.js
import { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
import { onSnapshot, collection, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { CheckIcon, ClockIcon } from '@heroicons/react/24/outline';

const DeliveryTasks = ({ setError, setSuccess, theme }) => {
  const [tasks, setTasks] = useState([]);
  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  // Ya no necesitamos filtros de perfil - solo mostramos tareas del domiciliario

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

  // Ya no necesitamos manejar clics del dropdown

  // Cambiar estado de tarea (solo para tareas de domiciliario)
  const handleStatusChange = async (taskId, newStatus) => {
    try {
      const currentTask = tasks.find(t => t.id === taskId);
      
      // Solo permitir cambios en tareas de domiciliario
      if (currentTask.assignedTo !== 'domiciliario') {
        setError('❌ Solo puedes modificar tus propias tareas de domiciliario');
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

  // Obtener tareas filtradas por perfil (solo domiciliario)
  const getFilteredPendingTasks = () => {
    // Solo mostrar tareas del domiciliario
    let filteredTasks = tasks.filter(t => t.status === 'pendiente' && t.assignedTo === 'domiciliario');
    
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
    // Solo verificar bloqueos para tareas de domiciliario
    if (task.assignedTo !== 'domiciliario') return null;
    
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
    // Solo permitir drag para tareas de domiciliario
    if (task.assignedTo === 'domiciliario') {
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
    if (draggedTask && draggedTask.assignedTo === 'domiciliario') {
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
    
    if (!draggedTask || draggedTask.assignedTo !== 'domiciliario') {
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
        <h2 className="text-xl sm:text-2xl font-bold text-gray-100">📋 Mis Tareas de Domiciliario</h2>
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
              <span><strong>Mis Tareas de Domiciliario</strong></span>
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
            <DeliveryTaskCard 
              key={task.id}
              task={task} 
              onStatusChange={handleStatusChange}
              getProfileColor={getProfileColor}
              getProfileName={getProfileName}
              theme={theme}
              isDragging={draggedTask?.id === task.id}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              isTaskBlocked={isTaskBlocked}
              formatEstimatedTime={formatEstimatedTime}
              orderIndex={index + 1}
              canEdit={task.assignedTo === 'domiciliario'}
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
          <h3 className="text-lg font-semibold text-yellow-400 mb-4 flex items-center">
            <ClockIcon className="w-5 h-5 mr-2" />
            En Progreso ({tasks.filter(t => t.status === 'en_progreso' && t.assignedTo === 'domiciliario').length})
          </h3>
          {tasks.filter(t => t.status === 'en_progreso' && t.assignedTo === 'domiciliario').map(task => (
            <DeliveryTaskCard 
              key={task.id} 
              task={task} 
              onStatusChange={handleStatusChange}
              getProfileColor={getProfileColor}
              getProfileName={getProfileName}
              theme={theme}
              isDragging={draggedTask?.id === task.id}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              isTaskBlocked={isTaskBlocked}
              formatEstimatedTime={formatEstimatedTime}
              canEdit={task.assignedTo === 'domiciliario'}
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
          <h3 className="text-lg font-semibold text-green-400 mb-4 flex items-center">
            <CheckIcon className="w-5 h-5 mr-2" />
            Completadas ({tasks.filter(t => t.status === 'completada' && t.assignedTo === 'domiciliario').length})
          </h3>
          {tasks.filter(t => t.status === 'completada' && t.assignedTo === 'domiciliario').map(task => (
            <DeliveryTaskCard 
              key={task.id} 
              task={task} 
              onStatusChange={handleStatusChange}
              getProfileColor={getProfileColor}
              getProfileName={getProfileName}
              theme={theme}
              isDragging={draggedTask?.id === task.id}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              isTaskBlocked={isTaskBlocked}
              formatEstimatedTime={formatEstimatedTime}
              canEdit={task.assignedTo === 'domiciliario'}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// Componente para renderizar cada tarea individual (versión domiciliario)
const DeliveryTaskCard = ({ task, onStatusChange, getProfileColor, getProfileName, theme, isDragging, onDragStart, onDragEnd, isTaskBlocked, formatEstimatedTime, orderIndex, canEdit }) => {
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
  
  return (
    <div 
      draggable={canEdit && task.status !== 'completada'}
      onDragStart={canEdit && task.status !== 'completada' ? (e) => onDragStart(e, task) : undefined}
      onDragEnd={onDragEnd}
      className={`bg-${theme === 'dark' ? 'gray-700' : 'gray-50'} p-4 rounded-lg mb-3 border-l-4 border-${profileColor}-500 transition-all duration-200 hover:shadow-lg ${
        canEdit && task.status !== 'completada' ? 'cursor-move' : 'cursor-default'
      } ${isDragging ? 'opacity-50 scale-95 rotate-2' : 'hover:scale-102'} ${!canEdit || task.status === 'completada' ? 'opacity-75' : ''}`}
      title={
        task.status === 'completada' ? "Tarea completada - No se puede mover" :
        canEdit ? "Arrastra para cambiar de estado" : "Solo lectura - No puedes modificar esta tarea"
      }
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center space-x-1">
          {!canEdit && (
            <span className="text-xs bg-gray-600 text-gray-300 px-2 py-1 rounded-full font-bold">
              👁️
            </span>
          )}
          {task.status === 'pendiente' && orderIndex && (
            <span 
              className="text-xs bg-gray-600 text-gray-300 px-2 py-1 rounded-full font-bold min-w-[24px] text-center"
              title="Orden de ejecución"
            >
              {orderIndex}
            </span>
          )}
          <h4 className="font-semibold text-sm text-gray-100">{task.title}</h4>
          {task.isRecurringDaily && (
            <span 
              className={`text-xs px-2 py-1 rounded-full font-medium ${
                task.status === 'completada' 
                  ? 'text-yellow-300 bg-yellow-900 animate-pulse' 
                  : 'text-blue-400 bg-blue-900'
              }`}
              title={
                task.status === 'completada' 
                  ? 'Tarea Recurrente Completada - Se reiniciará automáticamente a las 6pm' 
                  : 'Tarea Recurrente Diaria - Se reinicia automáticamente cada día a las 6pm'
              }
            >
              {task.status === 'completada' ? '🔄⏰' : '🔄'}
            </span>
          )}
          {canEdit && isTaskBlocked && isTaskBlocked(task) && (
            <span className="text-xs text-red-400" title={`Dependiente de: ${isTaskBlocked(task).title}`}>
              🔗
            </span>
          )}
        </div>
        <div className="flex items-center space-x-1">
          {/* Sin iconos de edición para simplificar la interfaz */}
        </div>
      </div>
      
      {task.description && (
        <p className="text-xs text-gray-400 mb-2">{task.description}</p>
      )}
      
      <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
        <span className={`px-2 py-1 rounded-full bg-${profileColor}-100 text-${profileColor}-800`}>
          {getProfileName(task.assignedTo)}
        </span>
        <span>{getPriorityEmoji(task.priority)} {task.priority}</span>
      </div>
      
      {task.dueDate && (
        <p className="text-xs text-yellow-400 mb-2">
          📅 Vence: {formatDate(task.dueDate)}
        </p>
      )}
      
      {task.estimatedTime && (
        <p className="text-xs text-blue-400 mb-2">
          ⏱️ Estimado: {formatEstimatedTime(task.estimatedTime)}
        </p>
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
      
      {/* Botones de acción - solo para tareas del domiciliario */}
      {canEdit && (
        <div className="flex space-x-1">
          {task.status === 'pendiente' && (
            <button
              onClick={() => onStatusChange(task.id, 'en_progreso')}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                isTaskBlocked(task) 
                  ? 'bg-gray-500 cursor-not-allowed opacity-50' 
                  : 'bg-yellow-600 hover:bg-yellow-700'
              }`}
              disabled={isTaskBlocked(task)}
              title={isTaskBlocked(task) ? `Bloqueada por: ${isTaskBlocked(task).title}` : 'Iniciar tarea'}
            >
              {isTaskBlocked(task) ? '🔒 Bloqueada' : 'Iniciar'}
            </button>
          )}
          {task.status === 'en_progreso' && (
            <>
              <button
                onClick={() => onStatusChange(task.id, 'completada')}
                className="px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-xs transition-colors"
              >
                Completar
              </button>
              <button
                onClick={() => onStatusChange(task.id, 'pendiente')}
                className="px-2 py-1 bg-gray-600 hover:bg-gray-700 rounded text-xs transition-colors"
              >
                Pausar
              </button>
            </>
          )}
          {/* Los domiciliarios no pueden reabrir tareas completadas */}
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

export default DeliveryTasks;