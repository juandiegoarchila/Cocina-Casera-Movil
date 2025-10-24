// src/components/Admin/utilities/orderUtils.js
import { db } from '../../../config/firebase.js'; // Ajusta la ruta según tu estructura
import { doc, updateDoc } from 'firebase/firestore';

export const updateOrderStatus = async (collectionName, orderId, newStatus) => {
  try {
    const orderRef = doc(db, collectionName, orderId);
    await updateDoc(orderRef, {
      status: newStatus,
      updatedAt: new Date(),
    });
    return true; // Éxito
  } catch (error) {
    console.error('Error al actualizar estado en orderUtils:', error);
    return false; // Fallo
  }
};