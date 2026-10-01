import Link from 'next/link';
import { BookOpen, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#f2f2f7] text-[#1c1c1e] flex flex-col items-center justify-center p-6 text-center antialiased">
      <div className="w-16 h-16 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center mb-6 shadow-sm">
        <BookOpen className="w-8 h-8" />
      </div>
      <h1 className="text-3xl font-bold tracking-tight mb-2">Page Not Found</h1>
      <p className="text-neutral-500 max-w-sm mb-6 text-sm">
        The flashcard deck or page you are looking for does not exist or has been moved.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-blue-600 text-white font-medium text-sm shadow-sm hover:bg-blue-700 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Return to Study
      </Link>
    </div>
  );
}
