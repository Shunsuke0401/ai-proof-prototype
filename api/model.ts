/**
 * Model utilities for Ollama integration and hash calculation
 */

import { OllamaRequest, OllamaResponse, AIModelResponse } from './types';

/**
 * Get Ollama API URL
 */
function getOllamaUrl(): string {
  return process.env.OLLAMA_API_URL || 'http://localhost:11434';
}

/**
 * Call Ollama API to generate summary
 */
export async function generateSummary(
  text: string,
  model: string = 'llama3'
): Promise<AIModelResponse> {
  const ollamaUrl = getOllamaUrl();
  
  const request: OllamaRequest = {
    model,
    prompt: `Please provide a concise summary of the following text:\n\n${text}\n\nSummary:`,
    stream: false,
    options: {
      temperature: 0.7,
      top_p: 0.9
    }
  };
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minutes timeout
    
    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }
    
    const data: OllamaResponse = await response.json();
    
    // Calculate model hash (simplified for hackathon)
    const modelHash = await calculateModelHash(model, request.options || {});
    
    return {
      summary: data.response.trim(),
      model,
      modelHash,
      params: request.options || {}
    };
  } catch (error) {
    console.error('Error calling Ollama API:', error);
    throw new Error(`Failed to generate summary: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Calculate a hash for the model and parameters
 * This is a simplified approach for the hackathon
 */
export async function calculateModelHash(
  model: string,
  params: Record<string, any>
): Promise<string> {
  // Create a deterministic string from model and params
  const modelString = JSON.stringify({ model, params }, Object.keys({ model, params }).sort());
  
  // Hash the string
  const encoder = new TextEncoder();
  const data = encoder.encode(modelString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  
  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}

/**
 * Get available models from Ollama
 */
export async function getAvailableModels(): Promise<string[]> {
  const ollamaUrl = getOllamaUrl();
  
  try {
    const response = await fetch(`${ollamaUrl}/api/tags`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }
    
    const data = await response.json();
    return data.models?.map((m: any) => m.name) || [];
  } catch (error) {
    console.error('Error fetching models:', error);
    return ['llama3', 'qwen2.5-3b']; // Fallback to common models
  }
}

/**
 * Check if Ollama is running
 */
export async function checkOllamaStatus(): Promise<boolean> {
  const ollamaUrl = getOllamaUrl();
  
  try {
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}