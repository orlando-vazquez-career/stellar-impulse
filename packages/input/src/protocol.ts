/** Versioned message envelopes; campaign uses v2 while v1 remains available to legacy consumers. */
export const PROTOCOL_VERSION = 1;
export const CAMPAIGN_PROTOCOL_VERSION = 2;

export type EnvelopeResult =
  | { ok: true; body: unknown }
  | { ok: false; reason: 'invalid_envelope' | 'unsupported_version' };
export type JoinResult =
  | { ok: true; name: string }
  | { ok: false; reason: 'invalid_join' | 'unsupported_version' };
export type CampaignJoinResult =
  | { ok: true; name: string; token?: string; map?: 'sector-01' }
  | { ok: false; reason: 'invalid_join' | 'unsupported_version' };
export type TechResult = { ok: true; techId: string } | { ok: false; reason: 'invalid_tech' };

const DEFAULT_NAME = 'Comandante';
const NAME = /^[\p{L}\p{N} _.-]{1,24}$/u;
const TECH_ID = /^[a-z0-9-]{1,40}$/;

/** Own data properties of a plain object, or null when the value could smuggle getters or a prototype. */
function plainFields(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const fields: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!('value' in descriptor)) return null;
    fields[key] = descriptor.value;
  }
  if (Reflect.ownKeys(value).length !== Object.keys(fields).length) return null;
  return fields;
}

const onlyKeys = (fields: Record<string, unknown>, allowed: string[]): boolean =>
  Object.keys(fields).every((key) => allowed.includes(key));

function openVersionedEnvelope(value: unknown, expectedVersion: number): EnvelopeResult {
  const fields = plainFields(value);
  if (!fields || !onlyKeys(fields, ['protocolVersion', 'body']) || !('body' in fields)) return { ok: false, reason: 'invalid_envelope' };
  const version = fields.protocolVersion;
  if (typeof version !== 'number' || !Number.isSafeInteger(version)) return { ok: false, reason: 'invalid_envelope' };
  if (version !== expectedVersion) return { ok: false, reason: 'unsupported_version' };
  return { ok: true, body: fields.body };
}

export function openEnvelope(value: unknown): EnvelopeResult {
  return openVersionedEnvelope(value, PROTOCOL_VERSION);
}

export function openCampaignEnvelope(value: unknown): EnvelopeResult {
  return openVersionedEnvelope(value, CAMPAIGN_PROTOCOL_VERSION);
}

function parseVersionedJoinOptions(value: unknown, expectedVersion: number): JoinResult {
  const fields = plainFields(value);
  if (!fields) return { ok: false, reason: 'invalid_join' };
  if (fields.protocolVersion !== expectedVersion) return { ok: false, reason: 'unsupported_version' };
  if (!onlyKeys(fields, ['protocolVersion', 'name'])) return { ok: false, reason: 'invalid_join' };
  if (fields.name === undefined) return { ok: true, name: DEFAULT_NAME };
  if (typeof fields.name !== 'string') return { ok: false, reason: 'invalid_join' };
  const name = fields.name.trim();
  return NAME.test(name) ? { ok: true, name } : { ok: false, reason: 'invalid_join' };
}

export function parseJoinOptions(value: unknown): JoinResult {
  return parseVersionedJoinOptions(value, PROTOCOL_VERSION);
}

export function parseCampaignJoinOptions(value: unknown): CampaignJoinResult {
  const fields = plainFields(value);
  if (!fields) return { ok: false, reason: 'invalid_join' };
  if (fields.protocolVersion !== CAMPAIGN_PROTOCOL_VERSION) return { ok: false, reason: 'unsupported_version' };
  if (!onlyKeys(fields, ['protocolVersion', 'name', 'token', 'map'])) return { ok: false, reason: 'invalid_join' };
  if (fields.map !== undefined && fields.map !== 'sector-01') return { ok: false, reason: 'invalid_join' };
  const parsed = parseVersionedJoinOptions({ protocolVersion: fields.protocolVersion, name: fields.name }, CAMPAIGN_PROTOCOL_VERSION);
  if (!parsed.ok) return parsed;
  if (fields.token !== undefined && (typeof fields.token !== 'string' || fields.token.length > 256)) {
    return { ok: false, reason: 'invalid_join' };
  }
  return {
    ...parsed,
    ...(typeof fields.token === 'string' ? { token: fields.token } : {}),
    ...(fields.map === 'sector-01' ? { map: fields.map } : {}),
  };
}

export function parseReady(body: unknown): boolean {
  const fields = plainFields(body);
  return fields !== null && Object.keys(fields).length === 0;
}

export function parseTechChoice(body: unknown): TechResult {
  const fields = plainFields(body);
  if (!fields || !onlyKeys(fields, ['techId']) || typeof fields.techId !== 'string' || !TECH_ID.test(fields.techId)) {
    return { ok: false, reason: 'invalid_tech' };
  }
  return { ok: true, techId: fields.techId };
}
