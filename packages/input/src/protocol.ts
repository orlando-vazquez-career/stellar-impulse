import { PLAYABLE_MAPS, type PlayableMapId } from './playable-maps.js';

/**
 * Versioned message envelopes. Campaign v3 runs the match engine (Espiral, augments, base);
 * the battlefield room keeps v2 and v1 remains available to legacy consumers.
 */
export const PROTOCOL_VERSION = 1;
export const BATTLEFIELD_PROTOCOL_VERSION = 2;
export const CAMPAIGN_PROTOCOL_VERSION = 3;
export type CampaignMap = PlayableMapId | 'sector-01';

export type EnvelopeResult =
  | { ok: true; body: unknown }
  | { ok: false; reason: 'invalid_envelope' | 'unsupported_version' };
export type JoinResult =
  | { ok: true; name: string }
  | { ok: false; reason: 'invalid_join' | 'unsupported_version' };
export type CampaignJoinResult =
  | { ok: true; name: string; token?: string; map?: CampaignMap }
  | { ok: false; reason: 'invalid_join' | 'unsupported_version' };
export type AugmentPickResult = { ok: true; choice: number; id: string } | { ok: false; reason: 'invalid_augment_pick' };
export type AugmentRerollResult = { ok: true; choice: number } | { ok: false; reason: 'invalid_augment_reroll' };

const DEFAULT_NAME = 'Comandante';
const NAME = /^[\p{L}\p{N} _.-]{1,24}$/u;
const AUGMENT_ID = /^[a-z]-[a-z0-9-]{1,40}$/;
const MAPS: readonly CampaignMap[] = PLAYABLE_MAPS.map((map) => map.id);
/** Campaign sectors offer one augment each: choice 0, 1 or 2. */
const isChoice = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 2;

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

/** A commander name, trimmed: 1 to 24 letters, digits, spaces, `_`, `.` or `-`. Rooms and accounts share the rule. */
export function parseDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return NAME.test(name) ? name : null;
}

/**
 * What a new account password needs, in the order the access screen lists it. Only registration
 * enforces it: older accounts keep signing in with the password they chose.
 */
export const PASSWORD_RULES = ['length', 'lowercase', 'uppercase', 'symbol'] as const;
export type PasswordRule = typeof PASSWORD_RULES[number];

const PASSWORD_CHECKS: Record<PasswordRule, (value: string) => boolean> = {
  length: (value) => value.length >= 8 && value.length <= 128,
  lowercase: (value) => /\p{Ll}/u.test(value),
  uppercase: (value) => /\p{Lu}/u.test(value),
  // Anything that is not a letter, an accent mark or a digit: punctuation, a space, an emoji.
  symbol: (value) => /[^\p{L}\p{M}\p{N}]/u.test(value),
};

/** The rules a password still misses; every rule when the value is not text. */
export function passwordIssues(value: unknown): PasswordRule[] {
  if (typeof value !== 'string') return [...PASSWORD_RULES];
  return PASSWORD_RULES.filter((rule) => !PASSWORD_CHECKS[rule](value));
}

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

export function openBattlefieldEnvelope(value: unknown): EnvelopeResult {
  return openVersionedEnvelope(value, BATTLEFIELD_PROTOCOL_VERSION);
}

function parseVersionedJoinOptions(value: unknown, expectedVersion: number): JoinResult {
  const fields = plainFields(value);
  if (!fields) return { ok: false, reason: 'invalid_join' };
  if (fields.protocolVersion !== expectedVersion) return { ok: false, reason: 'unsupported_version' };
  if (!onlyKeys(fields, ['protocolVersion', 'name'])) return { ok: false, reason: 'invalid_join' };
  if (fields.name === undefined) return { ok: true, name: DEFAULT_NAME };
  const name = parseDisplayName(fields.name);
  return name === null ? { ok: false, reason: 'invalid_join' } : { ok: true, name };
}

export function parseJoinOptions(value: unknown): JoinResult {
  return parseVersionedJoinOptions(value, PROTOCOL_VERSION);
}

/** Room admission: version, optional name, session token and one of the room's maps. */
function parseRoomJoinOptions(value: unknown, version: number, maps: readonly CampaignMap[]): CampaignJoinResult {
  const fields = plainFields(value);
  if (!fields) return { ok: false, reason: 'invalid_join' };
  if (fields.protocolVersion !== version) return { ok: false, reason: 'unsupported_version' };
  if (!onlyKeys(fields, ['protocolVersion', 'name', 'token', 'map'])) return { ok: false, reason: 'invalid_join' };
  if (fields.map !== undefined && !maps.includes(fields.map as CampaignMap)) return { ok: false, reason: 'invalid_join' };
  const parsed = parseVersionedJoinOptions({ protocolVersion: fields.protocolVersion, name: fields.name }, version);
  if (!parsed.ok) return parsed;
  if (fields.token !== undefined && (typeof fields.token !== 'string' || fields.token.length > 256)) {
    return { ok: false, reason: 'invalid_join' };
  }
  return {
    ...parsed,
    ...(typeof fields.token === 'string' ? { token: fields.token } : {}),
    ...(fields.map !== undefined ? { map: fields.map as CampaignMap } : {}),
  };
}

export function parseCampaignJoinOptions(value: unknown): CampaignJoinResult {
  return parseRoomJoinOptions(value, CAMPAIGN_PROTOCOL_VERSION, MAPS);
}

export function parseBattlefieldJoinOptions(value: unknown): CampaignJoinResult {
  return parseRoomJoinOptions(value, BATTLEFIELD_PROTOCOL_VERSION, ['sector-01']);
}

export function parseReady(body: unknown): boolean {
  const fields = plainFields(body);
  return fields !== null && Object.keys(fields).length === 0;
}

export function parseAugmentPick(body: unknown): AugmentPickResult {
  const fields = plainFields(body);
  if (!fields || !onlyKeys(fields, ['choice', 'id']) || !isChoice(fields.choice)
    || typeof fields.id !== 'string' || !AUGMENT_ID.test(fields.id)) return { ok: false, reason: 'invalid_augment_pick' };
  return { ok: true, choice: fields.choice, id: fields.id };
}

export function parseAugmentReroll(body: unknown): AugmentRerollResult {
  const fields = plainFields(body);
  if (!fields || !onlyKeys(fields, ['choice']) || !isChoice(fields.choice)) return { ok: false, reason: 'invalid_augment_reroll' };
  return { ok: true, choice: fields.choice };
}
