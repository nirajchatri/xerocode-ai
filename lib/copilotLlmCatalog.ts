export type CopilotLlmProviderId = 'google' | 'openai' | 'anthropic' | 'deepseek';

export const COPILOT_LLM_PROVIDERS: { id: CopilotLlmProviderId; label: string }[] = [
  { id: 'google', label: 'Google' },
  { id: 'openai', label: 'Open AI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'deepseek', label: 'DeepSeek' },
];

export const COPILOT_MODELS_BY_PROVIDER: Record<CopilotLlmProviderId, { value: string; label: string }[]> = {
  google: [
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  ],
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
    { value: 'o3-mini', label: 'o3-mini' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  ],
  anthropic: [
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
    { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
  ],
  deepseek: [
    { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash (vision)' },
    { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro (vision)' },
    { value: 'deepseek-chat', label: 'DeepSeek Chat' },
    { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1)' },
    { value: 'deepseek-v3', label: 'DeepSeek V3' },
  ],
};
