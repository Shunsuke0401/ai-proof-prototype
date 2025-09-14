/**
 * Multi-provider abstraction for summarization.
 * Supports: mock (existing deterministic placeholder), ollama, openai, anthropic, together
 * Only providers with corresponding API keys/env will be active. Fallback order is defined
 * by caller; this module just exposes individual provider functions and a dispatcher.
 */

import { AIModelResponse } from './types';

export type ProviderName = 'mock' | 'ollama' | 'openai' | 'anthropic' | 'together';

interface SummarizeOptions {
  provider: ProviderName;
  text: string;
  model?: string;
}

// Utility: hash helper (SHA-256 hex)
async function sha256Hex(data: string): Promise<string> {
  const enc = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// MOCK provider (current behavior)
async function summarizeMock(text: string): Promise<AIModelResponse> {
  // simple word frequency summary similar to existing mock
  const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const counts: Record<string, number> = {};
  for (const w of words) counts[w] = (counts[w] || 0) + 1;
  const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5).map(x=>x[0]);
  const summary = `Key topics: ${top.join(', ')}`;
  const model = 'mock-local';
  const modelHash = await sha256Hex(model);
  return { summary, model, modelHash, params: {} };
}

// OLLAMA provider
async function summarizeOllama(text: string, model = 'llama3'): Promise<AIModelResponse> {
  const base = process.env.OLLAMA_API_URL || 'http://localhost:11434';
  const prompt = `Please provide a concise summary of the following text:\n\n${text}\n\nSummary:`;
  const body = {
    model,
    prompt,
    stream: false,
    options: { temperature: 0.3 }
  };
  const res = await fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}`);
  const json = await res.json();
  const summary: string = (json.response || '').trim();
  const params = body.options;
  const modelHash = await sha256Hex(JSON.stringify({ model, params }));
  return { summary, model, modelHash, params };
}

// OPENAI provider
async function summarizeOpenAI(text: string, model = 'gpt-4o-mini'): Promise<AIModelResponse> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing');
  const payload = {
    model,
    messages: [
      { role: 'system', content: 'You are a concise summarization assistant.' },
      { role: 'user', content: `Summarize succinctly:\n\n${text}` }
    ],
    temperature: 0.3
  };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
  const json = await res.json();
  const summary = (json.choices?.[0]?.message?.content || '').trim();
  const params = { temperature: payload.temperature };
  const modelHash = await sha256Hex(JSON.stringify({ model, params }));
  return { summary, model, modelHash, params };
}

// ANTHROPIC provider
async function summarizeAnthropic(text: string, model = 'claude-3-haiku-20240307'): Promise<AIModelResponse> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY missing');
  const payload = {
    model,
    max_tokens: 400,
    temperature: 0.3,
    messages: [
      { role: 'user', content: `Summarize succinctly:\n\n${text}` }
    ]
  };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Anthropic error ${res.status}`);
  const json = await res.json();
  const summary = (json.content?.[0]?.text || '').trim();
  const params = { temperature: payload.temperature };
  const modelHash = await sha256Hex(JSON.stringify({ model, params }));
  return { summary, model, modelHash, params };
}

// TOGETHER provider
async function summarizeTogether(text: string, model = 'meta-llama/Meta-Llama-3-8B-Instruct-Turbo'): Promise<AIModelResponse> {
  const key = process.env.TOGETHER_API_KEY;
  if (!key) throw new Error('TOGETHER_API_KEY missing');
  const prompt = `Summarize succinctly:\n\n${text}\n\nSummary:`;
  const payload = {
    model,
    input: prompt,
    temperature: 0.3,
    top_p: 0.9,
    max_tokens: 400
  };
  const res = await fetch('https://api.together.xyz/v1/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Together error ${res.status}`);
  const json = await res.json();
  const summary = (json.output?.choices?.[0]?.text || '').trim();
  const params = { temperature: payload.temperature };
  const modelHash = await sha256Hex(JSON.stringify({ model, params }));
  return { summary, model, modelHash, params };
}

export async function summarizeWithProvider(opts: SummarizeOptions): Promise<AIModelResponse> {
  switch (opts.provider) {
    case 'mock':
      return summarizeMock(opts.text);
    case 'ollama':
      return summarizeOllama(opts.text, opts.model);
    case 'openai':
      return summarizeOpenAI(opts.text, opts.model);
    case 'anthropic':
      return summarizeAnthropic(opts.text, opts.model);
    case 'together':
      return summarizeTogether(opts.text, opts.model);
    default:
      throw new Error(`Unsupported provider ${opts.provider}`);
  }
}

export const providerDisplayNames: Record<ProviderName,string> = {
  mock: 'Mock',
  ollama: 'Ollama',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  together: 'Together'
};

export function listActiveProviders(): ProviderName[] {
  const active: ProviderName[] = ['mock'];
  if (process.env.OLLAMA_API_URL) active.push('ollama');
  if (process.env.OPENAI_API_KEY) active.push('openai');
  if (process.env.ANTHROPIC_API_KEY) active.push('anthropic');
  if (process.env.TOGETHER_API_KEY) active.push('together');
  return active;
}
