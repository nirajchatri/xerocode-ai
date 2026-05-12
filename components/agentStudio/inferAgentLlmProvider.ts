export type LlmProviderId = 'openai' | 'google' | 'anthropic';

export function inferAgentLlmProvider(model: string | undefined): LlmProviderId {
  const m = String(model ?? '').toLowerCase();
  if (m.includes('gemini')) return 'google';
  if (m.includes('claude')) return 'anthropic';
  return 'openai';
}
