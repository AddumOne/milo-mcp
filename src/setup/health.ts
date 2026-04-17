import Anthropic from '@anthropic-ai/sdk';
import { createOctokitWithAuth } from '../github/client.js';

export interface HealthResult {
  ok: boolean;
  degraded?: boolean;
  message: string;
  username?: string;
}

export async function testGitHubToken(token: string): Promise<HealthResult> {
  if (!token) return { ok: false, message: 'not set' };
  try {
    const octokit = createOctokitWithAuth(token);
    const { data } = await octokit.users.getAuthenticated();
    return { ok: true, message: `authenticated as ${data.login}`, username: data.login };
  } catch (e) {
    const err = e as { status?: number | string; message?: string };
    const status = err?.status ?? '';
    return { ok: false, message: `invalid: ${status} ${err?.message ?? ''}`.trim() };
  }
}

export async function testAnthropicKey(key: string): Promise<HealthResult> {
  if (!key) return { ok: true, degraded: true, message: 'not set — cosine-only search active (set ANTHROPIC_API_KEY to enable CRAG)' };
  try {
    const client = new Anthropic({ apiKey: key });
    await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1,
      messages: [{ role: 'user', content: '.' }],
    });
    return { ok: true, message: 'authenticated' };
  } catch (e) {
    const err = e as { status?: number | string; message?: string };
    const status = err?.status ?? '';
    return { ok: false, message: `invalid: ${status} ${err?.message ?? ''}`.trim() };
  }
}
