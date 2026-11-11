import type { User } from '@firebase/auth';

export async function getPostAuthPath(user: User) {
  const token = await user.getIdToken();
  const response = await fetch('/api/profile', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Could not load your health profile.');
  return body.profile?.isComplete ? '/dashboard' : '/onboarding';
}
