import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, Transition, Menu } from '@headlessui/react';
import { XMarkIcon, PencilIcon, TrashIcon, InformationCircleIcon, EllipsisVerticalIcon, PlusIcon } from '@heroicons/react/24/outline';
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/20/solid';
import { db, auth, app } from '../../config/firebase';
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { collection, onSnapshot, updateDoc, doc, deleteDoc, query, where, orderBy, limit, getDocs, runTransaction, addDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { classNames } from '../../utils/classNames';

import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Reused and slightly enhanced from OrderManagement
const cleanText = (text) => {
  if (text == null) return '';
  if (typeof text === 'string') return text.replace(' NUEVO', '').trim();
  if (typeof text === 'boolean') return text.toString();
  if (typeof text === 'object' && text !== null && 'name' in text) return String(text.name).replace(' NUEVO', '').trim();
  return String(text).replace(' NUEVO', '').trim();
};

const getAddressDisplay = (address) => {
  if (!address?.address) return 'Sin dirección';
  let display = address.address;
  switch (address.addressType) {
    case 'school': if (address.recipientName) display += ` (Recibe: ${cleanText(address.recipientName)})`; break;
    case 'complex': if (address.unitDetails) display += ` (${cleanText(address.unitDetails)})`; break;
    case 'shop': if (address.localName) display += ` (${cleanText(address.localName)})`; break;
    default: break;
  }
  return display;
};

// New utility for debouncing search input
const debounce = (func, delay) => {
  let timeout;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
};

// Define role map for easier display and conversion
const ROLE_MAP = {
  1: 'Cliente',
  2: 'Administrador',
  3: 'Mesero',
  4: 'Domiciliario',
};

const UserManagement = ({ setError, setSuccess, theme }) => {
  const [users, setUsers] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [editUserForm, setEditUserForm] = useState({ email: '', role: 1, totalOrders: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showUserDetailsModal, setShowUserDetailsModal] = useState(null);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [createUserForm, setCreateUserForm] = useState({ email: '', password: '', role: 1, totalOrders: 0 });
  const [pagination, setPagination] = useState({ currentPage: 1, itemsPerPage: 10 });
  const [sortColumn, setSortColumn] = useState(null);
  const [sortOrder, setSortOrder] = useState('asc');

  const debouncedSetSearchTerm = useCallback(
    debounce((value) => setSearchTerm(value), 300),
    []
  );

  const sortedAndFilteredUsers = useMemo(() => {
    let currentUsers = users;

    if (searchTerm) {
      currentUsers = currentUsers.filter(user =>
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ROLE_MAP[`${user.role}`]?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (sortColumn) {
      currentUsers = [...currentUsers].sort((a, b) => {
        let valA, valB;

        switch (sortColumn) {
          case 'email':
            valA = a.email.toLowerCase();
            valB = b.email.toLowerCase();
            break;
          case 'address':
            valA = a.address.toLowerCase();
            valB = b.address.toLowerCase();
            break;
          case 'role':
            valA = a.role;
            valB = b.role;
            break;
          case 'totalOrders':
            valA = a.totalOrders || 0;
            valB = b.totalOrders || 0;
            break;
          case 'number':
          default:
            valA = a.number;
            valB = b.number;
            break;
        }

        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return currentUsers;
  }, [users, searchTerm, sortColumn, sortOrder]);

  const totalPages = Math.ceil(sortedAndFilteredUsers.length / pagination.itemsPerPage);
  const paginatedUsers = useMemo(() => {
    const startIndex = (pagination.currentPage - 1) * pagination.itemsPerPage;
    const endIndex = startIndex + pagination.itemsPerPage;
    return sortedAndFilteredUsers.slice(startIndex, endIndex);
  }, [sortedAndFilteredUsers, pagination.currentPage, pagination.itemsPerPage]);

  useEffect(() => {
    setIsLoading(true);
    const usersCollectionRef = collection(db, 'users');
    const unsubscribe = onSnapshot(usersCollectionRef, async (snapshot) => {
      try {
        const usersData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt || { seconds: 0 },
        }));

        usersData.sort((a, b) => {
          const timeA = a.createdAt?.seconds || 0;
          const timeB = b.createdAt?.seconds || 0;
          return timeA - timeB;
        });

        const usersWithAddresses = await Promise.all(
          usersData.map(async (user, index) => {
            try {
              const ordersQuery = query(
                collection(db, 'orders'),
                where('userId', '==', user.id),
                orderBy('createdAt', 'desc'),
                limit(1)
              );
              const orderSnapshot = await getDocs(ordersQuery);
              let address = 'Sin pedidos';
              if (!orderSnapshot.empty) {
                const orderData = orderSnapshot.docs?.[0]?.data();
                address = getAddressDisplay(orderData?.meals?.[0]?.address);
              }
              return {
                ...user,
                number: index + 1,
                address,
              };
            } catch (error) {
              console.error(`Error fetching address for user ${user.id}:`, error.message);
              return {
                ...user,
                number: index + 1,
                address: 'Error al cargar dirección',
              };
            }
          })
        );

        setUsers(usersWithAddresses);
        setFetchError(null);
      } catch (error) {
        console.error('Error in UserManagement onSnapshot:', error);
        setError(`Error al cargar usuarios: ${error.message}`);
        setFetchError(error.message);
      } finally {
        setIsLoading(false);
      }
    }, (error) => {
      console.error('onSnapshot listener error:', error);
      setError(`Error al cargar usuarios: ${error.message}`);
      setFetchError(error.message);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [setError]);

  const handleEditUser = useCallback((user) => {
    setEditingUser(user);
    setEditUserForm({
      email: user.email || '',
      role: user.role || 1,
      totalOrders: user.totalOrders || 0,
    });
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingUser) return;
    setIsLoading(true);
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', editingUser.id);
        transaction.update(userRef, {
          email: editUserForm.email.trim(),
          role: Number(editUserForm.role),
          totalOrders: Number(editUserForm.totalOrders),
        });
      });
      setEditingUser(null);
      setSuccess('Usuario actualizado con éxito.');
    } catch (error) {
      console.error('Error al guardar usuario:', error);
      setError(`Error al actualizar usuario: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [editingUser, editUserForm, setSuccess, setError]);

  const handleDeleteUser = useCallback(async (userId) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar este usuario? Esta acción es irreversible.')) {
      return;
    }
    setIsLoading(true);
    try {
      await deleteDoc(doc(db, 'users', userId));
      setSuccess('Usuario eliminado con éxito.');
    } catch (error) {
      console.error('Error al eliminar usuario:', error);
      setError(`Error al eliminar usuario: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [setSuccess, setError]);

  const handleCreateUser = useCallback(async () => {
    if (!createUserForm.email.trim()) {
      setError('El email es obligatorio.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createUserForm.email)) {
      setError('Por favor, ingresa un email válido.');
      return;
    }
    if (!createUserForm.password || createUserForm.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    setIsLoading(true);
    try {
      // Verificar si el email ya existe en Firestore
      const q = query(collection(db, 'users'), where('email', '==', createUserForm.email.trim()));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        setError('El email ya está registrado.');
        setIsLoading(false);
        return;
      }

      // Guardar las credenciales del administrador actual
      const currentUser = auth.currentUser;
      const currentUserEmail = currentUser?.email;
      
      // Crear app secundaria para no afectar la sesión actual
      const secondaryApp = initializeApp(app.options, 'createUser');
      const secondaryAuth = getAuth(secondaryApp);
      
      // Crear usuario en Firebase Authentication usando la app secundaria
      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth, 
        createUserForm.email.trim(), 
        createUserForm.password
      );
      const userId = userCredential.user.uid;

      // Crear usuario en Firestore con el mismo ID
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', userId);
        transaction.set(userRef, {
          email: createUserForm.email.trim(),
          role: Number(createUserForm.role),
          totalOrders: Number(createUserForm.totalOrders) || 0,
          createdAt: new Date(),
        });
      });

      // Cerrar sesión del nuevo usuario en la app secundaria
      await signOut(secondaryAuth);
      
      // Nota: No necesitamos eliminar la app secundaria ya que se limpia automáticamente

      setCreateUserForm({ email: '', password: '', role: 1, totalOrders: 0 });
      setShowCreateUserModal(false);
      setSuccess('Usuario creado con éxito.');
    } catch (error) {
      console.error('Error al crear usuario:', error);
      setError(`Error al crear usuario: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [createUserForm, setSuccess, setError]);

  const handlePageChange = useCallback((newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPagination(prev => ({ ...prev, currentPage: newPage }));
    }
  }, [totalPages]);

  const handleItemsPerPageChange = useCallback((e) => {
    setPagination({ currentPage: 1, itemsPerPage: Number(e.target.value) });
  }, []);

  const handleSort = useCallback((columnName) => {
    if (sortColumn === columnName) {
      setSortOrder(prevOrder => (prevOrder === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(columnName);
      setSortOrder('asc');
    }
    setPagination(prev => ({ ...prev, currentPage: 1 }));
  }, [sortColumn]);

  const getSortIcon = useCallback((columnName) => {
    if (sortColumn === columnName) {
      return sortOrder === 'asc' ? (
        <ChevronUpIcon className="w-4 h-4 inline-block ml-1" />
      ) : (
        <ChevronDownIcon className="w-4 h-4 inline-block ml-1" />
      );
    }
    return null;
  }, [sortColumn, sortOrder]);

  // --- Export Functions ---
  const getExportData = useCallback(() => {
    return sortedAndFilteredUsers.map(user => ({
      'Nº': user.number,
      'Email': user.email,
      'Dirección': user.address,
      'Rol': ROLE_MAP[`${user.role}`],
      'Pedidos': user.totalOrders || 0,
      'ID de Usuario': user.id,
      'Registrado Desde': user.createdAt?.seconds ? new Date(user.createdAt.seconds * 1000).toLocaleDateString('es-CO') : 'N/A',
    }));
  }, [sortedAndFilteredUsers]);

  const exportToExcel = useCallback(() => {
    const data = getExportData();
    if (data.length === 0) {
      setError('No hay datos para exportar a Excel.');
      return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Usuarios");
    XLSX.writeFile(wb, "usuarios.xlsx");
    setSuccess('Usuarios exportados a Excel con éxito.');
  }, [getExportData, setSuccess, setError]);

  const exportToPDF = useCallback(() => {
    const data = getExportData();
    if (data.length === 0) {
      setError('No hay datos para exportar a PDF.');
      return;
    }
    const doc = new jsPDF();
    const head = [Object.keys(data?.[0] || {})];
    const body = data.map(row => Object.values(row));

    doc.autoTable({
      head: head,
      body: body,
      startY: 20,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [20, 83, 136],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [240, 240, 240]
      },
      margin: { top: 10, left: 10, right: 10, bottom: 10 },
    });

    doc.save("usuarios.pdf");
    setSuccess('Usuarios exportados a PDF con éxito.');
  }, [getExportData, setSuccess, setError]);

  const previewTable = useCallback(() => {
    const exportData = getExportData();
    if (exportData.length === 0) {
      setError('No hay datos para previsualizar.');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setError('Pop-ups bloqueados. Por favor, permita pop-ups para previsualizar.');
      return;
    }

    let tableHtml = `
      <html>
      <head>
        <title>Previsualización de Usuarios</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { text-align: center; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          @media print {
            body { margin: 0; }
            table { font-size: 10pt; }
          }
        </style>
      </head>
      <body>
        <h1>Reporte de Usuarios</h1>
        <table>
          <thead>
            <tr>
              ${Object.keys(exportData?.[0] || {}).map(key => `<th>${key}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${exportData.map(row => `
              <tr>
                ${Object.values(row).map(value => `<td>${value}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

    printWindow.document.write(tableHtml);
    printWindow.document.close();
    printWindow.focus();
  }, [getExportData, setError]);

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-6">
      <h2 className="text-xl sm:text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">Gestión de Usuarios</h2>
      {fetchError && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg dark:bg-red-900 dark:text-red-200">
          Error al cargar datos: {fetchError}
        </div>
      )}

      {/* Contenedor principal que contendrá los grupos de elementos */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Contenedor para el input del buscador y el botón de menú */}
        <div className="flex items-center w-full min-w-0 flex-grow">
          <input
            type="text"
            placeholder="Buscar por email, dirección o rol..."
            onChange={(e) => debouncedSetSearchTerm(e.target.value)}
            className={classNames(
              "p-2 rounded-md border flex-grow w-full max-w-[30rem]",
              theme === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900',
              "focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            )}
            aria-label="Buscar usuarios"
          />

          <Menu as="div" className="relative inline-block text-left z-20 flex-shrink-0 -ml-px">
            <div>
              <Menu.Button
                className={classNames(
                  "inline-flex justify-center text-sm font-medium rounded-md",
                  theme === 'dark' ? 'text-gray-300 hover:text-gray-100' : 'text-gray-700 hover:text-gray-900',
                  "p-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                  "pr-2"
                )}
                aria-label="Opciones de exportación"
              >
                <EllipsisVerticalIcon className="h-6 w-6" aria-hidden="true" />
              </Menu.Button>
            </div>

            <Transition
              as={React.Fragment}
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Menu.Items className={classNames(
                "absolute right-0 mt-2 w-48 origin-top-right divide-y divide-gray-100 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none",
                theme === 'dark' ? 'bg-gray-700 divide-gray-600' : 'bg-white divide-gray-100'
              )}>
                <div className="py-1">
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={() => setShowCreateUserModal(true)}
                        className={classNames(
                          active ? (theme === 'dark' ? 'bg-gray-600 text-gray-100' : 'bg-gray-100 text-gray-900') : (theme === 'dark' ? 'text-gray-300' : 'text-gray-700'),
                          'flex items-center px-4 py-2 text-sm w-full text-left'
                        )}
                      >
                        <PlusIcon className="w-5 h-5 mr-2" />
                        Agregar Usuario
                      </button>
                    )}
                  </Menu.Item>
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={exportToExcel}
                        className={classNames(
                          active ? (theme === 'dark' ? 'bg-gray-600 text-gray-100' : 'bg-gray-100 text-gray-900') : (theme === 'dark' ? 'text-gray-300' : 'text-gray-700'),
                          'block px-4 py-2 text-sm w-full text-left'
                        )}
                      >
                        Exportar a Excel
                      </button>
                    )}
                  </Menu.Item>
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={exportToPDF}
                        className={classNames(
                          active ? (theme === 'dark' ? 'bg-gray-600 text-gray-100' : 'bg-gray-100 text-gray-900') : (theme === 'dark' ? 'text-gray-300' : 'text-gray-700'),
                          'block px-4 py-2 text-sm w-full text-left'
                        )}
                      >
                        Exportar a PDF
                      </button>
                    )}
                  </Menu.Item>
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={previewTable}
                        className={classNames(
                          active ? (theme === 'dark' ? 'bg-gray-600 text-gray-100' : 'bg-gray-100 text-gray-900') : (theme === 'dark' ? 'text-gray-300' : 'text-gray-700'),
                          'block px-4 py-2 text-sm w-full text-left'
                        )}
                      >
                        Previsualizar
                      </button>
                    )}
                  </Menu.Item>
                </div>
              </Menu.Items>
            </Transition>
          </Menu>
        </div>
      </div>

      <div className={classNames(
        "p-4 sm:p-6 rounded-2xl shadow-xl max-h-[70vh] overflow-y-auto custom-scrollbar",
        theme === 'dark' ? 'bg-gray-800' : 'bg-white'
      )}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className={classNames(
                "font-semibold sticky top-0 z-10",
                theme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
              )}>
                <th className="p-2 border-b cursor-pointer whitespace-nowrap" onClick={() => handleSort('number')}>
                  Nº {getSortIcon('number')}
                </th>
                <th className="p-2 border-b cursor-pointer whitespace-nowrap" onClick={() => handleSort('email')}>
                  Email {getSortIcon('email')}
                </th>
                <th className="p-2 border-b cursor-pointer whitespace-nowrap" onClick={() => handleSort('address')}>
                  Dirección {getSortIcon('address')}
                </th>
                <th className="p-2 border-b cursor-pointer whitespace-nowrap" onClick={() => handleSort('role')}>
                  Rol {getSortIcon('role')}
                </th>
                <th className="p-2 border-b cursor-pointer whitespace-nowrap" onClick={() => handleSort('totalOrders')}>
                  Pedidos {getSortIcon('totalOrders')}
                </th>
                <th className="p-2 border-b whitespace-nowrap">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="6" className="p-6 text-center text-gray-500 dark:text-gray-400">
                    <div className="flex justify-center items-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                      <span className="ml-3">Cargando usuarios...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedUsers.length === 0 && !fetchError ? (
                <tr>
                  <td colSpan="6" className="p-6 text-center text-gray-500 dark:text-gray-400">
                    No se encontraron usuarios.
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((user) => (
                  <tr
                    key={user.id}
                    className={classNames(
                      "border-b transition-colors duration-150",
                      theme === 'dark' ? 'border-gray-700 hover:bg-gray-700' : 'border-gray-200 hover:bg-gray-50',
                      user.number % 2 === 0 ? (theme === 'dark' ? 'bg-gray-750' : 'bg-gray-50') : ''
                    )}
                  >
                    <td className="p-2 text-gray-900 dark:text-gray-300">{user.number}</td>
                    <td className="p-2 text-gray-900 dark:text-gray-300 font-medium">{user.email}</td>
                    <td className="p-2 text-gray-900 dark:text-gray-300 max-w-[150px] sm:max-w-[250px] overflow-hidden text-ellipsis whitespace-nowrap" title={user.address}>
                      {user.address}
                    </td>
                    <td className="p-2 text-gray-900 dark:text-gray-300">
                      <span className={classNames(
                        "px-2 py-1 rounded-full text-xs font-semibold",
                        user.role === 2 ? 'bg-purple-200 text-purple-800 dark:bg-purple-800 dark:text-purple-200' :
                        user.role === 3 ? 'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-200' :
                        user.role === 4 ? 'bg-orange-200 text-orange-800 dark:bg-orange-800 dark:text-orange-200' :
                        'bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-200'
                      )}>
                        {ROLE_MAP[`${user.role}`] || 'Desconocido'}
                      </span>
                    </td>
                    <td className="p-2 text-gray-900 dark:text-gray-300">{user.totalOrders || 0}</td>
                    <td className="p-2 flex space-x-1 items-center">
                      <button
                        onClick={() => handleEditUser(user)}
                        className="text-blue-500 hover:text-blue-400 p-1 rounded-md transition-colors duration-150"
                        title="Editar usuario"
                        aria-label={`Editar usuario ${user.email}`}
                      >
                        <PencilIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="text-red-500 hover:text-red-400 p-1 rounded-md transition-colors duration-150"
                        title="Eliminar usuario"
                        aria-label={`Eliminar usuario ${user.email}`}
                      >
                        <TrashIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                      <button
                        onClick={() => setShowUserDetailsModal(user)}
                        className="text-gray-500 hover:text-gray-400 p-1 rounded-md transition-colors duration-150"
                        title="Ver detalles del usuario"
                        aria-label="Ver detalles del usuario"
                      >
                        <InformationCircleIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {sortedAndFilteredUsers.length > 0 && (
          <div className="flex flex-col sm:flex-row justify-between items-center mt-6 gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">Usuarios por página:</span>
              <select
                value={pagination.itemsPerPage}
                onChange={handleItemsPerPageChange}
                className={classNames(
                  "p-1 sm:p-2 rounded-lg border text-sm",
                  theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white text-gray-900'
                )}
                aria-label="Seleccionar número de usuarios por página"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(pagination.currentPage - 1)}
                disabled={pagination.currentPage === 1}
                className={classNames(
                  "p-2 rounded-lg transition-all duration-200",
                  pagination.currentPage === 1 ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'
                )}
                aria-label="Página anterior"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Página {pagination.currentPage} de {totalPages}
              </span>
              <button
                onClick={() => handlePageChange(pagination.currentPage + 1)}
                disabled={pagination.currentPage === totalPages}
                className={classNames(
                  "p-2 rounded-lg transition-all duration-200",
                  pagination.currentPage === totalPages ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'
                )}
                aria-label="Página siguiente"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      <Transition show={showCreateUserModal} as={React.Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setShowCreateUserModal(false)}>
          <Transition.Child
            as={React.Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-50" />
          </Transition.Child>
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <Transition.Child
              as={React.Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className={classNames(
                "w-full max-w-md p-6 rounded-lg shadow-xl max-h-[80vh] overflow-y-auto",
                theme === 'dark' ? 'bg-gray-800 text-gray-200' : 'bg-gray-50 text-gray-900'
              )}>
                <div className="flex justify-between items-center mb-4">
                  <Dialog.Title className="text-lg font-medium">
                    Crear Nuevo Usuario
                  </Dialog.Title>
                  <button
                    onClick={() => setShowCreateUserModal(false)}
                    className="text-gray-500 hover:text-gray-400 dark:hover:text-gray-300"
                    aria-label="Cerrar modal"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
                <form onSubmit={(e) => { e.preventDefault(); handleCreateUser(); }}>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="create-email-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                      <input
                        id="create-email-input"
                        type="email"
                        value={createUserForm.email}
                        onChange={e => setCreateUserForm({ ...createUserForm, email: e.target.value })}
                        className={classNames(
                          "w-full p-2 rounded-md border text-sm",
                          theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-200 bg-white text-gray-900',
                          "focus:outline-none focus:ring-1 focus:ring-blue-500"
                        )}
                        placeholder="Ej: usuario@ejemplo.com"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="create-password-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contraseña</label>
                      <input
                        id="create-password-input"
                        type="password"
                        value={createUserForm.password}
                        onChange={e => setCreateUserForm({ ...createUserForm, password: e.target.value })}
                        className={classNames(
                          "w-full p-2 rounded-md border text-sm",
                          theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-200 bg-white text-gray-900',
                          "focus:outline-none focus:ring-1 focus:ring-blue-500"
                        )}
                        placeholder="Mínimo 6 caracteres"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="create-role-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rol</label>
                      <select
                        id="create-role-select"
                        value={createUserForm.role}
                        onChange={e => setCreateUserForm({ ...createUserForm, role: Number(e.target.value) })}
                        className={classNames(
                          "w-full p-2 rounded-md border text-sm",
                          theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-200 bg-white text-gray-900',
                          "focus:outline-none focus:ring-1 focus:ring-blue-500"
                        )}
                      >
                        <option value={1}>Cliente</option>
                        <option value={2}>Administrador</option>
                        <option value={3}>Mesero</option>
                        <option value={4}>Domiciliario</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="create-total-orders-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pedidos</label>
                      <input
                        id="create-total-orders-input"
                        type="number"
                        value={createUserForm.totalOrders}
                        onChange={e => setCreateUserForm({ ...createUserForm, totalOrders: Number(e.target.value) })}
                        className={classNames(
                          "w-full p-2 rounded-md border text-sm",
                          theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-200 bg-white text-gray-900',
                          "focus:outline-none focus:ring-1 focus:ring-blue-500"
                        )}
                        min="0"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowCreateUserModal(false)}
                        className={classNames(
                          "px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200",
                          theme === 'dark' ? 'bg-gray-600 hover:bg-gray-700 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                        )}
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={isLoading}
                        className={classNames(
                          "px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200",
                          isLoading ? 'bg-gray-400 cursor-not-allowed' : theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'
                        )}
                      >
                        {isLoading ? 'Creando...' : 'Crear'}
                      </button>
                    </div>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition>

      {/* Edit User Modal */}
      <Transition show={editingUser !== null} as={React.Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setEditingUser(null)}>
          <Transition.Child
            as={React.Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-50" />
          </Transition.Child>
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <Transition.Child
              as={React.Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className={classNames(
                "w-full max-w-md p-6 rounded-lg shadow-xl max-h-[80vh] overflow-y-auto",
                theme === 'dark' ? 'bg-gray-800 text-gray-200' : 'bg-gray-50 text-gray-900'
              )}>
                <div className="flex justify-between items-center mb-4">
                  <Dialog.Title className="text-lg font-medium">
                    Editar Usuario
                  </Dialog.Title>
                  <button
                    onClick={() => setEditingUser(null)}
                    className="text-gray-500 hover:text-gray-400 dark:hover:text-gray-300"
                    aria-label="Cerrar modal"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
                <form onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }}>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="email-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                      <input
                        id="email-input"
                        type="email"
                        value={editUserForm.email}
                        onChange={e => setEditUserForm({ ...editUserForm, email: e.target.value })}
                        className={classNames(
                          "w-full p-2 rounded-md border text-sm",
                          theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-200 bg-white text-gray-900',
                          "focus:outline-none focus:ring-1 focus:ring-blue-500"
                        )}
                        placeholder="Ej: usuario@ejemplo.com"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="role-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rol</label>
                      <select
                        id="role-select"
                        value={editUserForm.role}
                        onChange={e => setEditUserForm({ ...editUserForm, role: Number(e.target.value) })}
                        className={classNames(
                          "w-full p-2 rounded-md border text-sm",
                          theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-200 bg-white text-gray-900',
                          "focus:outline-none focus:ring-1 focus:ring-blue-500"
                        )}
                      >
                        <option value={1}>Cliente</option>
                        <option value={2}>Administrador</option>
                        <option value={3}>Mesero</option>
                        <option value={4}>Domiciliario</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="total-orders-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pedidos</label>
                      <input
                        id="total-orders-input"
                        type="number"
                        value={editUserForm.totalOrders}
                        onChange={e => setEditUserForm({ ...editUserForm, totalOrders: Number(e.target.value) })}
                        className={classNames(
                          "w-full p-2 rounded-md border text-sm",
                          theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-200 bg-white text-gray-900',
                          "focus:outline-none focus:ring-1 focus:ring-blue-500"
                        )}
                        min="0"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingUser(null)}
                        className={classNames(
                          "px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200",
                          theme === 'dark' ? 'bg-gray-600 hover:bg-gray-700 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                        )}
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={isLoading}
                        className={classNames(
                          "px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200",
                          isLoading ? 'bg-gray-400 cursor-not-allowed' : theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'
                        )}
                      >
                        {isLoading ? 'Guardando...' : 'Guardar'}
                      </button>
                    </div>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition>

      {/* User Details Modal */}
      <Transition show={showUserDetailsModal !== null} as={React.Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setShowUserDetailsModal(null)}>
          <Transition.Child
            as={React.Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-50" />
          </Transition.Child>
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <Transition.Child
              as={React.Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className={classNames(
                "w-full max-w-md p-6 rounded-lg shadow-xl max-h-[80vh] overflow-y-auto",
                theme === 'dark' ? 'bg-gray-800 text-gray-200' : 'bg-gray-50 text-gray-900'
              )}>
                <div className="flex justify-between items-center mb-4">
                  <Dialog.Title className="text-lg font-medium">
                    Detalles del Usuario
                  </Dialog.Title>
                  <button
                    onClick={() => setShowUserDetailsModal(null)}
                    className="text-gray-500 hover:text-gray-400 dark:hover:text-gray-300"
                    aria-label="Cerrar modal de detalles"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
                {showUserDetailsModal && (
                  <div className="space-y-3 text-sm">
                    <p><span className="font-semibold">Email:</span> {showUserDetailsModal.email}</p>
                    <p><span className="font-semibold">ID de Usuario:</span> {showUserDetailsModal.id}</p>
                    <p><span className="font-semibold">Rol:</span> {ROLE_MAP[`${showUserDetailsModal.role}`] || 'Desconocido'}</p>
                    <p><span className="font-semibold">Total de Pedidos:</span> {showUserDetailsModal.totalOrders || 0}</p>
                    <p><span className="font-semibold">Dirección:</span> {showUserDetailsModal.address}</p>
                    {showUserDetailsModal.createdAt?.seconds && (
                      <p><span className="font-semibold">Registrado Desde:</span> {new Date(showUserDetailsModal.createdAt.seconds * 1000).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    )}
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
};

export default UserManagement;