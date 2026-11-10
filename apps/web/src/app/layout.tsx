import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Zymore Health | Your health, in one place',
  description: 'A simple, secure place to understand your health records.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
