import { NextRequest, NextResponse } from 'next/server';

export async function requireUser(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return { user: null, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };

  let auth;
  try {
    const { getFirebaseAdminAuth } = await import('./firebaseAdmin');
    auth = getFirebaseAdminAuth();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('Firebase Admin initialization failed:', message);
    return {
      user: null,
      response: NextResponse.json(
        { error: 'Firebase server authentication is unavailable.' },
        { status: 500 },
      ),
    };
  }

  try {
    const decoded = await auth.verifyIdToken(token);
    return { user: { id: decoded.uid }, response: null };
  } catch {
    return { user: null, response: NextResponse.json({ error: 'Session expired. Please sign in again.' }, { status: 401 }) };
  }
}
