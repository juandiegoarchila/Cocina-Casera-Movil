//src/App.js
import React, { useState, useEffect, lazy, Suspense, useRef } from 'react';
import { db, auth } from './config/firebase';
import { collection, onSnapshot, doc, addDoc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import useLocalStorage from './hooks/useLocalStorage';
import { Route, Routes, Navigate } from 'react-router-dom';
import { useAuth } from './components/Auth/AuthProvider';
import { initializeMealData, handleMealChange, addMeal, duplicateMeal, removeMeal, sendToWhatsApp, paymentSummary as paymentSummaryByMode } from './utils/MealLogic';
import { calculateTotal, calculateMealPrice } from './utils/MealCalculations';
import Modal from './components/Modal';
import PrivacyPolicy from './components/PrivacyPolicy';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import './styles/animations.css';
import { calculateTotalBreakfastPrice, generateMessageFromBreakfasts, calculateBreakfastPrice } from './utils/BreakfastLogic';
import { encodeMessage } from './utils/Helpers';
import CajaPOS from './components/Waiter/CajaPOS';
import { getColombiaLocalDateString } from './utils/bogotaDate';

const StaffHub = lazy(() => import('./components/Auth/StaffHub')); 
const AdminPage = lazy(() => import('./components/Admin/AdminPage'));
const Login = lazy(() => import('./components/Auth/Login'));
const ForgotPassword = lazy(() => import('./components/Auth/ForgotPassword'));
const WaiterOrderPage = lazy(() => import('./components/Waiter/WaiterDashboard'));
const DeliveryOrdersPage = lazy(() => import('./components/Delivery/DeliveryOrdersPage'));
const PedidosPage = lazy(() => import('./components/PedidosPage'));

const App = () => {
  const { user, loading } = useAuth();
  
  // Si el usuario se está cargando, mostramos un indicador de carga
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando aplicación...</p>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center">Cargando aplicación...</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/staffhub" element={<StaffHub />} />
        <Route path="/admin/*" element={<AdminPage />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route
          path="/waiter"
          element={<ProtectedRoute allowedRole={3}><WaiterOrderPage /></ProtectedRoute>}
        />
        <Route
          path="/delivery/*"
          element={<ProtectedRoute allowedRole={4}><DeliveryOrdersPage /></ProtectedRoute>}
        />
        <Route path="/caja-pos" element={<ProtectedRoute allowedRoles={[2,3]}><CajaPOS /></ProtectedRoute>} />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/pedidos" element={<PedidosPage />} />
        <Route path="/test" element={<div className="text-center text-green-500">Ruta de prueba funcionando</div>} />
      </Routes>
    </Suspense>
  );
};

export default App;