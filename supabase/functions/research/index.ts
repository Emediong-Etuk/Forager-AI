import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

interface SerperResponse {
  organic: SearchResult[];
}

interface GroqStreamResponse {
  choices: {
    delta: { content?: string };
    finish_reason?: string;
  }[];
}

interface ResearchRequest {
  projectName: string;
}

const FORAGER_SYSTEM_PROMPT = `You are Forager, an expert Web3 research analyst. A user wants to research a crypto project. Using the live web data provided, generate a comprehensive but concise research report structured exactly as follows:

## Project Overview
Brief description of what the project does, its chain, and its category (DeFi, NFT, L1, etc.)

## Tokenomics
Token name, supply, distribution, vesting schedules, inflation/deflation mechanics.

## Team & Backers
Known team members, investors, and notable backers. Flag anonymity if applicable.

## Strengths
3 to 5 genuine strengths backed by data or evidence.

## Red Flags
3 to 5 honest risks, concerns, or red flags investors should know.

## Bear Case (Devil's Advocate)
Argue why this project could fail or underperform. Be direct and specific.

## Verdict
A one-paragraph balanced summary. End with a score from 1 to 10 for research confidence based on how much verifiable information exists.

Always be honest. Never shill. Flag missing information clearly.`;

async function searchProject(projectName: string): Promise<SearchResult[]> {
  const serperApiKey = Deno.env.get('SERPER_API_KEY');
  if (!serperApiKey) {
    throw new Error('SERPER_API_KEY not configured');
  }

  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': serperApiKey,
    },
    body: JSON.stringify({
      q: `${projectName} crypto project tokenomics team audit news`,
      num: 5,
    }),
  });

  if (!response.ok) {
    throw new Error(`Search failed: ${response.statusText}`);
  }

  const data: SerperResponse = await response.json();
  return (data.organic || []).map((r) => ({
    title: r.title,
    link: r.link,
    snippet: r.snippet,
  }));
}

async function generateReportStream(
  projectName: string,
  searchResults: SearchResult[],
  onChunk: (chunk: string) => void
): Promise<void> {
  const groqApiKey = Deno.env.get('GROQ_API_KEY');
  if (!groqApiKey) {
    throw new Error('GROQ_API_KEY not configured');
  }

  const searchContext = searchResults.map((r, i) =>
    `[${i + 1}] ${r.title}\n${r.snippet}\nSource: ${r.link}`
  ).join('\n\n---\n\n');

  const userPrompt = `Research the crypto project: "${projectName}"

Here is the live web data collected:

${searchContext}

Generate a comprehensive research report for this project.`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${groqApiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 4096,
      messages: [
        { role: 'system', content: FORAGER_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI generation failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
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
          const parsed: GroqStreamResponse = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            onChunk(content);
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body: ResearchRequest = await req.json();
    const { projectName } = body;

    if (!projectName || typeof projectName !== 'string') {
      return new Response(
        JSON.stringify({ error: "Project name is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Search for project information
    let searchResults: SearchResult[];
    try {
      searchResults = await searchProject(projectName.trim());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed';
      return new Response(
        JSON.stringify({ error: `Search failed: ${message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!searchResults || searchResults.length === 0) {
      return new Response(
        JSON.stringify({ error: "Could not find enough data on this project. Try a more specific name." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Stream AI-generated report
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          await generateReportStream(projectName.trim(), searchResults, (chunk) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
          });
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `Research generation failed: ${message}` })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: `Research generation failed: ${message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
