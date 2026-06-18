import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Leaf, Archive } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-dark text-light">
      <nav className="border-b border-dark-200 bg-dark/95 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2 group">
              <Leaf className="w-8 h-8 text-accent group-hover:scale-110 transition-transform" />
              <span className="text-xl font-display font-bold text-light">
                Forager
              </span>
            </Link>

            <div className="flex items-center gap-6">
              <Link
                to="/vault"
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  location.pathname === '/vault'
                    ? 'bg-accent/20 text-accent'
                    : 'text-light-muted hover:text-light hover:bg-dark-200'
                }`}
              >
                <Archive className="w-5 h-5" />
                <span className="font-medium">Vault</span>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
