import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { Leaf, Save, ArrowLeft, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function ReportPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const projectName = searchParams.get('project') || '';
  const [report, setReport] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!projectName) {
      navigate('/');
      return;
    }

    let isMounted = true;
    const abortController = new AbortController();

    const fetchReport = async () => {
      try {
        setIsLoading(true);
        setError(null);
        setReport('');

        // Use fetch for streaming
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/research`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ projectName }),
            signal: abortController.signal,
          }
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Research generation failed. Please try again.');
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response stream');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                if (parsed.text && isMounted) {
                  setReport((prev) => prev + parsed.text);
                }
                if (parsed.error) {
                  throw new Error(parsed.error);
                }
              } catch (parseError) {
                if (parseError instanceof SyntaxError) continue;
                throw parseError;
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error('Report fetch error:', err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Research generation failed. Please try again.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchReport();

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [projectName, navigate]);

  // Auto-scroll as content streams in
  useEffect(() => {
    if (reportRef.current && report) {
      const timer = setTimeout(() => {
        reportRef.current?.scrollTo({ top: reportRef.current.scrollHeight, behavior: 'smooth' });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [report]);

  const handleSave = async () => {
    if (!report) return;

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const timestamp = new Date().toISOString();
      const reportKey = `forager:${projectName.toLowerCase().replace(/\s+/g, '-')}:${timestamp}`;

      const { error: insertError } = await supabase
        .from('reports')
        .insert({
          project_name: projectName,
          report_content: report,
          report_key: reportKey,
          created_at: timestamp,
        });

      if (insertError) {
        throw insertError;
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Save error:', err);
      alert('Save failed. Your report is still visible but was not stored on-chain.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!projectName) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-light-muted hover:text-light transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Search</span>
        </button>

        {report && !isLoading && !error && (
          <button
            onClick={handleSave}
            disabled={isSaving || saveSuccess}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
              saveSuccess
                ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                : 'bg-accent text-dark hover:bg-accent-hover'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {saveSuccess ? (
              <>
                <Leaf className="w-5 h-5" />
                <span>Saved!</span>
              </>
            ) : isSaving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                <span>Save to Vault</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Project Title */}
      <div className="text-center py-4">
        <h1 className="text-3xl sm:text-4xl font-display font-bold text-light">
          {projectName}
        </h1>
        <p className="text-light-muted mt-2">Research Report</p>
      </div>

      {/* Loading State */}
      {isLoading && report === '' && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <Leaf className="w-16 h-16 text-accent animate-pulse" />
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
          <p className="text-light-muted text-lg">Forager is hunting alpha...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="p-4 rounded-full bg-red-500/20">
            <AlertCircle className="w-12 h-12 text-red-500" />
          </div>
          <p className="text-red-400 text-lg text-center max-w-md">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 px-6 py-3 bg-dark-200 rounded-lg hover:bg-dark-300 transition-colors"
          >
            Try Another Project
          </button>
        </div>
      )}

      {/* Report Content */}
      {(report || isLoading) && (
        <div
          ref={reportRef}
          className="bg-dark-100 border border-dark-300 rounded-2xl p-6 sm:p-10 prose prose-invert max-w-none"
        >
          <ReactMarkdown
            components={{
              h1: ({ children }) => (
                <h1 className="text-2xl sm:text-3xl font-display font-bold text-light border-b border-dark-300 pb-3">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-xl sm:text-2xl font-display font-semibold text-light mt-8 first:mt-0">
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
            {report}
          </ReactMarkdown>
          {isLoading && (
            <div className="inline-block w-2 h-5 bg-accent animate-pulse ml-1" />
          )}
        </div>
      )}
    </div>
  );
}
