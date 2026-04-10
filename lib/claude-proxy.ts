// Claude API base URL with optional proxy override.
//
// Some regions (including RU) block direct access to api.anthropic.com from
// server infrastructure. Deploy a Cloudflare Worker that reverse-proxies to
// api.anthropic.com and set CLAUDE_PROXY_URL to its https URL — all server
// calls will route through it transparently. Client-side calls (from the
// user's browser) are not affected and still hit api.anthropic.com directly.

const DEFAULT_CLAUDE_API_URL = "https://api.anthropic.com"

function normalize(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url
}

export const getClaudeApiUrl = (): string =>
  normalize(process.env.CLAUDE_PROXY_URL || DEFAULT_CLAUDE_API_URL)

export const getClaudeMessagesUrl = (): string =>
  `${getClaudeApiUrl()}/v1/messages`
