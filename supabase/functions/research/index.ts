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

interface GroqChatResponse {
  choices: { message: { content: string }; finish_reason: string }[];
}

interface GroqStreamResponse {
  choices: { delta: { content?: string }; finish_reason?: string }[];
}

interface ResearchRequest {
  projectName: string;
}

// Three response states surfaced by the classifier
type ProjectState =
  | "confirmed_crypto"   // (a) Multiple signals confirm this is a crypto/Web3 project
  | "uncertain"          // (b) Some crypto signals but insufficient to be sure, or pre-launch/obscure
  | "not_crypto";        // (c) No crypto signals at all; clearly a person/country/brand

interface Classification {
  state: ProjectState;
  reason: string;
}

// ── Prompts ──────────────────────────────────────────────────────────────────

const REPORT_SYSTEM_PROMPT = `You are Forager, an expert Web3 research analyst. Generate a comprehensive but concise research report structured exactly as follows:

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

Always be honest. Never shill. Flag missing information clearly. If data is thin, say so explicitly rather than filling gaps with speculation.`;

const LIMITED_DATA_HEADER = (projectName: string) =>
  `> **Data Notice:** Limited public information was found for **${projectName}**. This project may be pre-launch, early-stage, or have minimal indexed coverage. The report below is based on available sources and clearly flags where information is missing or unverified.\n\n`;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function groqChat(
  messages: { role: string; content: string }[],
  maxTokens = 300
): Promise<string> {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) throw new Error("GROQ_API_KEY not configured");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: maxTokens,
      messages,
      stream: false,
    }),
  });

  if (!res.ok) throw new Error(`Groq chat failed: ${res.status} ${await res.text()}`);
  const data: GroqChatResponse = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

async function search(query: string, num = 5): Promise<SearchResult[]> {
  const key = Deno.env.get("SERPER_API_KEY");
  if (!key) throw new Error("SERPER_API_KEY not configured");

  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": key },
    body: JSON.stringify({ q: query, num }),
  });

  if (!res.ok) throw new Error(`Search failed: ${res.statusText}`);
  const data: SerperResponse = await res.json();
  return (data.organic ?? []).map((r) => ({ title: r.title, link: r.link, snippet: r.snippet }));
}

function dedup(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.link)) return false;
    seen.add(r.link);
    return true;
  });
}

function formatResults(results: SearchResult[]): string {
  return results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\nSource: ${r.link}`)
    .join("\n\n---\n\n");
}

// ── Core logic ────────────────────────────────────────────────────────────────

/**
 * Run two searches in parallel: a general query and a crypto-specific one.
 * Combine and deduplicate results so the classifier sees the full picture.
 */
async function fetchAllSearchResults(projectName: string): Promise<SearchResult[]> {
  const [general, cryptoSpecific] = await Promise.allSettled([
    search(projectName, 4),
    search(`${projectName} crypto token blockchain presale Web3`, 4),
  ]);

  const combined: SearchResult[] = [];
  if (general.status === "fulfilled") combined.push(...general.value);
  if (cryptoSpecific.status === "fulfilled") combined.push(...cryptoSpecific.value);
  return dedup(combined);
}

/**
 * Classify the project name given actual live search results.
 *
 * Three-state model:
 *  confirmed_crypto  – strong evidence this is a crypto/Web3 project
 *  uncertain         – ambiguous, pre-launch, or very low data
 *  not_crypto        – clearly a person, country, or non-crypto brand with zero crypto signal
 */
async function classifyFromResults(
  projectName: string,
  results: SearchResult[]
): Promise<Classification> {
  const snippetBlock = results.length > 0 ? formatResults(results) : "(no results found)";

  const prompt = `You are classifying whether a search query refers to a cryptocurrency or Web3 project.

Query: "${projectName}"

Live search results:
${snippetBlock}

Classify the query into exactly one of these states:

- "confirmed_crypto": The search results clearly show this is a cryptocurrency, token, DeFi protocol, NFT collection, blockchain, or Web3 application. Multiple sources reference it in a crypto context.
- "uncertain": The search results contain SOME crypto signals (e.g. a token mention, a presale page, a CoinGecko listing) but information is thin, contradictory, or this could be a very new/obscure project. Also use this when results are empty or irrelevant.
- "not_crypto": The search results show NO crypto signals at all. The name is clearly and primarily a real person (athlete, celebrity, politician), a country, a city, a mainstream brand, or other non-crypto entity — and there is zero Web3 context in any result.

IMPORTANT RULES:
1. Default to "uncertain" whenever you are unsure. Never use "not_crypto" unless the evidence is overwhelming.
2. If even ONE result references the name in a crypto/Web3 context, do not use "not_crypto".
3. Pre-launch projects, presale tokens, and obscure altcoins with minimal data should be "uncertain", not "not_crypto".
4. Only use "not_crypto" when ALL results clearly describe a person, place, or brand with ZERO crypto connection.

Reply ONLY with valid JSON: {"state": "confirmed_crypto"|"uncertain"|"not_crypto", "reason": "one sentence"}`;

  const raw = await groqChat([{ role: "user", content: prompt }], 200);

  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("no JSON");
    const parsed = JSON.parse(match[0]);
    const state = parsed.state as ProjectState;
    if (!["confirmed_crypto", "uncertain", "not_crypto"].includes(state)) {
      return { state: "uncertain", reason: "classifier returned unexpected state" };
    }
    return { state, reason: String(parsed.reason ?? "") };
  } catch {
    // Parsing failure → default to uncertain so we don't block real projects
    return { state: "uncertain", reason: raw };
  }
}

async function streamReport(
  projectName: string,
  searchResults: SearchResult[],
  classification: Classification,
  onChunk: (chunk: string) => void
): Promise<void> {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) throw new Error("GROQ_API_KEY not configured");

  const dataQualityNote =
    classification.state === "uncertain"
      ? "\n\nIMPORTANT: Data on this project is limited or unverified. Clearly flag every section where information is missing, uncertain, or unconfirmed. Do NOT invent or speculate — explicitly state 'Not publicly available' or 'Unconfirmed' where data is absent."
      : "";

  const userPrompt = `Research the crypto project: "${projectName}"

Live web data:
${searchResults.length > 0 ? formatResults(searchResults) : "(no search results available)"}
${dataQualityNote}

Generate a comprehensive research report.`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 4096,
      messages: [
        { role: "system", content: REPORT_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      stream: true,
    }),
  });

  if (!res.ok) {
    throw new Error(`Report generation failed: ${res.status} ${await res.text()}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") continue;
      try {
        const parsed: GroqStreamResponse = JSON.parse(data);
        const text = parsed.choices?.[0]?.delta?.content;
        if (text) onChunk(text);
      } catch {
        // skip malformed SSE frames
      }
    }
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body: ResearchRequest = await req.json();
    const projectName = body?.projectName?.trim();

    if (!projectName) {
      return new Response(JSON.stringify({ error: "Project name is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 1: Search first, always ──────────────────────────────────────────
    let searchResults: SearchResult[] = [];
    try {
      searchResults = await fetchAllSearchResults(projectName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Search failed";
      return new Response(JSON.stringify({ error: `Search failed: ${msg}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 2: Classify based on actual search results ───────────────────────
    let classification: Classification;
    try {
      classification = await classifyFromResults(projectName, searchResults);
    } catch {
      // Classification failure → default to uncertain, never block
      classification = { state: "uncertain", reason: "classification unavailable" };
    }

    // ── Step 3: Hard-reject only clear non-crypto with high confidence ─────────
    if (classification.state === "not_crypto") {
      return new Response(
        JSON.stringify({
          error: `"${projectName}" does not appear to be a cryptocurrency or blockchain project based on current sources. Forager researches crypto projects, tokens, DeFi protocols, and Web3 applications only.`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Step 4: Stream report (confirmed or uncertain) ────────────────────────
    const encoder = new TextEncoder();
    const isUncertain = classification.state === "uncertain";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Prepend a data-notice banner for uncertain/low-data projects
          if (isUncertain) {
            const header = LIMITED_DATA_HEADER(projectName);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: header })}\n\n`));
          }

          await streamReport(projectName, searchResults, classification, (chunk) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
          });

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: `Report generation failed: ${msg}` })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: `Request failed: ${msg}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
