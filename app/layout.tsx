import type {Metadata} from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css'; // Global styles
import { AuthProvider } from '@/lib/AuthContext';
import { ThemeProvider } from '@/lib/ThemeContext';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Language Flashcards',
  description: 'Spaced repetition flashcard studio that automatically generates smart decks and review schedules from vocabulary tables.',
  openGraph: {
    title: 'Language Flashcards',
    description: 'Spaced repetition flashcard studio that automatically generates smart decks and review schedules from vocabulary tables.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Language Flashcards',
    description: 'Spaced repetition flashcard studio that automatically generates smart decks and review schedules from vocabulary tables.',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Flashcards',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${plusJakartaSans.variable} ${jetBrainsMono.variable}`}>
      <head>
        {/* Inline script to prevent flash of unstyled theme on initial load */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('language_flashcards_theme');
                  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  if (stored === 'dark' || (!stored && prefersDark)) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
