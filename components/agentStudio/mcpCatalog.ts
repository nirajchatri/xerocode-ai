/** Preset MCP servers shown in “Add MCP server” (logos via Simple Icons CDN). */

export type McpCatalogGroup = 'openai' | 'third_party';

export type McpCatalogEntry = {
  id: string;
  name: string;
  group: McpCatalogGroup;
  /** Slug for `https://cdn.simpleicons.org/{slug}` (brand color SVG). */
  logoSlug: string;
  /** Official developer / dashboard page where users obtain API keys, OAuth apps, or tokens. */
  accessTokenDocsUrl: string;
};

/** When no preset is chosen, link to MCP project home for security and setup context. */
export const MCP_DEFAULT_ACCESS_TOKEN_HELP_URL = 'https://modelcontextprotocol.io/';

export const MCP_OPENAI_SERVERS: McpCatalogEntry[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    group: 'openai',
    logoSlug: 'gmail',
    accessTokenDocsUrl: 'https://console.cloud.google.com/apis/credentials',
  },
  {
    id: 'google_calendar',
    name: 'Google Calendar',
    group: 'openai',
    logoSlug: 'googlecalendar',
    accessTokenDocsUrl: 'https://console.cloud.google.com/apis/credentials',
  },
  {
    id: 'google_drive',
    name: 'Google Drive',
    group: 'openai',
    logoSlug: 'googledrive',
    accessTokenDocsUrl: 'https://console.cloud.google.com/apis/credentials',
  },
  {
    id: 'outlook_mail',
    name: 'Outlook Email',
    group: 'openai',
    logoSlug: 'microsoftoutlook',
    accessTokenDocsUrl:
      'https://learn.microsoft.com/en-us/graph/auth-register-app-v2',
  },
  {
    id: 'outlook_calendar',
    name: 'Outlook Calendar',
    group: 'openai',
    logoSlug: 'microsoftoutlook',
    accessTokenDocsUrl:
      'https://learn.microsoft.com/en-us/graph/auth-register-app-v2',
  },
  {
    id: 'sharepoint',
    name: 'Sharepoint',
    group: 'openai',
    logoSlug: 'microsoftsharepoint',
    accessTokenDocsUrl:
      'https://learn.microsoft.com/en-us/graph/auth-register-app-v2',
  },
  {
    id: 'microsoft_teams',
    name: 'Microsoft Teams',
    group: 'openai',
    logoSlug: 'microsoftteams',
    accessTokenDocsUrl:
      'https://learn.microsoft.com/en-us/microsoftteams/platform/get-started/overview',
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    group: 'openai',
    logoSlug: 'dropbox',
    accessTokenDocsUrl: 'https://www.dropbox.com/developers/apps',
  },
];

export const MCP_THIRD_PARTY_SERVERS: McpCatalogEntry[] = [
  {
    id: 'box',
    name: 'Box',
    group: 'third_party',
    logoSlug: 'box',
    accessTokenDocsUrl: 'https://app.box.com/developers/console',
  },
  {
    id: 'zapier',
    name: 'Zapier',
    group: 'third_party',
    logoSlug: 'zapier',
    accessTokenDocsUrl:
      'https://platform.zapier.com/docs/mcp/getting-started-with-mcp-from-zapier',
  },
  {
    id: 'shopify',
    name: 'Shopify',
    group: 'third_party',
    logoSlug: 'shopify',
    accessTokenDocsUrl:
      'https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens',
  },
  {
    id: 'intercom',
    name: 'Intercom',
    group: 'third_party',
    logoSlug: 'intercom',
    accessTokenDocsUrl:
      'https://developers.intercom.com/docs/build-an-integration/learn-more/authentication',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    group: 'third_party',
    logoSlug: 'stripe',
    accessTokenDocsUrl: 'https://dashboard.stripe.com/apikeys',
  },
  {
    id: 'plaid',
    name: 'Plaid',
    group: 'third_party',
    logoSlug: 'plaid',
    accessTokenDocsUrl: 'https://dashboard.plaid.com/team/keys',
  },
  {
    id: 'square',
    name: 'Square',
    group: 'third_party',
    logoSlug: 'square',
    accessTokenDocsUrl: 'https://developer.squareup.com/apps',
  },
  {
    id: 'cloudflare_browser',
    name: 'Cloudflare Browser',
    group: 'third_party',
    logoSlug: 'cloudflare',
    accessTokenDocsUrl: 'https://dash.cloudflare.com/profile/api-tokens',
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    group: 'third_party',
    logoSlug: 'hubspot',
    accessTokenDocsUrl: 'https://developers.hubspot.com/docs/api/working-with-oauth',
  },
  {
    id: 'pipedream',
    name: 'Pipedream',
    group: 'third_party',
    logoSlug: 'pipedream',
    accessTokenDocsUrl: 'https://pipedream.com/docs/apps/api-keys/',
  },
  {
    id: 'paypal',
    name: 'PayPal',
    group: 'third_party',
    logoSlug: 'paypal',
    accessTokenDocsUrl: 'https://developer.paypal.com/dashboard/applications/live',
  },
  {
    id: 'deepwiki_devin',
    name: 'DeepWiki (Devin)',
    group: 'third_party',
    logoSlug: 'wikipedia',
    accessTokenDocsUrl: 'https://devin.ai/',
  },
];

/** Single list for the catalog grid (OpenAI presets first, then third party). */
export const MCP_CATALOG_ALL: McpCatalogEntry[] = [...MCP_OPENAI_SERVERS, ...MCP_THIRD_PARTY_SERVERS];

const BY_ID = new Map<string, McpCatalogEntry>();
for (const e of MCP_CATALOG_ALL) BY_ID.set(e.id, e);

export function mcpBrandLogoUrl(logoSlug: string): string {
  return `https://cdn.simpleicons.org/${encodeURIComponent(logoSlug)}`;
}

export function lookupMcpCatalogEntry(id?: string | null): McpCatalogEntry | undefined {
  if (!id || id === 'custom') return undefined;
  return BY_ID.get(id);
}

/** URL to open for “Get access token” — preset-specific or MCP default for custom/generic. */
export function resolveMcpAccessTokenHelpUrl(catalogId?: string | null): string {
  const e = lookupMcpCatalogEntry(catalogId);
  if (e?.accessTokenDocsUrl) return e.accessTokenDocsUrl;
  return MCP_DEFAULT_ACCESS_TOKEN_HELP_URL;
}

export function mcpPresetDisplayTitle(catalogId: string | undefined, serverLabel?: string): string {
  const fromCat = lookupMcpCatalogEntry(catalogId);
  if (fromCat) return fromCat.name;
  const lab = String(serverLabel ?? '').trim();
  if (lab) return lab;
  return 'MCP Server';
}
