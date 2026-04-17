import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    if (!config.anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for CRAG validation and Self-RAG grading.');
    }
    _client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return _client;
}

/** Call a fast model for structured LLM completion. Returns raw text. */
export async function complete(prompt: string, maxTokens = 200): Promise<string> {
  const client = getClient();
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
messages: [{ role: 'user', content: prompt }],
  });

  const block = message.content[0];
  if (block.type !== 'text') throw new Error('Unexpected non-text response from LLM');
  return block.text;
}

/** Complete and parse JSON from the response. */
export async function completeJSON<T>(prompt: string, maxTokens = 300): Promise<T> {
  const text = await complete(prompt, maxTokens);
  // Strip markdown code fences if present
  const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(cleaned) as T;
}
