// src/components/Admin/MenuManagement.js
import React, { useState, useEffect, useRef } from 'react';
import { db, storage } from '../../config/firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, query, orderBy, setDoc, getDoc, where, limit } from 'firebase/firestore';
import { XMarkIcon, PencilIcon, TrashIcon, CheckCircleIcon, MinusCircleIcon, MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import Modal from '../Modal';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { getCroppedImageBlob, blobToFile } from '../../utils/imageCrop';

// Componente para una checkbox personalizada
const CustomCheckbox = ({ id, label, checked, onChange, theme }) => (
  <div className="flex items-center cursor-pointer">
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={onChange}
      className="hidden"
    />
    <label htmlFor={id} className="flex items-center cursor-pointer">
      <div className={`w-5 h-5 border-2 rounded flex items-center justify-center transition-all duration-200
        ${checked
          ? 'bg-blue-600 border-blue-600'
          : `bg-transparent ${theme === 'dark' ? 'border-gray-500' : 'border-gray-400'}`
        }`}>
        {checked && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <span className={`ml-2 text-sm ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>{label}</span>
    </label>
  </div>
);

const MenuManagement = ({ setError, setSuccess, theme }) => {
  const [selectedCollection, setSelectedCollection] = useState('soups');
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState({ name: '', description: '', emoji: '', price: '', isNew: false, steps: [], imageUrl: '' });
  const [editingItem, setEditingItem] = useState(null);
  const [editItem, setEditItem] = useState({ name: '', description: '', emoji: '', price: '', isNew: false, isFinished: false, steps: [], imageUrl: '' });
  const [showAddItemForm, setShowAddItemForm] = useState(false);
  const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [schedules, setSchedules] = useState({
    breakfastStart: '07:00',
    breakfastEnd: '11:00',
    lunchStart: '11:01',
    lunchEnd: '15:50',
  });
  const [breakfastProteins, setBreakfastProteins] = useState([]); // Added to validate protein step
  const [uploadingImage, setUploadingImage] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  // Crop state (react-image-crop)
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState('');
  const [cropRect, setCropRect] = useState(null); // { unit: 'px', x, y, width, height }
  const [aspectMode, setAspectMode] = useState('free'); // 'free' | '1:1' | '4:3' | '16:9'
  const [imgNatural, setImgNatural] = useState({ width: 0, height: 0 });
  const [imgDisplay, setImgDisplay] = useState({ width: 0, height: 0 });
  const [cropTarget, setCropTarget] = useState('add'); // 'add' | 'edit'
  const [librarySuggestionAdd, setLibrarySuggestionAdd] = useState(null);
  const [librarySuggestionEdit, setLibrarySuggestionEdit] = useState(null);
  const [libraryPool, setLibraryPool] = useState([]); // imágenes de biblioteca para la colección actual
  const [libraryMatchesAdd, setLibraryMatchesAdd] = useState([]);
  const [libraryMatchesEdit, setLibraryMatchesEdit] = useState([]);

  const collectionNames = {
    soups: 'Sopas',
    soupReplacements: 'Reemplazos de Sopa',
    principles: 'Principios',
    proteins: 'Proteínas',
    drinks: 'Bebidas',
    sides: 'Acompañamientos',
    additions: 'Adiciones',
    times: 'Horarios de Almuerzo',
    breakfastTimes: 'Horarios de Desayuno',
    paymentMethods: 'Métodos de Pago',
    breakfastEggs: 'Huevos para Desayuno',
    breakfastBroths: 'Caldo para Desayuno',
    breakfastRiceBread: 'Arroz o Pan para Desayuno',
    breakfastDrinks: 'Bebidas para Desayuno',
    breakfastAdditions: 'Adiciones para Desayuno',
    breakfastTypes: 'Tipos de Desayuno',
    breakfastProteins: 'Proteínas para Desayuno',
    tables: 'Mesas',
    schedules: 'Horarios de Menú',
  };
  const collections = Object.keys(collectionNames);

  const itemsListRef = useRef(null);

  useEffect(() => {
    // Listener for selected collection
    if (selectedCollection === 'schedules') {
      const unsubscribe = onSnapshot(doc(db, 'settings', 'schedules'), (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          setSchedules({
            breakfastStart: data.breakfastStart ? minutesToTime(data.breakfastStart) : '07:00',
            breakfastEnd: data.breakfastEnd ? minutesToTime(data.breakfastEnd) : '11:00',
            lunchStart: data.lunchStart ? minutesToTime(data.lunchStart) : '11:01',
            lunchEnd: data.lunchEnd ? minutesToTime(data.lunchEnd) : '15:50',
          });
        }
      }, (error) => setError(`Error cargando horarios: ${error.message}`));
      return () => unsubscribe();
    } else {
      const q = query(collection(db, selectedCollection), orderBy('createdAt', 'asc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setItems(fetchedItems);
        if (itemsListRef.current) {
          const { scrollHeight, clientHeight, scrollTop } = itemsListRef.current;
          if (scrollHeight - scrollTop < clientHeight + 100) {
            itemsListRef.current.scrollTop = scrollHeight;
          }
        }
      }, (error) => setError(`Error cargando datos: ${error.message}`));
      return () => unsubscribe();
    }
  }, [selectedCollection, setError]);

  // Listener for breakfastProteins to validate protein step
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'breakfastProteins'), (snapshot) => {
      const fetchedProteins = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBreakfastProteins(fetchedProteins);
      if (process.env.NODE_ENV === 'development') console.log('Datos de breakfastProteins:', fetchedProteins);
      if (fetchedProteins.length === 0 && selectedCollection === 'breakfastTypes') {
        setError('No hay proteínas disponibles. Agrega al menos una proteína en "Proteínas para Desayuno" antes de incluir el paso de proteína.');
      }
    }, (error) => {
      if (process.env.NODE_ENV === 'development') console.error('Error al cargar breakfastProteins:', error);
      setError('Error al cargar proteínas para desayunos.');
    });
    return () => unsubscribe();
  }, [selectedCollection, setError]);

  const timeToMinutes = (time) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const minutesToTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  const handleAddItem = async () => {
    if (!newItem.name.trim()) {
      setError('El nombre no puede estar vacío');
      return;
    }
    // Validación específica para Mesas: nombre debe ser número o texto corto
    if (selectedCollection === 'tables') {
      const normalized = newItem.name.trim();
      if (normalized.length > 10) {
        setError('El identificador de la mesa es muy largo (max 10 caracteres)');
        return;
      }
    }
    if ((selectedCollection === 'additions' || selectedCollection === 'breakfastAdditions') && 
        (!newItem.price || isNaN(parseFloat(newItem.price)) || parseFloat(newItem.price) <= 0)) {
      setError('El precio debe ser un número válido mayor a 0 para Adiciones');
      return;
    }
    if (selectedCollection === 'breakfastTypes') {
      if (newItem.steps.length === 0) {
        setError('Debe seleccionar al menos un paso para el tipo de desayuno');
        return;
      }
      if (newItem.steps.includes('protein') && breakfastProteins.length === 0) {
        setError('No hay proteínas disponibles. Agrega al menos una proteína en "Proteínas para Desayuno" antes de incluir el paso de proteína.');
        return;
      }
    }
    try {
      const itemData = {
        name: newItem.name.trim() || 'Unnamed Item',
        description: newItem.description.trim() || '',
        emoji: newItem.emoji.trim() || '',
        isNew: newItem.isNew,
        createdAt: new Date(),
      };
      // Si no hay imagen cargada, intentar usar biblioteca
      if (!newItem.imageUrl && librarySuggestionAdd?.imageUrl) {
        itemData.imageUrl = librarySuggestionAdd.imageUrl;
      } else if (newItem.imageUrl) {
        itemData.imageUrl = newItem.imageUrl;
      }
      if (selectedCollection === 'additions' || selectedCollection === 'breakfastAdditions') {
        itemData.price = parseFloat(newItem.price);
      }
      if (selectedCollection === 'breakfastTypes') {
        itemData.steps = newItem.steps;
        itemData.requiresProtein = newItem.steps.includes('protein');
      }
      if (selectedCollection === 'tables') {
        // Evitar duplicados por nombre
        const existing = items.find(i => (i.name || '').toLowerCase() === itemData.name.toLowerCase());
        if (existing) {
          setError('Ya existe una mesa con ese nombre');
          return;
        }
        itemData.status = 'disponible';
        await addDoc(collection(db, selectedCollection), itemData);
      } else {
        await addDoc(collection(db, selectedCollection), itemData);
      }
      // Guardar/actualizar en biblioteca si hay imagen
      if (itemData.imageUrl) await saveImageToLibrary(selectedCollection, itemData.name, itemData.imageUrl);
      // Reset
      setNewItem({ name: '', description: '', emoji: '', price: '', isNew: false, steps: [], imageUrl: '' });
      setShowAddItemForm(false);
      window.dispatchEvent(new Event('optionsUpdated'));
      setSuccess(`"${itemData.name}" agregado exitosamente.`);
    } catch (error) {
      setError(`Error al agregar: ${error.message}`);
    }
  };

  const handleSaveSchedules = async () => {
    const { breakfastStart, breakfastEnd, lunchStart, lunchEnd } = schedules;
    const times = {
      breakfastStart: timeToMinutes(breakfastStart),
      breakfastEnd: timeToMinutes(breakfastEnd),
      lunchStart: timeToMinutes(lunchStart),
      lunchEnd: timeToMinutes(lunchEnd),
    };

    if (times.breakfastStart >= times.breakfastEnd) {
      setError('La hora de inicio de desayuno debe ser anterior a la hora de fin.');
      return;
    }
    if (times.lunchStart >= times.lunchEnd) {
      setError('La hora de inicio de almuerzo debe ser anterior a la hora de fin.');
      return;
    }
    if (times.breakfastEnd > times.lunchStart) {
      setError('La hora de fin de desayuno debe ser anterior o igual a la hora de inicio de almuerzo.');
      return;
    }

    try {
      await setDoc(doc(db, 'settings', 'schedules'), times);
      setSuccess('Horarios actualizados exitosamente.');
    } catch (error) {
      setError(`Error al guardar horarios: ${error.message}`);
    }
  };

  const confirmDeleteItem = (itemId, itemName) => {
    setItemToDelete({ id: itemId, name: itemName });
    setShowConfirmDeleteModal(true);
  };

  const handleDeleteConfirmed = async () => {
    try {
      await deleteDoc(doc(db, selectedCollection, itemToDelete.id));
      setSuccess(`"${itemToDelete.name}" eliminado exitosamente.`);
      setShowConfirmDeleteModal(false);
      setItemToDelete(null);
    } catch (error) {
      setError(`Error al eliminar: ${error.message}`);
    }
  };

  const handleEditItem = (item) => {
    setEditingItem(item);
    setEditItem({
      ...item,
      price: item.price !== undefined ? item.price.toString() : '',
      isFinished: item.isFinished || false,
      steps: item.steps || [],
    });
  };

  const handleSaveEdit = async () => {
    if (!editItem.name.trim()) {
      setError('El nombre no puede estar vacío');
      return;
    }
    if ((selectedCollection === 'additions' || selectedCollection === 'breakfastAdditions') && 
        (!editItem.price || isNaN(parseFloat(editItem.price)) || parseFloat(editItem.price) <= 0)) {
      setError('El precio debe ser un número válido mayor a 0 para Adiciones');
      return;
    }
    if (selectedCollection === 'breakfastTypes') {
      if (editItem.steps.length === 0) {
        setError('Debe seleccionar al menos un paso para el tipo de desayuno');
        return;
      }
      if (editItem.steps.includes('protein') && breakfastProteins.length === 0) {
        setError('No hay proteínas disponibles. Agrega al menos una proteína en "Proteínas para Desayuno" antes de incluir el paso de proteína.');
        return;
      }
    }
    try {
      const itemData = {
        name: editItem.name.trim() || 'Unnamed Item',
        description: editItem.description.trim() || '',
        emoji: editItem.emoji.trim() || '',
        isNew: editItem.isNew,
        isFinished: editItem.isFinished || false,
        updatedAt: new Date(),
      };
      // Prioridad: imagen editada, luego biblioteca
      if (editItem.imageUrl) itemData.imageUrl = editItem.imageUrl;
      else if (librarySuggestionEdit?.imageUrl) itemData.imageUrl = librarySuggestionEdit.imageUrl;

      if (selectedCollection === 'additions' || selectedCollection === 'breakfastAdditions') {
        itemData.price = parseFloat(editItem.price);
      }
      if (selectedCollection === 'breakfastTypes') {
        itemData.steps = editItem.steps;
        itemData.requiresProtein = editItem.steps.includes('protein');
      }
      await updateDoc(doc(db, selectedCollection, editingItem.id), itemData);
      if (itemData.imageUrl) await saveImageToLibrary(selectedCollection, itemData.name, itemData.imageUrl);
      setEditingItem(null);
      setSuccess(`"${itemData.name}" actualizado exitosamente.`);
    } catch (error) {
      setError(`Error al actualizar: ${error.message}`);
    }
  };

  const handleToggleFinished = async (item) => {
    try {
      await updateDoc(doc(db, selectedCollection, item.id), { isFinished: !item.isFinished });
      setSuccess(`"${item.name}" ${!item.isFinished ? 'marcado como agotado' : 'marcado como disponible'}.`);
    } catch (error) {
      setError(`Error al actualizar: ${error.message}`);
    }
  };

  const filteredItems = items.filter(item => {
    const name = item.name && typeof item.name === 'string' ? item.name.toLowerCase() : '';
    const description = item.description && typeof item.description === 'string' ? item.description.toLowerCase() : '';
    const search = searchTerm.toLowerCase();
    return name.includes(search) || description.includes(search);
  });

  const getInputFieldClasses = (isAddForm = true) => {
    const baseClasses = `p-3 rounded-lg w-full transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:outline-none`;
    const darkTheme = `${isAddForm ? 'bg-gray-700' : 'bg-gray-700'} text-gray-100 placeholder-gray-400`;
    const lightTheme = `${isAddForm ? 'bg-gray-200' : 'bg-white'} text-gray-800 placeholder-gray-500 border border-gray-300`;
    return `${baseClasses} ${theme === 'dark' ? darkTheme : lightTheme}`;
  };

  const getContainerBgClasses = (isMain = false) => {
    if (theme === 'dark') return isMain ? 'bg-gray-800' : 'bg-gray-900';
    return isMain ? 'bg-white' : 'bg-gray-50';
  };

  const stepOptions = [
    { id: 'eggs', label: 'Huevos' },
    { id: 'broth', label: 'Caldo' },
    { id: 'riceBread', label: 'Arroz/Pan' },
    { id: 'drink', label: 'Bebida' },
    { id: 'protein', label: 'Proteína' },
  ];

  const openCropper = (file, forEdit = false) => {
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      setCropSrc(reader.result);
      setCropRect(null);
      setAspectMode('free');
      setCropTarget(forEdit ? 'edit' : 'add');
      setCropModalOpen(true);
    });
    reader.readAsDataURL(file);
  };

  const applyCropAndUpload = async () => {
    if (!cropSrc || !cropRect) {
      setCropModalOpen(false);
      return;
    }
    try {
      setUploadingImage(true);
      // Escalar de tamaño mostrado -> tamaño natural
      const sx = imgDisplay.width ? (imgNatural.width / imgDisplay.width) : 1;
      const sy = imgDisplay.height ? (imgNatural.height / imgDisplay.height) : 1;
      const origCrop = {
        x: Math.round((cropRect.x || 0) * sx),
        y: Math.round((cropRect.y || 0) * sy),
        width: Math.round((cropRect.width || imgDisplay.width) * sx),
        height: Math.round((cropRect.height || imgDisplay.height) * sy),
      };
      const blob = await getCroppedImageBlob(cropSrc, origCrop, 0, 'image/jpeg', 0.9);
      const baseName = cropTarget === 'edit' ? (editItem?.name || 'item') : (newItem?.name || 'item');
      const fileName = `${baseName.toString().toLowerCase().replace(/[^a-z0-9\-\s]/g, '').trim().replace(/\s+/g, '-')}-${Date.now()}.jpg`;
      const file = blobToFile(blob, fileName);

      const col = selectedCollection || 'misc';
      const path = `menu/${col}/${file.name}`;
      const ref = storageRef(storage, path);
      await uploadBytes(ref, file);
      const url = await getDownloadURL(ref);
      if (cropTarget === 'edit') {
        setEditItem(prev => ({ ...prev, imageUrl: url }));
      } else {
        setNewItem(prev => ({ ...prev, imageUrl: url }));
      }
      setSuccess('Imagen recortada y subida correctamente.');
    } catch (e) {
      setError(`Error al recortar/subir imagen: ${e.message}`);
    } finally {
      setUploadingImage(false);
      setCropModalOpen(false);
      setCropSrc('');
    setCropRect(null);
    }
  };

  const getNameSlug = (text) => {
    if (!text) return 'item';
    return text
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\-\s]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  };

  const fetchImageFromLibrary = async (col, name) => {
    try {
      const slug = getNameSlug(name);
      const id = `${col}_${slug}`;
      const ref = doc(db, 'menuImageLibrary', id);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        return { imageUrl: data.imageUrl, name: data.name, nameSlug: data.nameSlug };
      }
      return null;
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.error('fetchImageFromLibrary error', e);
      return null;
    }
  };

  // Normalizar texto para búsqueda (ignora tildes y mayúsculas)
  const normalizeText = (txt) => {
    return (txt || '')
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Cargar pool de la biblioteca para la colección actual (en vivo)
  useEffect(() => {
    if (!selectedCollection || selectedCollection === 'schedules' || selectedCollection === 'times' || selectedCollection === 'breakfastTimes' || selectedCollection === 'paymentMethods') {
      setLibraryPool([]);
      return;
    }
    const qLib = query(
      collection(db, 'menuImageLibrary'),
      where('collection', '==', selectedCollection),
      orderBy('updatedAt', 'desc'),
      limit(100)
    );
    const unsub = onSnapshot(qLib, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setLibraryPool(items);
    });
    return () => unsub();
  }, [selectedCollection]);

  const saveImageToLibrary = async (col, name, imageUrl) => {
    try {
      if (!imageUrl) return;
      const slug = getNameSlug(name);
      const id = `${col}_${slug}`;
      const ref = doc(db, 'menuImageLibrary', id);
      await setDoc(ref, {
        collection: col,
        name,
        nameSlug: slug,
        imageUrl,
        updatedAt: new Date(),
        createdAt: new Date(),
      }, { merge: true });
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.error('saveImageToLibrary error', e);
    }
  };

  // Sugerencia al escribir nombre en formulario de alta
  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!newItem?.name || selectedCollection === 'schedules' || selectedCollection === 'times' || selectedCollection === 'breakfastTimes' || selectedCollection === 'paymentMethods') {
        setLibrarySuggestionAdd(null);
        return;
      }
      const suggestion = await fetchImageFromLibrary(selectedCollection, newItem.name);
      if (active) setLibrarySuggestionAdd(suggestion);
    };
    run();
    return () => { active = false; };
  }, [newItem?.name, selectedCollection]);

  // Coincidencias múltiples en alta (tipo autocompletar)
  useEffect(() => {
    if (!newItem?.name || libraryPool.length === 0) {
      setLibraryMatchesAdd([]);
      return;
    }
    const needle = normalizeText(newItem.name);
    if (needle.length < 2) { setLibraryMatchesAdd([]); return; }
    const matches = libraryPool.filter(x => normalizeText(x.name).includes(needle)).slice(0, 6);
    setLibraryMatchesAdd(matches);
  }, [newItem?.name, libraryPool]);

  // Sugerencia al editar nombre
  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!editingItem || !editItem?.name) {
        setLibrarySuggestionEdit(null);
        return;
      }
      const suggestion = await fetchImageFromLibrary(selectedCollection, editItem.name);
      if (active) setLibrarySuggestionEdit(suggestion);
    };
    run();
    return () => { active = false; };
  }, [editingItem, editItem?.name, selectedCollection]);

  // Coincidencias múltiples en edición
  useEffect(() => {
    if (!editItem?.name || libraryPool.length === 0) {
      setLibraryMatchesEdit([]);
      return;
    }
    const needle = normalizeText(editItem.name);
    if (needle.length < 2) { setLibraryMatchesEdit([]); return; }
    const matches = libraryPool.filter(x => normalizeText(x.name).includes(needle)).slice(0, 6);
    setLibraryMatchesEdit(matches);
  }, [editItem?.name, libraryPool]);

  return (
    <div className={`min-h-screen ${getContainerBgClasses(true)} text-gray-100 p-4 sm:p-6 lg:p-8 flex flex-col md:flex-row gap-6`}>
      <aside className={`w-full md:w-64 flex-shrink-0 ${getContainerBgClasses()} p-4 sm:p-6 rounded-xl shadow-lg border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
        <h2 className="text-xl font-bold mb-4 md:mb-6 text-gray-200 dark:text-white">Categorías</h2>
        <nav className="flex md:flex-col gap-2 md:gap-3 overflow-x-auto whitespace-nowrap md:whitespace-normal custom-scrollbar-horizontal pb-2 md:pb-0">
          {collections.map(col => (
            <button
              key={col}
              onClick={() => setSelectedCollection(col)}
              className={`flex-shrink-0 md:flex-shrink w-auto md:w-full text-left px-3 py-1.5 md:px-4 md:py-2 rounded-lg transition-all duration-200 text-sm font-medium
                ${selectedCollection === col
                  ? 'bg-blue-600 text-white shadow-md'
                  : `${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-800'}`
                }`}
            >
              {collectionNames[col]}
            </button>
          ))}
        </nav>
      </aside>

      <main className={`flex-1 ${getContainerBgClasses()} p-4 sm:p-6 rounded-xl shadow-lg border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
        {selectedCollection === 'schedules' ? (
          <>
            <h2 className="text-xl sm:text-2xl font-extrabold mb-4 sm:mb-6 text-gray-200 dark:text-white">
              Gestión de Horarios de Menú
            </h2>
            <div className={`${getContainerBgClasses()} p-4 sm:p-6 rounded-lg mb-6 shadow-inner`}>
              <h3 className="text-lg font-semibold mb-4 text-gray-200 dark:text-white flex items-center">
                <PlusIcon className="h-5 w-5 mr-2 text-green-400" /> Configurar Horarios
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-200 dark:text-white mb-1">Inicio Desayuno</label>
                  <input
                    type="time"
                    value={schedules.breakfastStart}
                    onChange={(e) => setSchedules({ ...schedules, breakfastStart: e.target.value })}
                    className={getInputFieldClasses()}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-200 dark:text-white mb-1">Fin Desayuno</label>
                  <input
                    type="time"
                    value={schedules.breakfastEnd}
                    onChange={(e) => setSchedules({ ...schedules, breakfastEnd: e.target.value })}
                    className={getInputFieldClasses()}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-200 dark:text-white mb-1">Inicio Almuerzo</label>
                  <input
                    type="time"
                    value={schedules.lunchStart}
                    onChange={(e) => setSchedules({ ...schedules, lunchStart: e.target.value })}
                    className={getInputFieldClasses()}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-200 dark:text-white mb-1">Fin Almuerzo</label>
                  <input
                    type="time"
                    value={schedules.lunchEnd}
                    onChange={(e) => setSchedules({ ...schedules, lunchEnd: e.target.value })}
                    className={getInputFieldClasses()}
                  />
                </div>
              </div>
              <button
                onClick={handleSaveSchedules}
                className="mt-6 w-full py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold rounded-lg shadow-md transition-all duration-300 transform hover:scale-105"
              >
                Guardar Horarios
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-xl sm:text-2xl font-extrabold mb-4 sm:mb-6 text-gray-200 dark:text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
              <span>Gestión de {collectionNames[selectedCollection]}</span>
              <button
                onClick={() => setShowAddItemForm(!showAddItemForm)}
                className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200 shadow-md text-sm sm:text-base w-full sm:w-auto justify-center"
              >
                <PlusIcon className="h-5 w-5 mr-2" />
                {showAddItemForm ? 'Ocultar Formulario' : `Añadir ${collectionNames[selectedCollection]}`}
              </button>
            </h2>

            <div className={`transition-all duration-500 ease-in-out overflow-hidden ${showAddItemForm ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className={`${getContainerBgClasses()} p-4 sm:p-6 rounded-lg mb-6 shadow-inner`}>
                <h3 className="text-lg font-semibold mb-4 text-gray-200 dark:text-white flex items-center">
                  <PlusIcon className="h-5 w-5 mr-2 text-green-400" /> Agregar Nuevo {collectionNames[selectedCollection]}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    value={newItem.name}
                    onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                    placeholder={
                      selectedCollection === 'breakfastTimes' || selectedCollection === 'times'
                        ? 'Horario (ej. 07:30 o cualquier texto)'
                        : `Nombre de ${collectionNames[selectedCollection]}`
                    }
                    className={getInputFieldClasses()}
                  />
                  <input
                    value={newItem.emoji}
                    onChange={e => setNewItem({ ...newItem, emoji: e.target.value })}
                    placeholder="Emoji (ej. 🍜)"
                    className={getInputFieldClasses()}
                  />
                </div>
                {selectedCollection !== 'times' && selectedCollection !== 'breakfastTimes' && selectedCollection !== 'paymentMethods' && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                    <div>
                      <label className="block text-sm font-medium text-gray-200 dark:text-white mb-1">Imagen (opcional)</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => openCropper(e.target.files?.[0] || null, false)}
                        className={`${getInputFieldClasses()} !p-2`}
                      />
                      {uploadingImage && <p className="text-xs text-blue-300 mt-1">Subiendo imagen...</p>}
                      {/* Sugerencia en formulario de alta */}
                      {selectedCollection !== 'times' && selectedCollection !== 'breakfastTimes' && selectedCollection !== 'paymentMethods' && librarySuggestionAdd?.imageUrl && !newItem.imageUrl && (
                        <div className={`${getContainerBgClasses()} mt-3 p-3 rounded border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                          <div className="flex items-center gap-3">
                            <img src={librarySuggestionAdd.imageUrl} alt="Sugerencia" className="w-16 h-16 object-cover rounded border" />
                            <div className="flex-1">
                              <div className="text-sm font-semibold">Imagen guardada para "{newItem.name}"</div>
                              <div className="text-xs opacity-75">Usa la imagen que ya subiste anteriormente.</div>
                            </div>
                            <button type="button" onClick={() => setNewItem(prev => ({ ...prev, imageUrl: librarySuggestionAdd.imageUrl }))} className="px-3 py-1 text-xs bg-blue-600 text-white rounded">Usar</button>
                          </div>
                        </div>
                      )}
                      {/* Coincidencias múltiples en vivo */}
                      {libraryMatchesAdd.length > 0 && !newItem.imageUrl && (
                        <div className="mt-3">
                          <div className="text-xs mb-1 opacity-75">Coincidencias sugeridas</div>
                          <div className="flex flex-wrap gap-2">
                            {libraryMatchesAdd.map(sug => (
                              <button
                                key={sug.id}
                                type="button"
                                onClick={() => setNewItem(prev => ({ ...prev, imageUrl: sug.imageUrl }))}
                                className="group border rounded overflow-hidden hover:ring-2 hover:ring-blue-500 transition"
                                title={sug.name}
                              >
                                <img src={sug.imageUrl} alt={sug.name} className="w-16 h-16 object-cover block" />
                                <div className="text-[10px] px-1 py-0.5 truncate max-w-[64px] group-hover:bg-blue-600 group-hover:text-white">
                                  {sug.name}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {newItem.imageUrl && (
                      <div className="flex items-center gap-2">
                        <img
                          src={newItem.imageUrl}
                          alt="Vista previa"
                          className="w-20 h-20 object-cover rounded cursor-pointer border border-gray-600"
                          onClick={() => setPreviewImage(newItem.imageUrl)}
                        />
                        <button
                          type="button"
                          onClick={() => setCropTarget('add') || setCropSrc(newItem.imageUrl) || setCropModalOpen(true)}
                          className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded"
                        >
                          Re-recortar
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewItem(prev => ({ ...prev, imageUrl: '' }))}
                          className="px-3 py-1 text-xs bg-gray-600 hover:bg-gray-700 rounded"
                        >
                          Quitar imagen
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <textarea
                  value={newItem.description}
                  onChange={e => setNewItem({ ...newItem, description: e.target.value })}
                  placeholder="Descripción (opcional)"
                  className={`${getInputFieldClasses()} mt-4`}
                  rows="2"
                />
                {(selectedCollection === 'additions' || selectedCollection === 'breakfastAdditions') && (
                  <input
                    value={newItem.price}
                    onChange={e => setNewItem({ ...newItem, price: e.target.value })}
                    placeholder="Precio (COP)"
                    type="number"
                    min="0"
                    step="any"
                    className={`${getInputFieldClasses()} mt-4`}
                  />
                )}
                {selectedCollection === 'breakfastTypes' && (
                  <>
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-gray-200 dark:text-white mb-2">Pasos Configurables</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {stepOptions.map(step => (
                          <CustomCheckbox
                            key={step.id}
                            id={`new-step-${step.id}`}
                            label={step.label}
                            checked={newItem.steps.includes(step.id)}
                            onChange={() => {
                              setNewItem({
                                ...newItem,
                                steps: newItem.steps.includes(step.id)
                                  ? newItem.steps.filter(s => s !== step.id)
                                  : [...newItem.steps, step.id]
                              });
                            }}
                            theme={theme}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-gray-400 mt-2">
                        Nota: Los pasos "Cubiertos", "Dirección" y "Método de Pago" se incluirán automáticamente.
                      </p>
                    </div>
                  </>
                )}
                {selectedCollection !== 'times' && selectedCollection !== 'breakfastTimes' && selectedCollection !== 'paymentMethods' && (
                  <div className="mt-4">
                    <CustomCheckbox
                      id="isNew"
                      label="Marcar como 'Nuevo'"
                      checked={newItem.isNew}
                      onChange={e => setNewItem({ ...newItem, isNew: e.target.checked })}
                      theme={theme}
                    />
                  </div>
                )}
                <button
                  onClick={handleAddItem}
                  className="mt-6 w-full py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold rounded-lg shadow-md transition-all duration-300 transform hover:scale-105"
                >
                  Agregar {collectionNames[selectedCollection]}
                </button>
              </div>
            </div>

            <div className="mt-8">
              <h3 className="text-xl font-bold mb-4 text-gray-200 dark:text-white flex items-center">
                <MagnifyingGlassIcon className="h-5 w-5 mr-2 text-blue-400" /> Lista de {collectionNames[selectedCollection]}
              </h3>
              <div className="relative mb-4">
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`${getInputFieldClasses(false)} pl-10`}
                />
                <MagnifyingGlassIcon className={`absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`} />
              </div>

              {filteredItems.length === 0 && searchTerm !== '' ? (
                <p className={`text-center py-8 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>No se encontraron resultados para "{searchTerm}".</p>
              ) : filteredItems.length === 0 ? (
                <p className={`text-center py-8 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>Aún no hay elementos en esta categoría. ¡Agrega uno!</p>
              ) : (
                <div ref={itemsListRef} className="space-y-4 max-h-[calc(100vh-300px)] md:max-h-[calc(100vh-350px)] overflow-y-auto pr-2 custom-scrollbar">
                  {filteredItems.map(item => (
                    <div
                      key={item.id}
                      className={`p-4 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center transition-all duration-300 shadow-md transform hover:-translate-y-1 hover:shadow-lg
                        ${item.isFinished
                          ? 'bg-red-800/20 text-red-200 border border-red-700/50'
                          : (theme === 'dark' ? 'bg-gray-700/50 text-gray-100 border border-gray-600' : 'bg-blue-50/50 text-gray-900 border border-blue-100')
                        }`}
                    >
                      <div className="flex flex-col flex-grow mb-3 sm:mb-0">
                        <div className="flex items-center flex-wrap">
                          {item.emoji && <span className="mr-2 text-xl">{item.emoji}</span>}
                          <span className={`text-lg font-semibold ${item.isFinished ? 'line-through text-gray-400' : ''}`}>
                            {item.name || 'Unnamed Item'}
                          </span>
                          {item.isNew && (
                            <span className="ml-2 px-2 py-0.5 bg-green-500/20 text-green-300 text-xs font-bold rounded-full mt-1 sm:mt-0">NUEVO</span>
                          )}
                          {item.isFinished && (
                            <span className="ml-2 px-2 py-0.5 bg-red-500/20 text-red-300 text-xs font-bold rounded-full mt-1 sm:mt-0">AGOTADO</span>
                          )}
                        </div>
                        {item.description && <p className={`text-sm mt-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>{item.description}</p>}
                        {item.price !== undefined && (
                          <p className={`text-sm mt-1 font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>
                            Precio: ${item.price.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </p>
                        )}
                        {item.imageUrl && (
                          <div className="mt-2">
                            <img
                              src={item.imageUrl}
                              alt={`Imagen de ${item.name}`}
                              className="w-24 h-24 object-cover rounded border border-gray-600 cursor-pointer"
                              onClick={() => setPreviewImage(item.imageUrl)}
                            />
                          </div>
                        )}
                        {item.steps && (
                          <p className={`text-sm mt-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                            Pasos Configurables: {item.steps.map(step => stepOptions.find(opt => opt.id === step)?.label || step).join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 flex-wrap justify-end w-full sm:w-auto">
                        {(selectedCollection === 'times' || selectedCollection === 'breakfastTimes' || selectedCollection !== 'paymentMethods') && (
                          <button
                            onClick={() => handleToggleFinished(item)}
                            className={`p-2 rounded-full transition-all duration-300 transform hover:scale-110
                              ${item.isFinished
                                ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                                : (theme === 'dark' ? 'bg-gray-600 hover:bg-gray-500 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-700')
                              }`}
                            title={item.isFinished ? 'Marcar como Disponible' : 'Marcar como Agotado'}
                          >
                            {item.isFinished ? <CheckCircleIcon className="w-5 h-5" /> : <MinusCircleIcon className="w-5 h-5" />}
                          </button>
                        )}
                        <button
                          onClick={() => handleEditItem(item)}
                          className={`p-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white transition-all duration-300 transform hover:scale-110`}
                          title="Editar"
                        >
                          <PencilIcon className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => confirmDeleteItem(item.id, item.name || 'Unnamed Item')}
                          className={`p-2 rounded-full bg-red-600 hover:bg-red-700 text-white transition-all duration-300 transform hover:scale-110`}
                          title="Eliminar"
                        >
                          <TrashIcon className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {editingItem && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className={`relative ${getContainerBgClasses()} p-6 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl transform scale-95 animate-scale-in`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-200 dark:text-white">Editar {editingItem.name || 'Unnamed Item'}</h2>
              <button onClick={() => setEditingItem(null)} className="text-gray-400 hover:text-gray-200 p-1 rounded-full hover:bg-gray-700 transition-colors">
                <XMarkIcon className="h-7 w-7" />
              </button>
            </div>
            <div className="space-y-4">
              <input
                value={editItem.name}
                onChange={e => setEditItem({ ...editItem, name: e.target.value })}
                placeholder={
                  selectedCollection === 'breakfastTimes' || selectedCollection === 'times'
                    ? 'Horario (ej. 07:30 o cualquier texto)'
                    : 'Nombre'
                }
                className={getInputFieldClasses(false)}
              />
              <textarea
                value={editItem.description}
                onChange={e => setEditItem({ ...editItem, description: e.target.value })}
                placeholder="Descripción"
                className={getInputFieldClasses(false)}
                rows="3"
              />
              <input
                value={editItem.emoji}
                onChange={e => setEditItem({ ...editItem, emoji: e.target.value })}
                placeholder="Emoji"
                className={getInputFieldClasses(false)}
              />
              {(selectedCollection === 'additions' || selectedCollection === 'breakfastAdditions') && (
                <input
                  value={editItem.price}
                  onChange={e => setEditItem({ ...editItem, price: e.target.value })}
                  placeholder="Precio (COP)"
                  type="number"
                  min="0"
                  step="any"
                  className={getInputFieldClasses(false)}
                />
              )}
              {selectedCollection === 'breakfastTypes' && (
                <>
                  <div>
                    <h4 className="text-sm font-medium text-gray-200 dark:text-white mb-2">Pasos Configurables</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {stepOptions.map(step => (
                        <CustomCheckbox
                          key={step.id}
                          id={`edit-step-${step.id}`}
                          label={step.label}
                          checked={editItem.steps.includes(step.id)}
                          onChange={() => {
                            setEditItem({
                              ...editItem,
                              steps: editItem.steps.includes(step.id)
                                ? editItem.steps.filter(s => s !== step.id)
                                : [...editItem.steps, step.id]
                            });
                          }}
                          theme={theme}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      Nota: Los pasos "Cubiertos", "Dirección" y "Método de Pago" se incluirán automáticamente.
                    </p>
                  </div>
                </>
              )}
              {selectedCollection !== 'times' && selectedCollection !== 'breakfastTimes' && selectedCollection !== 'paymentMethods' && (
                <div className="space-y-3">
                  <CustomCheckbox
                    id="editIsNew"
                    label="Marcar como 'Nuevo'"
                    checked={editItem.isNew}
                    onChange={e => setEditItem({ ...editItem, isNew: e.target.checked })}
                    theme={theme}
                  />
                </div>
              )}
              {(selectedCollection === 'times' || selectedCollection === 'breakfastTimes' || selectedCollection !== 'paymentMethods') && (
                <CustomCheckbox
                  id="editIsFinished"
                  label="Marcar como 'Agotado'"
                  checked={editItem.isFinished}
                  onChange={e => setEditItem({ ...editItem, isFinished: e.target.checked })}
                  theme={theme}
                />
              )}
              <div>
                <label className="block text-sm font-medium text-gray-200 dark:text-white mb-1">Imagen (opcional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => openCropper(e.target.files?.[0] || null, true)}
                  className={`${getInputFieldClasses(false)} !p-2`}
                />
                {uploadingImage && <p className="text-xs text-blue-300 mt-1">Subiendo imagen...</p>}
                {editItem.imageUrl && (
                  <div className="mt-2 flex items-center gap-2">
                    <img
                      src={editItem.imageUrl}
                      alt={`Imagen de ${editItem.name}`}
                      className="w-24 h-24 object-cover rounded border border-gray-600 cursor-pointer"
                      onClick={() => setPreviewImage(editItem.imageUrl)}
                    />
                    <button
                      type="button"
                      onClick={() => setCropTarget('edit') || setCropSrc(editItem.imageUrl) || setCropModalOpen(true)}
                      className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded"
                    >
                      Re-recortar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditItem(prev => ({ ...prev, imageUrl: '' }))}
                      className="px-3 py-1 text-xs bg-gray-600 hover:bg-gray-700 rounded"
                    >
                      Quitar imagen
                    </button>
                  </div>
                )}
                {/* Sugerencia en formulario de edición */}
                {selectedCollection !== 'times' && selectedCollection !== 'breakfastTimes' && selectedCollection !== 'paymentMethods' && editingItem && librarySuggestionEdit?.imageUrl && !editItem.imageUrl && (
                  <div className={`${getContainerBgClasses()} p-3 rounded border mt-2 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div className="flex items-center gap-3">
                      <img src={librarySuggestionEdit.imageUrl} alt="Sugerencia" className="w-16 h-16 object-cover rounded border" />
                      <div className="flex-1">
                        <div className="text-sm font-semibold">Imagen guardada para "{editItem.name}"</div>
                        <div className="text-xs opacity-75">Usa la imagen que ya subiste anteriormente.</div>
                      </div>
                      <button type="button" onClick={() => setEditItem(prev => ({ ...prev, imageUrl: librarySuggestionEdit.imageUrl }))} className="px-3 py-1 text-xs bg-blue-600 text-white rounded">Usar</button>
                    </div>
                  </div>
                )}
                {/* Coincidencias múltiples en vivo (editar) */}
                {libraryMatchesEdit.length > 0 && !editItem.imageUrl && (
                  <div className="mt-3">
                    <div className="text-xs mb-1 opacity-75">Coincidencias sugeridas</div>
                    <div className="flex flex-wrap gap-2">
                      {libraryMatchesEdit.map(sug => (
                        <button
                          key={sug.id}
                          type="button"
                          onClick={() => setEditItem(prev => ({ ...prev, imageUrl: sug.imageUrl }))}
                          className="group border rounded overflow-hidden hover:ring-2 hover:ring-blue-500 transition"
                          title={sug.name}
                        >
                          <img src={sug.imageUrl} alt={sug.name} className="w-16 h-16 object-cover block" />
                          <div className="text-[10px] px-1 py-0.5 truncate max-w-[64px] group-hover:bg-blue-600 group-hover:text-white">
                            {sug.name}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-4 mt-6">
              <button onClick={handleSaveEdit} className="flex-1 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold rounded-lg shadow-md transition-all duration-300 transform hover:scale-105">Guardar Cambios</button>
              <button onClick={() => setEditingItem(null)} className="flex-1 py-3 bg-gray-600 hover:bg-gray-700 text-gray-200 font-semibold rounded-lg shadow-md transition-all duration-300 transform hover:scale-105">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {showConfirmDeleteModal && itemToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className={`relative ${getContainerBgClasses()} p-6 rounded-xl w-full max-w-sm shadow-2xl transform scale-95 animate-scale-in text-center`}>
            <XMarkIcon className="absolute top-4 right-4 h-6 w-6 text-gray-400 cursor-pointer hover:text-gray-200" onClick={() => setShowConfirmDeleteModal(false)} />
            <h3 className="text-xl font-bold mb-4 text-red-400">Confirmar Eliminación</h3>
            <p className="text-gray-200 mb-6">¿Estás seguro de que quieres eliminar "<span className="font-semibold">{itemToDelete.name || 'Unnamed Item'}</span>"? Esta acción no se puede deshacer.</p>
            <div className="flex gap-4">
              <button
                onClick={handleDeleteConfirmed}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg shadow-md transition-all duration-300 transform hover:scale-105"
              >
                Sí, Eliminar
              </button>
              <button
                onClick={() => setShowConfirmDeleteModal(false)}
                className="flex-1 py-2 bg-gray-600 hover:bg-gray-700 text-gray-200 font-semibold rounded-lg shadow-md transition-all duration-300 transform hover:scale-105"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal isOpen={!!previewImage} onClose={() => setPreviewImage(null)}>
        <div className="flex flex-col items-center justify-center">
          <img src={previewImage || ''} alt="Vista previa" className="max-w-full max-h-[70vh] object-contain rounded shadow" />
        </div>
      </Modal>

      {/* Modal de recorte (ReactCrop) */}
      <Modal isOpen={cropModalOpen} onClose={() => setCropModalOpen(false)}>
        <div className="w-[95vw] max-w-[900px]">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm opacity-80">Modo de aspecto</div>
            <div className="flex gap-2">
              {['free','1:1','4:3','16:9'].map(mode => (
                <button key={mode} onClick={() => setAspectMode(mode)} className={`px-2 py-1 text-xs rounded ${aspectMode===mode ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}>{mode}</button>
              ))}
            </div>
          </div>
          <div className="relative w-full h-[55vh] sm:h-[60vh] bg-black rounded overflow-hidden flex items-center justify-center">
            {cropSrc && (
              <ReactCrop
                crop={cropRect || undefined}
                onChange={(c) => setCropRect(c)}
                aspect={aspectMode==='free' ? undefined : (aspectMode==='1:1'? 1 : aspectMode==='4:3'? (4/3) : (16/9))}
                keepSelection
                className="h-full w-full"
              >
                <img
                  src={cropSrc}
                  alt="crop"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    const natW = img.naturalWidth;
                    const natH = img.naturalHeight;
                    const dispW = img.clientWidth;
                    const dispH = img.clientHeight;
                    setImgNatural({ width: natW, height: natH });
                    setImgDisplay({ width: dispW, height: dispH });
                    if (!cropRect) {
                      // Inicial: caja centrada utilizando tamaño mostrado
                      const minSideDisp = Math.min(dispW, dispH);
                      const size = Math.round(minSideDisp * 0.8);
                      setCropRect({ unit: 'px', x: Math.round((dispW - size)/2), y: Math.round((dispH - size)/2), width: size, height: size });
                    }
                  }}
                  style={{ height: '100%', width: 'auto', objectFit: 'contain' }}
                />
              </ReactCrop>
            )}
          </div>
          <div className="mt-4 flex gap-3 justify-end">
            <button onClick={() => setCropModalOpen(false)} className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded">Cancelar</button>
            <button onClick={applyCropAndUpload} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded">Aplicar recorte</button>
          </div>
          <p className="text-xs mt-2 opacity-60">Sugerencia: arrastra las esquinas para estirar a tu gusto. Cambia el modo para bloquear o liberar el aspecto.</p>
        </div>
      </Modal>

    </div>
  );
};

export default MenuManagement;