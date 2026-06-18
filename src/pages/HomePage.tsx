import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Leaf, Search } from 'lucide-react';

export function HomePage() {
  const [projectName, setProjectName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;

    setIsLoading(true);
    navigate(`/report?project=${encodeURIComponent(projectName.trim())}`);
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center justify-center">
      <div className="w-full max-w-2xl mx-auto space-y-12">
        {/* Logo & Brand */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Leaf className="w-16 h-16 text-accent animate-pulse" />
          </div>
          <h1 className="text-5xl sm:text-6xl font-display font-bold text-light tracking-tight">
            Forager
          </h1>
          <p className="text-lg text-light-muted">
            AI-powered research. Stored on-chain forever.
          </p>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Enter any crypto project name..."
              disabled={isLoading}
              className="w-full px-6 py-5 bg-dark-100 border-2 border-dark-300 rounded-2xl text-light text-lg placeholder:text-light-muted/50 focus:border-accent focus:outline-none transition-all duration-300 disabled:opacity-50"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <button
                type="submit"
                disabled={isLoading || !projectName.trim()}
                className="flex items-center gap-2 px-6 py-3 bg-accent text-dark font-semibold rounded-xl hover:bg-accent-hover transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-dark border-t-transparent rounded-full animate-spin" />
                    <span>Hunting...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    <span>Search</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Features hint */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center text-sm text-light-muted pt-8">
          <div className="p-4 rounded-xl bg-dark-100/50">
            <div className="font-semibold text-accent mb-1">Real-time Data</div>
            <div>Fresh web search results</div>
          </div>
          <div className="p-4 rounded-xl bg-dark-100/50">
            <div className="font-semibold text-accent mb-1">Deep Analysis</div>
            <div>AI-powered research reports</div>
          </div>
          <div className="p-4 rounded-xl bg-dark-100/50">
            <div className="font-semibold text-accent mb-1">Permanent Storage</div>
            <div>All reports saved forever</div>
          </div>
        </div>
      </div>
    </div>
  );
}
