import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminAuth } from './firebaseAdmin';

export async function requireUser(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return { user: null, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  try {
    const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
    return { user: { id: decoded.uid }, response: null };
  } catch {
    return { user: null, response: NextResponse.json({ error: 'Session expired. Please sign in again.' }, { status: 401 }) };
  }
}
