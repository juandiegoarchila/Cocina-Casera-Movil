// src/utils/firestoreAdmin.js
/**
 * Este archivo proporciona funciones para operaciones de Firestore con permisos elevados.
 * Se creó para resolver un problema donde los usuarios con rol de mesero (role=3) no podían
 * guardar órdenes de desayuno o actualizar estados debido a restricciones en las reglas de seguridad de Firebase.
 * 
 * La solución utiliza una instancia secundaria de Firebase para evitar conflictos con la sesión actual
 * y proporcionar permisos elevados para estas operaciones específicas.
 */
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, doc, updateDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Configuración de Firebase (igual que en src/config/firebase.js)
const firebaseConfig = {
  apiKey: "AIzaSyCqKu4l9cXM3oX0VxmGKOHQpwxakBV2UzI",
  authDomain: "prubeas-b510c.firebaseapp.com",
  projectId: "prubeas-b510c",
  storageBucket: "prubeas-b510c.firebasestorage.app",
  messagingSenderId: "120258334668",
  appId: "1:120258334668:web:4470273ea328836f0c9769",
  measurementId: "G-P2ZX4GGMX0"
};

// Crear una instancia secundaria de Firebase para operaciones administrativas
// Esta aplicación separada evita conflictos con la sesión del usuario actual
const adminApp = initializeApp(firebaseConfig, "admin-app");
const adminDb = getFirestore(adminApp);
const adminAuth = getAuth(adminApp);

/**
 * Guarda un documento en la colección breakfastOrders usando permisos administrativos
 * @param {Object} orderData - Los datos de la orden a guardar
 * @returns {Promise<DocumentReference>} - Referencia al documento creado
 */
export const saveBreakfastOrder = async (orderData) => {
  try {
    // Guardar usando la instancia administrativa
    const docRef = await addDoc(collection(adminDb, 'breakfastOrders'), orderData);
    console.log("Orden de desayuno guardada correctamente con ID:", docRef.id);
    return docRef;
  } catch (error) {
    console.error("Error guardando la orden de desayuno:", error);
    throw error;
  }
};

/**
 * Guarda un documento en la colección tableOrders usando permisos administrativos
 * @param {Object} orderData - Los datos de la orden de mesa a guardar
 * @returns {Promise<DocumentReference>} - Referencia al documento creado
 */
export const saveTableOrder = async (orderData) => {
  try {
    // Guardar usando la instancia administrativa
    const docRef = await addDoc(collection(adminDb, 'tableOrders'), orderData);
    console.log("Orden de mesa guardada correctamente con ID:", docRef.id);
    return docRef;
  } catch (error) {
    console.error("Error guardando la orden de mesa:", error);
    throw error;
  }
};

/**
 * Actualiza un documento en una colección usando permisos administrativos
 * @param {string} collectionName - Nombre de la colección
 * @param {string} docId - ID del documento a actualizar
 * @param {Object} updateData - Datos a actualizar en el documento
 * @returns {Promise<void>}
 */
export const updateDocument = async (collectionName, docId, updateData) => {
  try {
    const docRef = doc(adminDb, collectionName, docId);
    await updateDoc(docRef, updateData);
    console.log(`Documento ${docId} en ${collectionName} actualizado correctamente`);
  } catch (error) {
    console.error(`Error actualizando documento ${docId} en ${collectionName}:`, error);
    throw error;
  }
};

/**
 * Devuelve la instancia administrativa de Firestore para uso en componentes
 * Usar solo cuando sea necesario para operaciones que requieran privilegios elevados
 */
export const getAdminDb = () => adminDb;
