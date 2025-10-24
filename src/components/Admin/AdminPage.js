//src/components/Admin/AdminPage.js
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate, Routes, Route, Link, useLocation } from 'react-router-dom';
import { auth } from '../../config/firebase';
import { signOut } from 'firebase/auth';
import { useAuth } from '../Auth/AuthProvider';
import { Disclosure, Transition } from '@headlessui/react';
import {
  Bars3Icon, XMarkIcon, ChartBarIcon, UserGroupIcon,
  ClockIcon, DocumentTextIcon, CogIcon, ArrowLeftOnRectangleIcon,
  BellIcon, SunIcon, MoonIcon, TableCellsIcon, ClipboardDocumentListIcon, CurrencyDollarIcon
} from '@heroicons/react/24/outline';

// Lazy load components
const Dashboard = lazy(() => import('./Dashboard'));
const MenuManagement = lazy(() => import('./MenuManagement'));
const ClosingTime = lazy(() => import('./ClosingTime'));
const OrderManagement = lazy(() => import('./OrderManagement'));
const UserManagement = lazy(() => import('./UserManagement'));
const Settings = lazy(() => import('./Tasks'));
const Notifications = lazy(() => import('./Payments'));
const WaiterCashier = lazy(() => import('../Waiter/WaiterCashier'));
const TableOrdersAdmin = lazy(() => import('./TableOrdersAdmin'));
const CajaPOS = lazy(() => import('../Waiter/CajaPOS'));

const AdminPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, role } = useAuth();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [adminLoading, setAdminLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    if (loading) return;

    if (!user) {
      setError('Por favor, inicia sesión para continuar.');
      navigate('/login');
      return;
    }

    if (role !== 2) {
      setError('No tienes permisos de administrador.');
      navigate('/login');
      return;
    }

    setAdminLoading(false);
  }, [user, loading, role, navigate]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      setError(`Error al cerrar sesión: ${error.message}`);
    }
  };

  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError('');
        setSuccess('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  if (loading || adminLoading) {
    return <div className="p-4 text-white bg-gray-900 min-h-screen flex items-center justify-center">Verificando permisos...</div>;
  }

  const navigation = [
    { name: 'Dashboard', to: '/admin', icon: ChartBarIcon },
    { name: 'Gestión de Menú', to: '/admin/menu', icon: DocumentTextIcon },
    { name: 'Activar Hora de Cierre', to: '/admin/closing-time', icon: ClockIcon },
    { name: 'Gestión de Pedidos', to: '/admin/orders', icon: DocumentTextIcon },
    { name: 'Órdenes de Mesas', to: '/admin/table-orders', icon: TableCellsIcon },
    { name: 'Gestión de Usuarios', to: '/admin/users', icon: UserGroupIcon },
    { name: 'Tareas', to: '/admin/settings', icon: ClipboardDocumentListIcon },
    { name: 'Pagos', to: '/admin/Payments.js', icon: BellIcon },
  { name: 'Caja registradora', to: '/admin/caja-pos', icon: CurrencyDollarIcon },
  ];

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'} flex flex-col relative`}>
      {/* Header */}
      <Disclosure as="nav" className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-200'} shadow-lg fixed top-0 left-0 right-0 z-50`}>
        {({ open }) => (
          <>
            <div className="max-w-full mx-auto px-2 sm:px-4 lg:px-8">
              <div className="flex items-center justify-between h-16">
                <div className="flex items-center">
                  <button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none -ml-2"
                  >
                    <span className="sr-only">Toggle sidebar</span>
                    {isSidebarOpen ? (
                      <XMarkIcon className="block h-6 w-6" aria-hidden="true" />
                    ) : (
                      <Bars3Icon className="block h-6 w-6" aria-hidden="true" />
                    )}
                  </button>
                  <h1 className="text-base sm:text-lg font-semibold ml-2 sm:ml-4">Panel de Administración</h1>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    className={`p-2 rounded-full ${theme === 'dark' ? 'text-yellow-400 hover:bg-gray-700' : 'text-orange-500 hover:bg-gray-300'} focus:outline-none`}
                    aria-label="Toggle theme"
                  >
                    {theme === 'dark' ? (
                      <SunIcon className="h-6 w-6" />
                    ) : (
                      <MoonIcon className="h-6 w-6" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <Transition
              show={isSidebarOpen}
              enter="transition-all duration-300 ease-out"
              enterFrom="-translate-x-full"
              enterTo="translate-x-0"
              leave="transition-all duration-300 ease-in"
              leaveFrom="translate-x-0"
              leaveTo="-translate-x-full"
            >
              <Disclosure.Panel className="sm:hidden fixed top-0 left-0 h-full w-full bg-black/50 z-40" onClick={() => setIsSidebarOpen(false)}>
                <div className={`h-full ${isSidebarOpen ? 'w-64' : 'w-0'} ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-200'} p-4 transition-all duration-300 shadow-lg`} onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-between items-center mb-6">
                    <h2 className={`text-xl font-bold ${theme === 'dark' ? 'text-gray-100' : 'text-gray-800'}`}>Cocina Casera</h2>
                    <button
                      onClick={() => setIsSidebarOpen(false)}
                      className="p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none"
                    >
                      <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                    </button>
                  </div>
                  <nav className="space-y-2 flex flex-col h-[calc(100vh-8rem)]">
                    {navigation.map((item) => (
                      <Link
                        key={item.name}
                        to={item.to}
                        className={`relative flex items-center px-4 py-2 rounded-md text-sm font-medium
                          ${
                            location.pathname === item.to
                              ? theme === 'dark'
                                ? 'bg-indigo-700 text-white'
                                : 'bg-indigo-200 text-indigo-800'
                              : theme === 'dark'
                                ? 'text-gray-300 hover:text-white hover:bg-gray-700'
                                : 'text-gray-700 hover:text-black hover:bg-gray-300'
                          }
                          transition-all duration-200
                        `}
                        onClick={() => setIsSidebarOpen(false)}
                      >
                        {location.pathname === item.to && (
                          <span className={`absolute left-0 top-0 h-full w-1 ${theme === 'dark' ? 'bg-indigo-400' : 'bg-indigo-600'} rounded-l-md`} />
                        )}
                        <item.icon
                          className={`w-6 h-6 mr-2 ${
                            theme === 'dark' ? 'text-gray-200' : 'text-gray-700'
                          }`}
                        />
                        <span>{item.name}</span>
                      </Link>
                    ))}
                    <button
                      onClick={handleLogout}
                      className={`mt-auto flex items-center px-4 py-2 rounded-md text-sm font-medium
                        ${theme === 'dark'
                          ? 'text-red-300 hover:text-white hover:bg-red-700'
                          : 'text-red-600 hover:text-red-800 hover:bg-red-200'
                        } transition-all duration-200`}
                    >
                      <ArrowLeftOnRectangleIcon
                        className={`w-6 h-6 mr-2 ${
                          theme === 'dark' ? 'text-red-300' : 'text-red-600'
                        }`}
                      />
                      <span>Cerrar Sesión</span>
                    </button>
                  </nav>
                </div>
              </Disclosure.Panel>
            </Transition>
          </>
        )}
      </Disclosure>

      {/* Desktop Sidebar */}
      <div
        className={`hidden sm:block fixed top-16 bottom-0 left-0 ${
          isSidebarOpen ? 'w-64' : 'w-16'
        } ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-200'} p-4 transition-all duration-300 z-40`}
        onMouseEnter={() => setIsSidebarOpen(true)}
        onMouseLeave={() => setIsSidebarOpen(false)}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className={`text-xl font-bold ${theme === 'dark' ? 'text-gray-100' : 'text-gray-800'} ${isSidebarOpen ? 'block' : 'hidden'}`}>
            Cocina Casera
          </h2>
        </div>
        <nav className="space-y-2 flex flex-col h-[calc(100vh-8rem)]">
          {navigation.map((item) => (
            <Link
              key={item.name}
              to={item.to}
              className={`relative flex items-center px-4 py-2 rounded-md text-sm font-medium min-w-[48px]
                ${
                  location.pathname === item.to
                    ? theme === 'dark'
                      ? 'bg-indigo-700 text-white'
                      : 'bg-indigo-200 text-indigo-800'
                    : isSidebarOpen
                      ? theme === 'dark'
                        ? 'text-gray-300 hover:text-white hover:bg-gray-700'
                        : 'text-gray-700 hover:text-black hover:bg-gray-300'
                      : 'justify-center'
                } transition-all duration-300`}
            >
              {location.pathname === item.to && (
                <span className={`absolute left-0 top-0 h-full w-1 ${theme === 'dark' ? 'bg-indigo-400' : 'bg-indigo-600'} rounded-l-md`} />
              )}
              <item.icon
                className={`w-6 h-6 ${isSidebarOpen ? 'mr-2' : 'mr-0'} ${
                  theme === 'dark' ? 'text-gray-200' : 'text-gray-700'
                }`}
              />
              <span className={`transition-opacity duration-200 ${isSidebarOpen ? 'opacity-100 block' : 'opacity-0 hidden'}`}>{item.name}</span>
            </Link>
          ))}
          <button
            onClick={handleLogout}
            className={`mt-auto flex items-center px-4 py-2 rounded-md text-sm font-medium min-w-[48px]
              ${isSidebarOpen
                ? theme === 'dark'
                  ? 'text-red-300 hover:text-white hover:bg-red-700'
                  : 'text-red-600 hover:text-red-800 hover:bg-red-200'
                : 'justify-center'
              } transition-all duration-300`}
          >
            <ArrowLeftOnRectangleIcon
              className={`w-6 h-6 ${isSidebarOpen ? 'mr-2' : 'mr-0'} ${
                theme === 'dark' ? 'text-red-300' : 'text-red-600'
              }`}
            />
            <span className={`transition-opacity duration-200 ${isSidebarOpen ? 'opacity-100 block' : 'opacity-0 hidden'}`}>Cerrar Sesión</span>
          </button>
        </nav>
      </div>

      {/* Content */}
      <div
        className={`flex-1 p-4 pt-20 sm:pt-20 ${
          isSidebarOpen ? 'sm:ml-64' : 'sm:ml-16'
        } transition-all duration-300 min-h-screen`}
      >
        {error && (
          <div className="fixed top-24 right-4 bg-red-600 text-white p-4 rounded-lg shadow-lg z-50 max-w-xs sm:max-w-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="fixed top-24 right-4 bg-green-600 text-white p-4 rounded-lg shadow-lg z-50 max-w-xs sm:max-w-sm">
            {success}
          </div>
        )}
        <Suspense fallback={<div className="text-center py-8">Cargando sección...</div>}>
          <Routes>
            <Route
              path="/"
              element={<Dashboard setError={setError} setSuccess={setSuccess} theme={theme} />}
            />
            <Route
              path="/menu"
              element={<MenuManagement setError={setError} setSuccess={setSuccess} theme={theme} />}
            />
            <Route
              path="/closing-time"
              element={<ClosingTime setError={setError} setSuccess={setSuccess} theme={theme} />}
            />
            <Route
              path="/orders"
              element={<OrderManagement setError={setError} setSuccess={setSuccess} theme={theme} />}
            />
            <Route
              path="/table-orders"
              element={<TableOrdersAdmin setError={setError} setSuccess={setSuccess} theme={theme} />}
            />
            <Route
              path="/users"
              element={<UserManagement setError={setError} setSuccess={setSuccess} theme={theme} />}
            />
            <Route
              path="/settings"
              element={
                <Settings setError={setError} setSuccess={setSuccess} theme={theme} setTheme={setTheme} />
              }
            />
            <Route
              path="/Payments.js"
              element={<Notifications setError={setError} setSuccess={setSuccess} theme={theme} />}
            />
            <Route
              path="/cashier"
              element={<WaiterCashier setError={setError} setSuccess={setSuccess} theme={theme} canDeleteAll={true} />}
            />
            <Route
              path="/caja-pos"
              element={<CajaPOS setError={setError} setSuccess={setSuccess} theme={theme} />}
            />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
};

export default AdminPage;