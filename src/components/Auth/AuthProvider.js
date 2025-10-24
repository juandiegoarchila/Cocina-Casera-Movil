//src/components/Auth/AuthProvider.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../../config/firebase';
import { onAuthStateChanged, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  const login = async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;
      const userRef = doc(db, 'users', firebaseUser.uid);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        // Crear el documento básico del usuario si no existe (rol cliente por defecto)
        await setDoc(userRef, {
          email: firebaseUser.email || '',
          role: 1,
          totalOrders: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });

        setUser(firebaseUser);
        setRole(1);
        return firebaseUser;
      }

      setUser(firebaseUser);
      setRole(userDoc.data().role ?? 1);
      return firebaseUser;
    } catch (error) {
      throw new Error(error.message);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          setUser(firebaseUser);
          setRole(userDoc.data().role || 1); // Default to client role
        } else {
          // Crear documento si no existe (seguro con reglas: lee/escribe su propio doc)
          await setDoc(userRef, {
            email: firebaseUser.email || '',
            role: 1,
            totalOrders: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }, { merge: true });
          setUser(firebaseUser);
          setRole(1); // Anonymous or new users are clients
        }
      } else {
        setUser(null);
        setRole(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, loading, login }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);