import type { AgentNodeData } from './agentNodeData';

export type RunApiResult = { responseBodyJson: string; responseStatus: number | null };

/** Browser fetch for workflow API nodes (CORS applies). */
export async function runAgentApiRequest(d: AgentNodeData): Promise<RunApiResult> {
  const method = String(d.method || 'GET').toUpperCase();
  const baseUrl = String(d.url || '').trim();
  if (!baseUrl) {
    return {
      responseBodyJson: JSON.stringify({ error: 'Request URL is empty.' }, null, 2),
      responseStatus: null,
    };
  }

  let finalUrl: string;
  try {
    const u = new URL(baseUrl);
    (d.apiQueryParams || []).forEach((row) => {
      if (row.key.trim()) u.searchParams.set(row.key.trim(), row.value);
    });
    finalUrl = u.toString();
  } catch {
    finalUrl = baseUrl;
  }

  const headers: Record<string, string> = {};
  (d.apiHeaders || []).forEach((row) => {
    if (row.key.trim()) headers[row.key.trim()] = row.value;
  });

  const bodyRaw = String(d.requestBodyJson ?? '').trim();
  const init: RequestInit = { method, headers };

  const typicallyHasBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  if (typicallyHasBody && bodyRaw) {
    init.body = bodyRaw;
  }

  try {
    const res = await fetch(finalUrl, init);
    const text = await res.text();
    let pretty = text;
    try {
      pretty = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      /* non-JSON */
    }
    return { responseBodyJson: pretty, responseStatus: res.status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      responseBodyJson: JSON.stringify({ error: msg, hint: 'Check CORS, URL, and network.' }, null, 2),
      responseStatus: null,
    };
  }
}
