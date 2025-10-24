// src/components/Auth/StaffHub.js
import { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { useNavigate, Link } from 'react-router-dom';
import { query, collection, where, getDocs } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { db, auth } from '../../config/firebase';

const StaffHub = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const { login, user, loading, role } = useAuth();
  const navigate = useNavigate();

  // Cargar datos guardados al iniciar
  useEffect(() => {
    const savedEmail = localStorage.getItem('staffHub_email');
    const savedRememberMe = localStorage.getItem('staffHub_rememberMe') === 'true';
    if (savedEmail && savedRememberMe) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  useEffect(() => {
    if (!loading && user && role) {
      switch (role) {
        case 3: // Mesera
          navigate('/waiter');
          break;
        case 4: // Domiciliario (futuro)
          navigate('/delivery');
          break;
        case 5: // Cocinera (futuro)
          setError('Funcionalidad para cocineras en desarrollo. Contacta al administrador.');
          setTimeout(() => navigate('/staffhub'), 3000);
          break;
        default:
          setError('No tienes permisos para acceder como personal');
          setTimeout(() => navigate('/staffhub'), 3000);
      }
    }
  }, [user, loading, role, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      await login(email, password);
      
      // Guardar o limpiar datos según "Recordarme"
      if (rememberMe) {
        localStorage.setItem('staffHub_email', email);
        localStorage.setItem('staffHub_rememberMe', 'true');
      } else {
        localStorage.removeItem('staffHub_email');
        localStorage.removeItem('staffHub_rememberMe');
      }
    } catch (err) {
      setError('Correo o contraseña incorrectos');
      setIsLoading(false);
    }
  };

  const handleForgotPassword = () => {
    setError('');
    setShowPasswordReset(true);
    setResetEmail(email); // Pre-llenar con el email actual si existe
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setResetLoading(true);
    setResetMessage('');
    setError('');

    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetMessage('Se ha enviado un enlace de restablecimiento a tu correo electrónico.');
    } catch (error) {
      let errorMessage = 'Error al enviar el enlace de restablecimiento.';
      
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No se encontró una cuenta con este correo electrónico.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'El correo electrónico no es válido.';
      }
      
      setError(errorMessage);
    } finally {
      setResetLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setShowPasswordReset(false);
    setResetEmail('');
    setResetMessage('');
    setError('');
  };

  if (loading) {
    return <div className="p-4 text-white bg-gray-900">Cargando...</div>;
  }

  return (
    <div className="p-4 bg-gray-900 text-white min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">
          {showPasswordReset ? 'Recuperar Contraseña' : 'StaffHub - Acceso Personal'}
        </h1>
        {error && <div className="mb-4 p-2 bg-red-700 text-white rounded">{error}</div>}
        {resetMessage && <div className="mb-4 p-2 bg-green-700 text-white rounded">{resetMessage}</div>}

        {showPasswordReset ? (
          // Formulario de recuperación de contraseña
          <form onSubmit={handlePasswordReset} className="space-y-4">
            <div>
              <label htmlFor="reset-email" className="block mb-2">Correo Electrónico:</label>
              <input
                id="reset-email"
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required
                className="w-full p-2 mb-4 bg-gray-800 border border-gray-700 rounded text-white"
                placeholder="Ingresa tu correo electrónico"
              />
            </div>
            
            <button
              type="submit"
              disabled={resetLoading}
              className={`w-full bg-blue-600 hover:bg-blue-700 p-2 rounded text-white font-semibold transition duration-200 ${
                resetLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {resetLoading ? 'Enviando...' : 'Enviar enlace de restablecimiento'}
            </button>
            
            <button
              type="button"
              onClick={handleBackToLogin}
              className="w-full bg-gray-600 hover:bg-gray-700 p-2 rounded text-white font-semibold transition duration-200"
            >
              Volver al inicio de sesión
            </button>
          </form>
        ) : (
          // Formulario de login normal
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="staff-email" className="block mb-2">Correo Electrónico:</label>
            <input
              id="staff-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full p-2 mb-4 bg-gray-800 border border-gray-700 rounded text-white"
            />
          </div>
          <div className="relative">
            <label htmlFor="staff-password" className="block mb-2">Contraseña:</label>
            <input
              id="staff-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full p-2 mb-4 bg-gray-800 border border-gray-700 rounded text-white"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-10 text-gray-400"
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="mr-2 w-4 h-4 text-green-600 bg-gray-800 border-gray-700 rounded focus:ring-green-500"
              />
              <label htmlFor="remember-me" className="text-sm text-gray-300">
                Recordarme
              </label>
            </div>
            
            <button 
              onClick={handleForgotPassword}
              className="text-blue-400 hover:underline text-sm"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
          
          <button
            type="submit"
            disabled={isLoading}
            className={`w-full bg-green-600 hover:bg-green-700 p-2 rounded text-white font-semibold transition duration-200 ${
              isLoading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isLoading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
        )}
      </div>
    </div>
  );
};

export default StaffHub;