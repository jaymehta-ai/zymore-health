import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function getEnvironmentValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function getFirebaseAdminApp() {
  if (getApps().length) return getApps()[0];
  const projectId = getEnvironmentValue('FIREBASE_PROJECT_ID');
  const clientEmail = getEnvironmentValue('FIREBASE_CLIENT_EMAIL');
  const privateKey = getEnvironmentValue('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase Admin credentials are missing: set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.');
  }
  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----') || !privateKey.includes('-----END PRIVATE KEY-----')) {
    throw new Error('FIREBASE_PRIVATE_KEY is not a complete PEM private key.');
  }
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

export function getFirebaseAdminAuth() { return getAuth(getFirebaseAdminApp()); }
export function getFirebaseAdminDb() { return getFirestore(getFirebaseAdminApp()); }
