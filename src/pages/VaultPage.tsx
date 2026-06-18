import { useState, useEffect } from 'react';
import { Leaf, Calendar, Eye, Archive, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ReactMarkdown from 'react-markdown';
import type { Report } from '../lib/types';

export function VaultPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        setIsLoading(true);
        const { data, error: fetchError } = await supabase
          .from('reports')
          .select('*')
          .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;
        setReports(data || []);
      } catch (err) {
        console.error('Failed to fetch reports:', err);
        setError('Failed to load your vault. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchReports();
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <Archive className="w-10 h-10 text-accent" />
          <h1 className="text-3xl sm:text-4xl font-display font-bold text-light">
            Your Vault
          </h1>
        </div>
        <p className="text-light-muted">
          All your research reports, stored permanently
        </p>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <Loader2 className="w-10 h-10 text-accent animate-spin" />
          <p className="text-light-muted">Loading your vault...</p>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="text-center py-20 space-y-4">
          <p className="text-red-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-dark-200 rounded-lg hover:bg-dark-300 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && reports.length === 0 && (
        <div className="text-center py-20 space-y-6">
          <div className="w-24 h-24 mx-auto rounded-full bg-dark-200 flex items-center justify-center">
            <Leaf className="w-12 h-12 text-light-muted" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-light">Your vault is empty</h3>
            <p className="text-light-muted">
              Research your first project to start building your vault.
            </p>
          </div>
          <button
            onClick={() => window.location.href = '/'}
            className="px-6 py-3 bg-accent text-dark font-semibold rounded-lg hover:bg-accent-hover transition-colors"
          >
            Start Researching
          </button>
        </div>
      )}

      {/* Reports Grid */}
      {!isLoading && !error && reports.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reports.map((report) => (
            <div
              key={report.id}
              className="bg-dark-100 border border-dark-300 rounded-xl p-6 hover:border-accent/50 transition-colors space-y-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-lg font-display font-semibold text-light capitalize">
                    {report.project_name}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-light-muted">
                    <Calendar className="w-4 h-4" />
                    <span>{formatDate(report.created_at)}</span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedReport(report)}
                  className="flex items-center gap-2 px-4 py-2 bg-accent/10 text-accent rounded-lg hover:bg-accent/20 transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  <span>View</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Report Modal */}
      {selectedReport && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedReport(null)}
        >
          <div
            className="bg-dark-100 border border-dark-300 rounded-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-dark-300">
              <div>
                <h2 className="text-xl font-display font-bold text-light capitalize">
                  {selectedReport.project_name}
                </h2>
                <p className="text-sm text-light-muted mt-1">
                  {formatDate(selectedReport.created_at)}
                </p>
              </div>
              <button
                onClick={() => setSelectedReport(null)}
                className="text-light-muted hover:text-light transition-colors text-2xl"
              >
                &times;
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="prose prose-invert max-w-none">
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => (
                      <h1 className="text-2xl font-display font-bold text-light border-b border-dark-300 pb-3">
                        {children}
                      </h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-xl font-display font-semibold text-light mt-8 first:mt-0">
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-lg font-semibold text-light-100">{children}</h3>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc list-inside space-y-2 text-light-muted">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal list-inside space-y-2 text-light-muted">{children}</ol>
                    ),
                    p: ({ children }) => <p className="leading-relaxed">{children}</p>,
                    strong: ({ children }) => (
                      <strong className="font-semibold text-light">{children}</strong>
                    ),
                  }}
                >
                  {selectedReport.report_content}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}
