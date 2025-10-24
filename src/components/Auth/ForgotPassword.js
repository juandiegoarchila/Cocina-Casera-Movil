// src/components/Auth/ForgotPassword.js
import { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../config/firebase';
import { useNavigate, Link } from 'react-router-dom';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage('Se ha enviado un enlace de restablecimiento a tu correo');
    } catch (err) {
      setError('Error al enviar el correo de restablecimiento');
    }
  };

  return (
    <div className="p-4 bg-gray-900 text-white min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">Recuperar Contraseña</h1>
        {message && <div className="mb-4 p-2 bg-green-700 text-white rounded">{message}</div>}
        {error && <div className="mb-4 p-2 bg-red-700 text-white rounded">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="forgot-email" className="block mb-2">Correo Electrónico:</label>
            <input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full p-2 mb-4 bg-gray-800 border border-gray-700 rounded text-white"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-green-600 hover:bg-green-700 p-2 rounded text-white font-semibold transition duration-200"
          >
            Enviar enlace de restablecimiento
          </button>
        </form>
        <Link
          to="/login"
          className="mt-4 text-blue-400 hover:underline block text-center"
        >
          Volver al inicio de sesión
        </Link>
      </div>
    </div>
  );
};

export default ForgotPassword;