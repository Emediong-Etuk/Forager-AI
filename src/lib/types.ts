export interface Report {
  id: string;
  project_name: string;
  report_content: string;
  search_context: string | null;
  created_at: string;
  report_key: string;
}

export interface ResearchRequest {
  projectName: string;
}

export interface StreamMessage {
  text?: string;
  error?: string;
}
