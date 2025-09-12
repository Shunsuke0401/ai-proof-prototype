/**
 * API route for AI summarization using Ollama
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateSummary } from '../../../api/model';
import { AIModelResponse, ErrorResponse } from '../../../api/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, model } = body;
    
    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text is required and must be a string' } as ErrorResponse,
        { status: 400 }
      );
    }
    
    if (text.length > 10000) {
      return NextResponse.json(
        { error: 'Text is too long (max 10,000 characters)' } as ErrorResponse,
        { status: 400 }
      );
    }
    
    const result: AIModelResponse = await generateSummary(text, model);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Summarization error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to generate summary',
        details: error instanceof Error ? error.message : 'Unknown error'
      } as ErrorResponse,
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to submit text for summarization.' } as ErrorResponse,
    { status: 405 }
  );
}