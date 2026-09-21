import type {Metadata} from 'next';
import './globals.css'; // Global styles
import { AuthProvider } from '@/lib/AuthContext';

export const metadata: Metadata = {
  title: 'Language Flashcards',
  description: 'Apple-designed spaced repetition flashcard app that automatically generates smart decks and schedules from vocabulary tables.',
  openGraph: {
    title: 'Language Flashcards',
    description: 'Apple-designed spaced repetition flashcard app that automatically generates smart decks and schedules from vocabulary tables.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Language Flashcards',
    description: 'Apple-designed spaced repetition flashcard app that automatically generates smart decks and schedules from vocabulary tables.',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Flashcards',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
