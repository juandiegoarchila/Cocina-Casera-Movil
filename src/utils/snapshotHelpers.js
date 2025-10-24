// src/utils/snapshotHelpers.js
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';

/** Normaliza varias entradas de fecha a ISO local (YYYY-MM-DD) */
export function toISODateLocal(input) {
  if (!input) return null;
  let d;
  if (input?.toDate) d = input.toDate();            // Firestore Timestamp
  else if (typeof input === 'string') d = new Date(input);
  else d = new Date(input);

  if (isNaN(d)) return null;
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

/**
 * Lee un snapshot diario por fecha. Intenta por docId=fecha y,
 * si no existe, busca por where('date' == fecha) para compatibilidad.
 */
export async function getDailySnapshot(db, collectionName, dateISO) {
  const iso = toISODateLocal(dateISO);
  if (!iso) return null;

  // 1) intento directo por docId = fecha
  const byIdRef = doc(db, collectionName, iso);
  const byIdSnap = await getDoc(byIdRef);
  if (byIdSnap.exists()) return { id: byIdSnap.id, ...byIdSnap.data() };

  // 2) compat: documentos antiguos con ID aleatorio
  const qRef = query(collection(db, collectionName), where('date', '==', iso));
  const snap = await getDocs(qRef);
  if (!snap.empty) {
    const d = snap.docs[0];
    return { id: d.id, ...d.data() };
  }
  return null;
}

/**
 * Upsert por fecha. Si existe (por docId o por where('date')), se actualiza.
 * Si no existe, se crea con docId = fecha (estandarizando hacia futuro).
 */
export async function upsertByDate(db, collectionName, dateISO, data) {
  const iso = toISODateLocal(dateISO);
  if (!iso) throw new Error('upsertByDate: fecha inválida');

  // ¿existe con docId = fecha?
  const byIdRef = doc(db, collectionName, iso);
  const byIdSnap = await getDoc(byIdRef);
  const payload = {
    ...data,
    date: iso,
    updatedAt: serverTimestamp(),
  };

  if (byIdSnap.exists()) {
    await updateDoc(byIdRef, payload);
    return { id: iso, created: false };
  }

  // ¿existe con where('date'==fecha)? (compat)
  const qRef = query(collection(db, collectionName), where('date', '==', iso));
  const snap = await getDocs(qRef);
  if (!snap.empty) {
    const d = snap.docs[0];
    await updateDoc(doc(db, collectionName, d.id), payload);
    return { id: d.id, created: false };
  }

  // Crear con ID = fecha (nuevo estándar)
  await setDoc(byIdRef, {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return { id: iso, created: true };
}

/**
 * Asegura que exista el documento de un día con valores iniciales.
 * Si existe NO lo toca (no sobreescribe); si no, lo crea con ID = fecha.
 */
export async function ensureDailyDoc(db, collectionName, dateISO, initData) {
  const iso = toISODateLocal(dateISO);
  if (!iso) throw new Error('ensureDailyDoc: fecha inválida');

  const ref = doc(db, collectionName, iso);
  const snap = await getDoc(ref);
  if (snap.exists()) return { id: iso, created: false };

  await setDoc(ref, {
    ...(initData || {}),
    date: iso,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: iso, created: true };
}

/** Obtiene snapshots por rango [startISO, endISO] ordenados por date */
export async function getRangeSnapshots(db, collectionName, startISO, endISO) {
  const start = toISODateLocal(startISO);
  const end = toISODateLocal(endISO);
  const qRef = query(
    collection(db, collectionName),
    where('date', '>=', start),
    where('date', '<=', end),
    orderBy('date', 'asc')
  );
  const snap = await getDocs(qRef);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
