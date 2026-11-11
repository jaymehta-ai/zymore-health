import type { User } from '@firebase/auth';

export async function getPostAuthPath(user: User) {
  const token = await user.getIdToken();
  const response = await fetch('/api/profile', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const responseText = await response.text();
  let body: { error?: string; profile?: { isComplete?: boolean } } = {};
  try {
    body = responseText ? JSON.parse(responseText) as typeof body : {};
  } catch {
    throw new Error(`The profile service returned an invalid response (HTTP ${response.status}). Please try again later.`);
  }
  if (!response.ok) throw new Error(body.error || `Could not load your health profile (HTTP ${response.status}).`);
  return body.profile?.isComplete ? '/dashboard' : '/onboarding';
}
