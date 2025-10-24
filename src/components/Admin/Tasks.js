// src/components/Admin/Tasks.js
import { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
import { doc, setDoc, onSnapshot, collection, addDoc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { PlusIcon, TrashIcon, CheckIcon, ClockIcon, PencilIcon } from '@heroicons/react/24/outline';

const Tasks = ({ setError, setSuccess, theme, setTheme }) => {
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState({ title: '', description: '', assignedTo: '', priority: 'media', dueDate: '', estimatedTime: '', videoUrl: '', isRecurringDaily: false });
  const [showAddForm, setShowAddForm] = useState(false);
  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', description: '', assignedTo: '', priority: 'media', dueDate: '', estimatedTime: '', videoUrl: '', isRecurringDaily: false });
  const [selectedProfileFilter, setSelectedProfileFilter] = useState('todos');
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);

  // Perfiles disponibles para asignar tareas
  const profiles = [
    { id: 'mesero', name: 'Mesero', color: 'blue' },
    { id: 'cocinera', name: 'Cocinera', color: 'green' },
    { id: 'domiciliario', name: 'Domiciliario', color: 'yellow' },
    { id: 'cajero', name: 'Cajero', color: 'purple' },
    { id: 'limpieza', name: 'Limpieza', color: 'pink' },
    { id: 'todos', name: 'Todos', color: 'gray' }
  ];

  // Cargar tareas desde Firestore
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

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showProfileDropdown && !event.target.closest('.profile-dropdown-container')) {
        setShowProfileDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileDropdown]);

  // 🔄 SISTEMA DE RESET AUTOMÁTICO DE TAREAS RECURRENTES A LAS 6PM
  useEffect(() => {
    const checkAndResetRecurringTasks = async () => {
      const now = new Date();
      const currentHour = now.getHours();
      const currentDate = now.toISOString().split('T')[0];
      
      // Solo ejecutar entre las 6:00pm (18) y 6:05pm (18:05) para evitar múltiples ejecuciones
      if (currentHour === 18 && now.getMinutes() <= 5) {
        console.log('🔄 Verificando tareas recurrentes para reset automático...');
        
        // Buscar tareas recurrentes completadas que necesiten reset
        // Ahora incluye tareas completadas en días anteriores también
        const recurringTasksToReset = tasks.filter(task => {
          if (!task.isRecurringDaily || task.status !== 'completada') return false;
          
          // Si fue completada hoy, la reseteamos mañana
          // Si fue completada antes de hoy, la reseteamos hoy
          const lastCompleted = task.lastCompletedDate;
          const completedToday = lastCompleted === currentDate;
          const completedBefore = lastCompleted && lastCompleted < currentDate;
          
          console.log(`Tarea: ${task.title}, Completada: ${lastCompleted}, Hoy: ${currentDate}, CompletadaHoy: ${completedToday}, CompletadaAntes: ${completedBefore}`);
          
          return completedBefore; // Solo resetear tareas completadas en días anteriores
        });
        
        console.log(`📋 Encontradas ${recurringTasksToReset.length} tareas para resetear`);
        
        // Resetear cada tarea recurrente completada
        for (const task of recurringTasksToReset) {
          try {
            // 🔒 PRESERVAR EL ORDEN PERSONALIZADO AL RESETEAR
            const updateData = {
              status: 'pendiente',
              startedAt: null,
              completedAt: null,
              updatedAt: serverTimestamp(),
              resetAt: serverTimestamp(),
              dailyResetCount: (task.dailyResetCount || 0) + 1,
              needsReset: false, // Limpiar la bandera
              lastCompletedDate: null // Limpiar fecha de completado para nuevo ciclo
            };

            // ⚠️ IMPORTANTE: Mantener el customOrder si existe para preservar el orden del admin
            if (task.customOrder !== undefined && task.customOrder !== null) {
              updateData.customOrder = task.customOrder;
              console.log(`🔒 Preservando orden personalizado ${task.customOrder} para tarea: ${task.title}`);
            }

            await updateDoc(doc(db, 'tasks', task.id), updateData);
            
            console.log(`✅ Tarea recurrente resetada: ${task.title}`);
          } catch (error) {
            console.error(`❌ Error reseteando tarea ${task.title}:`, error);
          }
        }
        
        if (recurringTasksToReset.length > 0) {
          setSuccess(`🔄 ${recurringTasksToReset.length} tarea(s) recurrente(s) reiniciada(s) automáticamente`);
        }
      }
    };
    
    // Verificar cada minuto si es hora de reset (6pm)
    const interval = setInterval(checkAndResetRecurringTasks, 60000); // Cada minuto
    
    // Verificar inmediatamente al cargar el componente
    checkAndResetRecurringTasks();
    
    return () => clearInterval(interval);
  }, [tasks, setSuccess, setError]);

  // Crear nueva tarea
  const handleCreateTask = async () => {
    if (!newTask.title || !newTask.assignedTo) {
      setError('Título y perfil asignado son obligatorios');
      return;
    }
    try {
      await addDoc(collection(db, 'tasks'), {
        ...newTask,
        status: 'pendiente',
        createdAt: new Date(),
        createdBy: 'admin'
      });
      setNewTask({ title: '', description: '', assignedTo: '', priority: 'media', dueDate: '', estimatedTime: '', videoUrl: '', isRecurringDaily: false });
      setShowAddForm(false);
      setSuccess('Tarea creada exitosamente');
    } catch (error) {
      setError(`Error al crear tarea: ${error.message}`);
    }
  };

  // Cambiar estado de tarea
  const handleStatusChange = async (taskId, newStatus) => {
    try {
      const currentTask = tasks.find(t => t.id === taskId);
      
      // Validar dependencias y flujo correcto antes de cambiar estado
      if (newStatus === 'en_progreso') {
        const tasksForProfile = tasks.filter(t => t.assignedTo === currentTask.assignedTo)
                                   .sort((a, b) => {
                                     // Usar orden personalizado si existe, sino usar fecha de creación
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
        updateData.completedAt = null; // Limpiar si existía
      } else if (newStatus === 'completada') {
        updateData.completedAt = serverTimestamp();
        
        // 🔄 LÓGICA PARA TAREAS RECURRENTES DIARIAS
        // Solo marcar como completada, NO crear duplicados
        // El reset automático se hará a las 6pm
        if (currentTask.isRecurringDaily) {
          // Marcar la fecha de cuando fue completada por última vez
          updateData.lastCompletedDate = new Date().toISOString().split('T')[0];
          // También marcar que necesita reset al día siguiente
          updateData.needsReset = true;
          setSuccess('🔄 Tarea recurrente completada - Se reiniciará automáticamente a las 6pm del día siguiente');
        }
      } else if (newStatus === 'pendiente') {
        // Al regresar a pendiente, limpiar timestamps
        updateData.startedAt = null;
        updateData.completedAt = null;
      }

      await updateDoc(doc(db, 'tasks', taskId), updateData);
      
      // Mensaje de éxito diferente si no es recurrente
      if (newStatus === 'completada' && !currentTask.isRecurringDaily) {
        setSuccess('Estado actualizado');
      } else if (newStatus !== 'completada') {
        setSuccess('Estado actualizado');
      }
    } catch (error) {
      setError(`Error al actualizar estado: ${error.message}`);
    }
  };

  // Eliminar tarea
  const handleDeleteTask = async (taskId) => {
    if (window.confirm('¿Estás seguro de eliminar esta tarea?')) {
      try {
        await deleteDoc(doc(db, 'tasks', taskId));
        setSuccess('Tarea eliminada');
      } catch (error) {
        setError(`Error al eliminar tarea: ${error.message}`);
      }
    }
  };

  // Iniciar edición de tarea
  const handleEditTask = (task) => {
    setEditingTask(task);
    setEditForm({
      title: task.title || '',
      description: task.description || '',
      assignedTo: task.assignedTo || '',
      priority: task.priority || 'media',
      dueDate: task.dueDate || '',
      estimatedTime: task.estimatedTime || '',
      videoUrl: task.videoUrl || '',
      isRecurringDaily: task.isRecurringDaily || false
    });
  };

  // Guardar edición de tarea
  const handleSaveEdit = async () => {
    if (!editForm.title || !editForm.assignedTo) {
      setError('Título y perfil asignado son obligatorios');
      return;
    }
    try {
      await updateDoc(doc(db, 'tasks', editingTask.id), {
        ...editForm,
        updatedAt: serverTimestamp()
      });
      setEditingTask(null);
      setEditForm({ title: '', description: '', assignedTo: '', priority: 'media', dueDate: '', estimatedTime: '', videoUrl: '', isRecurringDaily: false });
      setSuccess('Tarea actualizada exitosamente');
    } catch (error) {
      setError(`Error al actualizar tarea: ${error.message}`);
    }
  };

  // Cancelar edición
  const handleCancelEdit = () => {
    setEditingTask(null);
    setEditForm({ title: '', description: '', assignedTo: '', priority: 'media', dueDate: '', estimatedTime: '', videoUrl: '', isRecurringDaily: false });
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

  // Obtener tareas filtradas por perfil
  const getFilteredPendingTasks = () => {
    let filteredTasks = tasks.filter(t => t.status === 'pendiente');
    
    if (selectedProfileFilter !== 'todos') {
      filteredTasks = filteredTasks.filter(t => t.assignedTo === selectedProfileFilter);
    }
    
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
    const tasksForProfile = tasks.filter(t => t.assignedTo === task.assignedTo)
                               .sort((a, b) => {
                                 // Primero por orden personalizado, luego por fecha de creación
                                 const orderA = a.customOrder !== undefined ? a.customOrder : 999999;
                                 const orderB = b.customOrder !== undefined ? b.customOrder : 999999;
                                 if (orderA !== orderB) return orderA - orderB;
                                 return new Date(a.createdAt) - new Date(b.createdAt);
                               });
    
    const currentIndex = tasksForProfile.findIndex(t => t.id === task.id);
    
    // Verificar si hay tareas anteriores sin completar
    for (let i = 0; i < currentIndex; i++) {
      if (tasksForProfile[i].status !== 'completada') {
        return tasksForProfile[i];
      }
    }
    return null;
  };

  // Funciones para Drag & Drop
  const handleDragStart = (e, task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
    setDragOverColumn(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (e, columnStatus, index = null) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(columnStatus);
    if (index !== null) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = (e) => {
    // Solo limpiar si realmente salimos de la columna
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverColumn(null);
      setDragOverIndex(null);
    }
  };

  // Nueva función para reordenar tareas en pendientes
  const handleReorderInPendientes = async (draggedTask, targetIndex) => {
    try {
      // Obtener TODAS las tareas pendientes (no filtrar por perfil)
      const pendingTasks = tasks.filter(t => t.status === 'pendiente')
                               .sort((a, b) => {
                                 const orderA = a.customOrder !== undefined ? a.customOrder : 999999;
                                 const orderB = b.customOrder !== undefined ? b.customOrder : 999999;
                                 if (orderA !== orderB) return orderA - orderB;
                                 return new Date(a.createdAt) - new Date(b.createdAt);
                               });
      
      // Remover la tarea arrastrada de la lista
      const filteredTasks = pendingTasks.filter(t => t.id !== draggedTask.id);
      
      // Insertar en la nueva posición
      filteredTasks.splice(targetIndex, 0, draggedTask);
      
      // Actualizar el orden personalizado para TODAS las tareas
      for (let i = 0; i < filteredTasks.length; i++) {
        await updateDoc(doc(db, 'tasks', filteredTasks[i].id), {
          customOrder: i,
          updatedAt: serverTimestamp()
        });
      }
      
      setSuccess('✅ Orden de tareas actualizado exitosamente');
    } catch (error) {
      setError(`Error al reordenar tareas: ${error.message}`);
    }
  };

  const handleDrop = async (e, newStatus, targetIndex = null) => {
    e.preventDefault();
    setDragOverColumn(null);
    setDragOverIndex(null);
    
    if (!draggedTask) {
      return;
    }

    console.log('🔄 Drop:', { draggedTask: draggedTask.title, newStatus, targetIndex, currentStatus: draggedTask.status });

    // 📋 REORDENAMIENTO DENTRO DE LA COLUMNA PENDIENTES
    if (newStatus === 'pendiente' && draggedTask.status === 'pendiente' && targetIndex !== null) {
      console.log('📋 Reordenando tarea:', draggedTask.title, 'a posición:', targetIndex);
      await handleReorderInPendientes(draggedTask, targetIndex);
      setDraggedTask(null);
      return;
    }

    // 🔄 CAMBIO DE ESTADO ENTRE COLUMNAS
    if (draggedTask.status === newStatus && targetIndex === null) {
      console.log('❌ Mismo estado, no hacer nada');
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
    
    // Validar que no se pueda completar una tarea que no está en progreso
    if (newStatus === 'completada' && draggedTask.status !== 'en_progreso') {
      setError(`⛔ No puedes completar una tarea que no has iniciado. Primero debes ponerla "En Progreso".`);
      setDraggedTask(null);
      return;
    }

    // Cambiar estado solo si no es reordenamiento
    if (targetIndex === null) {
      console.log('🔄 Cambiando estado a:', newStatus);
      await handleStatusChange(draggedTask.id, newStatus);
    }
    
    setDraggedTask(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-4 sm:py-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-100">📋 Gestión de Tareas</h2>
        <div className="flex space-x-2">
          <button
            onClick={async () => {
              try {
                const recurringTasksToReset = tasks.filter(task => 
                  task.isRecurringDaily && 
                  task.status === 'completada'
                );
                
                for (const task of recurringTasksToReset) {
                  const updateData = {
                    status: 'pendiente',
                    startedAt: null,
                    completedAt: null,
                    updatedAt: serverTimestamp(),
                    resetAt: serverTimestamp(),
                    dailyResetCount: (task.dailyResetCount || 0) + 1,
                    needsReset: false,
                    lastCompletedDate: null
                  };

                  if (task.customOrder !== undefined && task.customOrder !== null) {
                    updateData.customOrder = task.customOrder;
                  }

                  await updateDoc(doc(db, 'tasks', task.id), updateData);
                }
                
                if (recurringTasksToReset.length > 0) {
                  setSuccess(`🔄 ${recurringTasksToReset.length} tarea(s) recurrente(s) reiniciada(s) manualmente`);
                } else {
                  setError('No hay tareas recurrentes completadas para resetear');
                }
              } catch (error) {
                setError(`Error al resetear tareas: ${error.message}`);
              }
            }}
            className="bg-purple-600 hover:bg-purple-700 px-3 py-2 rounded-lg flex items-center space-x-2 transition-colors text-sm"
            title="Reset manual de tareas recurrentes"
          >
            <span>🔄</span>
            <span>Reset Manual</span>
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors text-sm"
          >
            <PlusIcon className="w-4 h-4" />
            <span>Nueva Tarea</span>
          </button>
        </div>
      </div>

      {/* Formulario para crear nueva tarea */}
      {showAddForm && (
        <div className={`bg-${theme === 'dark' ? 'gray-800' : 'white'} p-4 sm:p-6 rounded-xl shadow-lg mb-6`}>
          <h3 className="text-lg font-semibold mb-4 text-gray-100">Crear Nueva Tarea</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Título *</label>
              <input
                type="text"
                value={newTask.title}
                onChange={(e) => setNewTask({...newTask, title: e.target.value})}
                placeholder="Ej: Limpiar mesas del área principal"
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Asignar a *</label>
              <select
                value={newTask.assignedTo}
                onChange={(e) => setNewTask({...newTask, assignedTo: e.target.value})}
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Seleccionar perfil</option>
                {profiles.map(profile => (
                  <option key={profile.id} value={profile.id}>{profile.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Prioridad</label>
              <select
                value={newTask.priority}
                onChange={(e) => setNewTask({...newTask, priority: e.target.value})}
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="baja">🟢 Baja</option>
                <option value="media">🟡 Media</option>
                <option value="alta">🔴 Alta</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Fecha límite</label>
              <input
                type="date"
                value={newTask.dueDate}
                onChange={(e) => setNewTask({...newTask, dueDate: e.target.value})}
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">⏱️ Tiempo Estimado (min)</label>
              <input
                type="number"
                value={newTask.estimatedTime}
                onChange={(e) => setNewTask({...newTask, estimatedTime: e.target.value})}
                placeholder="Ej: 90 (1h 30min)"
                min="1"
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">📹 Video Tutorial (URL)</label>
              <input
                type="url"
                value={newTask.videoUrl}
                onChange={(e) => setNewTask({...newTask, videoUrl: e.target.value})}
                placeholder="Ej: https://youtube.com/shorts/example"
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="md:col-span-2 flex items-center space-x-3 p-4 bg-gray-700 rounded-lg border border-gray-600">
              <input
                type="checkbox"
                id="recurringDaily"
                checked={newTask.isRecurringDaily}
                onChange={(e) => setNewTask({...newTask, isRecurringDaily: e.target.checked})}
                className="w-4 h-4 text-blue-600 bg-gray-600 border-gray-500 rounded focus:ring-blue-500 focus:ring-2"
              />
              <label htmlFor="recurringDaily" className="text-sm font-medium text-gray-300 flex items-center space-x-2">
                <span>🔄</span>
                <span>Tarea Recurrente Diaria</span>
                <span className="text-xs text-gray-400">(Se recreará automáticamente cada día al completarse)</span>
              </label>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-2">Descripción</label>
              <textarea
                value={newTask.description}
                onChange={(e) => setNewTask({...newTask, description: e.target.value})}
                placeholder="Detalles adicionales sobre la tarea..."
                rows="3"
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 mt-4">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreateTask}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors text-sm"
            >
              Crear Tarea
            </button>
          </div>
        </div>
      )}

      {/* Modal de edición de tarea */}
      {editingTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`bg-${theme === 'dark' ? 'gray-800' : 'white'} p-4 sm:p-6 rounded-xl shadow-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto`}>
            <h3 className="text-lg font-semibold mb-4 text-gray-100">✏️ Editar Tarea</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Título *</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({...editForm, title: e.target.value})}
                  placeholder="Ej: Limpiar mesas del área principal"
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Asignar a *</label>
                <select
                  value={editForm.assignedTo}
                  onChange={(e) => setEditForm({...editForm, assignedTo: e.target.value})}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar perfil</option>
                  {profiles.map(profile => (
                    <option key={profile.id} value={profile.id}>{profile.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Prioridad</label>
                <select
                  value={editForm.priority}
                  onChange={(e) => setEditForm({...editForm, priority: e.target.value})}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="baja">🟢 Baja</option>
                  <option value="media">🟡 Media</option>
                  <option value="alta">🔴 Alta</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Fecha límite</label>
                <input
                  type="date"
                  value={editForm.dueDate}
                  onChange={(e) => setEditForm({...editForm, dueDate: e.target.value})}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">⏱️ Tiempo Estimado (min)</label>
                <input
                  type="number"
                  value={editForm.estimatedTime}
                  onChange={(e) => setEditForm({...editForm, estimatedTime: e.target.value})}
                  placeholder="Ej: 90 (1h 30min)"
                  min="1"
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">📹 Video Tutorial (URL)</label>
                <input
                  type="url"
                  value={editForm.videoUrl}
                  onChange={(e) => setEditForm({...editForm, videoUrl: e.target.value})}
                  placeholder="Ej: https://youtube.com/shorts/example"
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="md:col-span-2 flex items-center space-x-3 p-4 bg-gray-700 rounded-lg border border-gray-600">
                <input
                  type="checkbox"
                  id="editRecurringDaily"
                  checked={editForm.isRecurringDaily}
                  onChange={(e) => setEditForm({...editForm, isRecurringDaily: e.target.checked})}
                  className="w-4 h-4 text-blue-600 bg-gray-600 border-gray-500 rounded focus:ring-blue-500 focus:ring-2"
                />
                <label htmlFor="editRecurringDaily" className="text-sm font-medium text-gray-300 flex items-center space-x-2">
                  <span>🔄</span>
                  <span>Tarea Recurrente Diaria</span>
                  <span className="text-xs text-gray-400">(Se recreará automáticamente cada día al completarse)</span>
                </label>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-2">Descripción</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                  placeholder="Detalles adicionales sobre la tarea..."
                  rows="3"
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-4">
              <button
                onClick={handleCancelEdit}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-sm"
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}

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
            
            {/* Dropdown de filtros por perfil */}
            <div className="relative profile-dropdown-container">
              <button
                onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                className="p-2 text-gray-400 hover:text-gray-200 transition-colors"
                title="Filtrar por perfil"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                </svg>
              </button>
              
              {showProfileDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-lg shadow-lg border border-gray-700 z-10">
                  <div className="py-2">
                    <button
                      onClick={() => {
                        setSelectedProfileFilter('todos');
                        setShowProfileDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-700 transition-colors ${
                        selectedProfileFilter === 'todos' ? 'bg-gray-700 text-blue-400' : 'text-gray-300'
                      }`}
                    >
                      👥 Ver Todos ({tasks.filter(t => t.status === 'pendiente').length})
                    </button>
                    {profiles.filter(p => p.id !== 'todos').map(profile => (
                      <button
                        key={profile.id}
                        onClick={() => {
                          setSelectedProfileFilter(profile.id);
                          setShowProfileDropdown(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-700 transition-colors ${
                          selectedProfileFilter === profile.id ? 'bg-gray-700 text-blue-400' : 'text-gray-300'
                        }`}
                      >
                        <span className={`inline-block w-3 h-3 rounded-full bg-${profile.color}-500 mr-2`}></span>
                        {profile.name} ({tasks.filter(t => t.status === 'pendiente' && t.assignedTo === profile.id).length})
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* Información del filtro actual */}
          <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-3 mb-4 text-xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2 text-blue-300">
                <span>👤</span>
                <span><strong>Mostrando:</strong> {
                  selectedProfileFilter === 'todos' 
                    ? 'Todas las tareas pendientes' 
                    : `Tareas de ${profiles.find(p => p.id === selectedProfileFilter)?.name || 'Desconocido'}`
                }</span>
              </div>
            </div>
            
            {getFilteredPendingTasks().length > 1 && (
              <div className="flex items-center space-x-2 text-blue-300 mb-2">
                <span>📋</span>
                <span><strong>Reordenar:</strong> Arrastra las tareas para cambiar su orden de ejecución</span>
              </div>
            )}
            
            {/* Resumen de tiempo estimado */}
            {calculateTotalEstimatedTime() && (
              <div className="flex items-center space-x-2 text-green-300 border-t border-blue-500/30 pt-2">
                <span>⏱️</span>
                <span><strong>Tiempo total estimado:</strong> {calculateTotalEstimatedTime()}</span>
              </div>
            )}
          </div>
          {getFilteredPendingTasks().map((task, index) => (
            <div key={task.id}>
              {/* Zona de drop superior */}
              <div
                className={`h-3 transition-all duration-200 mb-1 ${
                  dragOverColumn === 'pendiente' && dragOverIndex === index && draggedTask?.id !== task.id && draggedTask?.status === 'pendiente'
                    ? 'bg-blue-500 rounded-full mx-2 shadow-lg border-2 border-blue-300'
                    : 'h-1'
                }`}
                onDragOver={(e) => handleDragOver(e, 'pendiente', index)}
                onDrop={(e) => handleDrop(e, 'pendiente', index)}
              >
                {dragOverColumn === 'pendiente' && dragOverIndex === index && draggedTask?.id !== task.id && draggedTask?.status === 'pendiente' && (
                  <div className="text-center text-xs text-blue-200 font-bold py-1">
                    ⬇️ Soltar aquí (posición {index + 1})
                  </div>
                )}
              </div>
              
              <TaskCard 
                task={task} 
                onStatusChange={handleStatusChange}
                onDelete={handleDeleteTask}
                onEdit={handleEditTask}
                getProfileColor={getProfileColor}
                getProfileName={getProfileName}
                theme={theme}
                isDragging={draggedTask?.id === task.id}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                isTaskBlocked={isTaskBlocked}
                formatEstimatedTime={formatEstimatedTime}
                orderIndex={index + 1}
                isAdmin={true}
              />
            </div>
          ))}
          
          {/* Zona de drop al final para agregar al final de la lista */}
          <div
            className={`transition-all duration-200 mt-2 ${  
              dragOverColumn === 'pendiente' && dragOverIndex === getFilteredPendingTasks().length && draggedTask?.status === 'pendiente'
                ? 'h-12 bg-blue-500 rounded-lg mx-2 shadow-lg border-2 border-blue-300'
                : 'h-2'
            }`}
            onDragOver={(e) => handleDragOver(e, 'pendiente', getFilteredPendingTasks().length)}
            onDrop={(e) => handleDrop(e, 'pendiente', getFilteredPendingTasks().length)}
          >
            {dragOverColumn === 'pendiente' && dragOverIndex === getFilteredPendingTasks().length && draggedTask?.status === 'pendiente' && (
              <div className="text-center text-xs text-blue-200 font-bold py-3">
                ⬇️ Soltar al final (posición {getFilteredPendingTasks().length + 1})
              </div>
            )}
          </div>
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
            En Progreso ({tasks.filter(t => t.status === 'en_progreso').length})
          </h3>
          {tasks.filter(t => t.status === 'en_progreso').map(task => (
            <TaskCard 
              key={task.id} 
              task={task} 
              onStatusChange={handleStatusChange}
              onDelete={handleDeleteTask}
              onEdit={handleEditTask}
              getProfileColor={getProfileColor}
              getProfileName={getProfileName}
              theme={theme}
              isDragging={draggedTask?.id === task.id}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              isTaskBlocked={isTaskBlocked}
              formatEstimatedTime={formatEstimatedTime}
              isAdmin={true}
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
            Completadas ({tasks.filter(t => t.status === 'completada').length})
          </h3>
          {tasks.filter(t => t.status === 'completada').map(task => (
            <TaskCard 
              key={task.id} 
              task={task} 
              onStatusChange={handleStatusChange}
              onDelete={handleDeleteTask}
              onEdit={handleEditTask}
              getProfileColor={getProfileColor}
              getProfileName={getProfileName}
              theme={theme}
              isDragging={draggedTask?.id === task.id}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              isTaskBlocked={isTaskBlocked}
              formatEstimatedTime={formatEstimatedTime}
              isAdmin={true}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// Componente para renderizar cada tarea individual
const TaskCard = ({ task, onStatusChange, onDelete, onEdit, getProfileColor, getProfileName, theme, isDragging, onDragStart, onDragEnd, isTaskBlocked, formatEstimatedTime, orderIndex, isAdmin = true }) => {
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
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onDragEnd={onDragEnd}
      className={`bg-${theme === 'dark' ? 'gray-700' : 'gray-50'} p-4 rounded-lg mb-3 border-l-4 border-${profileColor}-500 cursor-move transition-all duration-200 hover:shadow-lg ${
        isDragging ? 'opacity-50 scale-95 rotate-2' : 'hover:scale-102'
      } ${task.status === 'completada' ? 'border-green-500 bg-green-900/20' : ''}`}
      title={task.status === 'completada' ? "Tarea completada - Solo admin puede mover" : "Arrastra para cambiar de estado"}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center space-x-1">
          {task.status === 'pendiente' && orderIndex && (
            <span 
              className="text-xs bg-gray-600 text-gray-300 px-2 py-1 rounded-full font-bold min-w-[24px] text-center"
              title="Orden de ejecución - Arrastra para reordenar"
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
          {isTaskBlocked && isTaskBlocked(task) && (
            <span className="text-xs text-red-400" title={`Dependiente de: ${isTaskBlocked(task).title}`}>
              🔗
            </span>
          )}
        </div>
        <div className="flex space-x-1">
          <button
            onClick={() => onEdit(task)}
            className="text-blue-400 hover:text-blue-300 p-1"
            title="Editar tarea"
          >
            <PencilIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="text-red-400 hover:text-red-300 p-1"
            title="Eliminar tarea"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
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
      
      <div className="flex space-x-1">
        {task.status === 'pendiente' && (
          <>
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
          </>
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
        {task.status === 'completada' && isAdmin && (
          <button
            onClick={() => onStatusChange(task.id, 'pendiente')}
            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs transition-colors"
          >
            {task.isRecurringDaily ? 'Reiniciar Ahora' : 'Reabrir'}
          </button>
        )}
        {task.isRecurringDaily && task.status === 'completada' && (
          <div className="text-xs text-yellow-400 mt-1 animate-pulse">
            ⏰ Auto-reset a las 6pm
          </div>
        )}
      </div>
      
      <div className="text-xs text-gray-500 mt-2">
        Creada: {formatDate(task.createdAt?.toDate?.() || task.createdAt)}
      </div>
    </div>
  );
};

export default Tasks;