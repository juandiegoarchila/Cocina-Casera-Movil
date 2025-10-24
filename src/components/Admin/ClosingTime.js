//src/components/Admin/ClosingTime.js
import { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';

const ClosingTime = ({ setError, setSuccess, theme }) => {
  const [isOrderingDisabled, setIsOrderingDisabled] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'settings', 'global'),
      (docSnap) => {
        setIsOrderingDisabled(docSnap.exists() ? docSnap.data().isOrderingDisabled || false : false);
      },
      (error) => setError(`Error al cargar configuración: ${error.message}`)
    );
    return () => unsubscribe();
  }, [setError]);

  const handleToggle = async () => {
    if (loading) return;
    try {
      setLoading(true);
      await setDoc(doc(db, 'settings', 'global'), {
        isOrderingDisabled: !isOrderingDisabled,
        updatedAt: new Date(),
      }, { merge: true });
      setSuccess(`Pedidos ${!isOrderingDisabled ? 'cerrados' : 'habilitados'}`);
    } catch (err) {
      setError(`Error al actualizar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const isDark = theme === 'dark';
  const switchColor = isOrderingDisabled ? 'bg-red-500' : 'bg-green-500';
  const trackColor = isOrderingDisabled ? 'bg-red-300 dark:bg-red-700' : 'bg-green-300 dark:bg-green-700';
  const titleColor = isDark ? 'text-white' : 'text-gray-900';
  const subTextColor = isDark ? 'text-gray-300' : 'text-gray-600';

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-6">
      <div className={`backdrop-blur-xl bg-white/10 dark:bg-black/20 border border-white/20 rounded-3xl shadow-xl p-8 w-full max-w-md`}>
        <h2 className={`text-center text-2xl font-bold mb-4 ${titleColor}`}>
          Control de Pedidos
        </h2>

        <div className="text-center mb-6">
          <p className={`text-lg font-semibold ${titleColor}`}>
            {isOrderingDisabled ? 'Restaurante Cerrados' : 'Restaurante Abiertos'}
          </p>
          <p className={`text-sm mt-1 ${subTextColor}`}>
            {isOrderingDisabled
              ? 'Pedidos deshabilitados. Los clientes no podrán hacer pedidos por ahora.'
              : 'El sistema está activo. Los pedidos están siendo recibidos.'}
          </p>
        </div>

        <div
          onClick={handleToggle}
          className={`w-20 h-10 mx-auto rounded-full p-1 flex items-center ${trackColor} transition-colors duration-300 cursor-pointer relative`}
        >
          <div
            className={`h-8 w-8 rounded-full shadow-md ${switchColor} transform transition-transform duration-300 ease-in-out
              ${isOrderingDisabled ? 'translate-x-0' : 'translate-x-10'}`}
          />
        </div>

        <p className="text-center text-xs mt-4 italic text-gray-400">
          {isOrderingDisabled ? '¡Tiempo de descanso!' : 'Pedidos habilitados 💬'}
        </p>
      </div>
    </div>
  );
};

export default ClosingTime;
