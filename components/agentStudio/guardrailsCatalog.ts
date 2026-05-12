/** Static catalogs for Guardrails configuration UI (PII entities, moderation categories). */

export type PiiEntityDef = { id: string; label: string };
export type PiiRegionGroup = { region: string; entities: PiiEntityDef[] };

export const PII_REGION_GROUPS: PiiRegionGroup[] = [
  {
    region: 'Common',
    entities: [
      { id: 'person_name', label: 'Person name' },
      { id: 'email', label: 'Email address' },
      { id: 'phone', label: 'Phone number' },
      { id: 'location', label: 'Location' },
      { id: 'date_time', label: 'Date or time' },
      { id: 'ip', label: 'IP address' },
      { id: 'url', label: 'URL' },
      { id: 'credit_card', label: 'Credit card number' },
      { id: 'iban', label: 'International bank account number (IBAN)' },
      { id: 'crypto_wallet', label: 'Cryptocurrency wallet address' },
      { id: 'nationality_religion_political', label: 'Nationality / religion / political group' },
      { id: 'medical_license', label: 'Medical license number' },
    ],
  },
  {
    region: 'USA',
    entities: [
      { id: 'us_bank', label: 'US bank account number' },
      { id: 'us_drivers', label: 'US driver license number' },
      { id: 'us_itin', label: 'US individual taxpayer identification number (ITIN)' },
      { id: 'us_passport', label: 'US passport number' },
      { id: 'us_ssn', label: 'US Social Security number' },
    ],
  },
  {
    region: 'UK',
    entities: [
      { id: 'uk_ni', label: 'National Insurance number' },
      { id: 'uk_nhs', label: 'UK NHS number' },
    ],
  },
  {
    region: 'Spain',
    entities: [
      { id: 'es_nif', label: 'Spanish NIF number' },
      { id: 'es_nie', label: 'Spanish NIE number' },
    ],
  },
  {
    region: 'Italy',
    entities: [
      { id: 'it_fiscal', label: 'Italian fiscal code' },
      { id: 'it_vat', label: 'Italian VAT code' },
      { id: 'it_passport', label: 'Italian passport number' },
      { id: 'it_license', label: 'Italian driver license number' },
      { id: 'it_id', label: 'Italian identity card number' },
    ],
  },
  {
    region: 'Poland',
    entities: [{ id: 'pl_pesel', label: 'Polish PESEL number' }],
  },
  {
    region: 'Singapore',
    entities: [
      { id: 'sg_nric', label: 'Singapore NRIC/FIN' },
      { id: 'sg_uen', label: 'Singapore UEN' },
    ],
  },
  {
    region: 'Australia',
    entities: [
      { id: 'au_abn', label: 'Australian Business Number (ABN)' },
      { id: 'au_acn', label: 'Australian Company Number (ACN)' },
      { id: 'au_tfn', label: 'Australian Tax File Number (TFN)' },
      { id: 'au_medicare', label: 'Australian Medicare number' },
    ],
  },
  {
    region: 'India',
    entities: [
      { id: 'in_aadhaar', label: 'Indian Aadhaar number' },
      { id: 'in_pan', label: 'Indian PAN' },
      { id: 'in_passport', label: 'Indian passport number' },
      { id: 'in_vehicle', label: 'Indian vehicle registration number' },
      { id: 'in_voter', label: 'Indian voter ID number' },
    ],
  },
  {
    region: 'Finland',
    entities: [{ id: 'fi_personal_code', label: 'Finnish personal identity code' }],
  },
  {
    region: 'Korea',
    entities: [{ id: 'kr_rrn', label: 'Korean resident registration number' }],
  },
];

export const ALL_PII_ENTITY_IDS: string[] = PII_REGION_GROUPS.flatMap((g) => g.entities.map((e) => e.id));

export type ModerationCategoryDef = { id: string; label: string; description: string; group?: string };

export const MODERATION_CATEGORIES: ModerationCategoryDef[] = [
  { id: 'sexual', label: 'sexual', description: 'Sexually explicit or suggestive content', group: 'Sexual Content' },
  {
    id: 'sexual/minors',
    label: 'sexual/minors',
    description: 'Sexual content that includes individuals under the age of 18',
    group: 'Sexual Content',
  },
  { id: 'hate', label: 'hate', description: 'Hate speech and discriminatory content', group: 'Hate & Harassment' },
  {
    id: 'hate/threatening',
    label: 'hate/threatening',
    description: 'Hateful content that also includes violence or serious harm',
    group: 'Hate & Harassment',
  },
  {
    id: 'harassment',
    label: 'harassment',
    description: 'Harassing or bullying content',
    group: 'Hate & Harassment',
  },
  {
    id: 'harassment/threatening',
    label: 'harassment/threatening',
    description: 'Harassment content that also includes violence or serious harm',
    group: 'Hate & Harassment',
  },
  {
    id: 'self-harm',
    label: 'self-harm',
    description: 'Content promoting or depicting self-harm',
    group: 'Self-Harm',
  },
  {
    id: 'self-harm/intent',
    label: 'self-harm/intent',
    description: 'Content where the speaker expresses intent to harm oneself',
    group: 'Self-Harm',
  },
  {
    id: 'self-harm/instructions',
    label: 'self-harm/instructions',
    description: 'Content that provides instructions for self-harm',
    group: 'Self-Harm',
  },
  {
    id: 'violence',
    label: 'violence',
    description: 'Content that depicts death, violence, or physical injury',
    group: 'Violence',
  },
  {
    id: 'violence/graphic',
    label: 'violence/graphic',
    description: 'Content that depicts death, violence, or physical injury in graphic detail',
    group: 'Violence',
  },
  {
    id: 'illicit',
    label: 'illicit',
    description: 'Content that gives advice or instruction on how to commit illicit acts',
    group: 'Illicit Activities',
  },
  {
    id: 'illicit/violent',
    label: 'illicit/violent',
    description: 'Illicit content that also includes references to violence or procuring a weapon',
    group: 'Illicit Activities',
  },
];

/** Subset flagged as “most critical” presets in the UI */
export const MODERATION_CRITICAL_IDS = new Set([
  'sexual/minors',
  'hate/threatening',
  'harassment/threatening',
  'self-harm/instructions',
  'violence/graphic',
  'illicit/violent',
]);
