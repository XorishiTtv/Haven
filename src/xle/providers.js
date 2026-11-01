'use strict';

// Fixed provider endpoints: no user-controlled URLs, redirects or arbitrary hosts.
// Direct AI egress is OFF by default to protect a hidden Haven origin IP.
const PROVIDERS = Object.freeze({
  openai: { url: 'https://api.openai.com/v1/chat/completions', key: 'OPENAI_API_KEY', model: 'XLE_OPENAI_MODEL' },
  xai: { url: 'https://api.x.ai/v1/chat/completions', key: 'XAI_API_KEY', model: 'XLE_XAI_MODEL' }
});

function providerStatus(env = process.env) {
  return Object.fromEntries(Object.entries(PROVIDERS).map(([name, provider]) =>
    [name, { configured: !!(env[provider.key] && env[provider.model]), direct_egress_enabled: env.XLE_ALLOW_DIRECT_AI_EGRESS === 'true' }]
  ));
}

async function generate({ provider, system, prompt, fetchImpl = globalThis.fetch, env = process.env }) {
  const entry = PROVIDERS[provider];
  if (!entry) throw new Error('Unsupported XLE provider');
  if (env.XLE_ALLOW_DIRECT_AI_EGRESS !== 'true') {
    throw new Error('Direct AI egress disabled; deploy an isolated AI gateway before enabling model calls');
  }
  if (!env[entry.key] || !env[entry.model]) throw new Error('XLE provider credentials or model not configured');
  if (typeof system !== 'string' || !system.trim() || system.length > 64000 ||
      typeof prompt !== 'string' || !prompt.trim() || prompt.length > 2000) {
    throw new Error('Invalid XLE generation input');
  }
  const response = await fetchImpl(entry.url, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${env[entry.key]}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env[entry.model],
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ],
      max_tokens: 400
    })
  });
  if (!response.ok) throw new Error(`XLE provider returned HTTP ${response.status}`);
  const json = await response.json();
  const output = json?.choices?.[0]?.message?.content;
  if (typeof output !== 'string' || !output.trim()) throw new Error('Empty XLE provider response');
  return output.slice(0, 4000);
}

module.exports = { PROVIDERS, providerStatus, generate };
