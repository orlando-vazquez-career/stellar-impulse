import { describe, expect, it } from 'vitest';
import {
  BATTLEFIELD_PROTOCOL_VERSION, CAMPAIGN_PROTOCOL_VERSION, openBattlefieldEnvelope, openCampaignEnvelope, openEnvelope,
  parseAugmentPick, parseAugmentReroll, parseBattlefieldJoinOptions, parseCampaignJoinOptions, parseDisplayName, parseJoinOptions,
  parseReady, PROTOCOL_VERSION,
} from './protocol.js';

describe('campaign message envelope', () => {
  it('opens a message from a client speaking the current protocol', () => {
    expect(openEnvelope({ protocolVersion: PROTOCOL_VERSION, body: { techId: 'vision-range' } }))
      .toEqual({ ok: true, body: { techId: 'vision-range' } });
  });
  it('rejects clients on another protocol version with an explicit reason', () => {
    expect(openEnvelope({ protocolVersion: PROTOCOL_VERSION + 1, body: {} }))
      .toEqual({ ok: false, reason: 'unsupported_version' });
  });
  it('rejects malformed envelopes without coercion', () => {
    for (const value of [null, [], 'text', { body: {} }, { protocolVersion: '1', body: {} },
      { protocolVersion: PROTOCOL_VERSION, body: {}, extra: true }, Object.create({ protocolVersion: 1, body: {} })]) {
      expect(openEnvelope(value)).toEqual({ ok: false, reason: 'invalid_envelope' });
    }
  });
});

describe('campaign v3, battlefield v2 and legacy v1', () => {
  it('accepts only the Espiral and Sector 01 map options', () => {
    expect(parseCampaignJoinOptions({ protocolVersion: 3, name: 'Ana', token: 'abc', map: 'espiral' }))
      .toEqual({ ok: true, name: 'Ana', token: 'abc', map: 'espiral' });
    expect(parseCampaignJoinOptions({ protocolVersion: 3, map: 'sector-01' })).toEqual({ ok: true, name: 'Comandante', map: 'sector-01' });
    for (const map of ['other-map', '', {}, { width: 29 }, null]) {
      expect(parseCampaignJoinOptions({ protocolVersion: 3, map })).toEqual({ ok: false, reason: 'invalid_join' });
    }
  });

  it('admits only version 3 for campaign and keeps version 2 for the battlefield room', () => {
    const body = { type: 'stop', seq: 1, squadIds: ['p1-interceptor'] };
    expect(CAMPAIGN_PROTOCOL_VERSION).toBe(3);
    expect(BATTLEFIELD_PROTOCOL_VERSION).toBe(2);
    expect(openCampaignEnvelope({ protocolVersion: 3, body })).toEqual({ ok: true, body });
    expect(openCampaignEnvelope({ protocolVersion: 2, body })).toEqual({ ok: false, reason: 'unsupported_version' });
    expect(openBattlefieldEnvelope({ protocolVersion: 2, body })).toEqual({ ok: true, body });
    expect(openBattlefieldEnvelope({ protocolVersion: 3, body })).toEqual({ ok: false, reason: 'unsupported_version' });
    expect(openEnvelope({ protocolVersion: 1, body })).toEqual({ ok: true, body });
    expect(openEnvelope({ protocolVersion: 3, body })).toEqual({ ok: false, reason: 'unsupported_version' });
    expect(parseCampaignJoinOptions({ protocolVersion: 3, name: 'Ana' })).toEqual({ ok: true, name: 'Ana' });
    expect(parseCampaignJoinOptions({ protocolVersion: 3, name: 'Ana', token: 'abc' }))
      .toEqual({ ok: true, name: 'Ana', token: 'abc' });
    expect(parseCampaignJoinOptions({ protocolVersion: 2 })).toEqual({ ok: false, reason: 'unsupported_version' });
    expect(parseJoinOptions({ protocolVersion: 1 })).toEqual({ ok: true, name: 'Comandante' });
  });

  it('keeps the battlefield room on version 2 with only its Sector 01 map', () => {
    expect(parseBattlefieldJoinOptions({ protocolVersion: 2, name: 'Ana', map: 'sector-01' }))
      .toEqual({ ok: true, name: 'Ana', map: 'sector-01' });
    expect(parseBattlefieldJoinOptions({ protocolVersion: 2, map: 'espiral' })).toEqual({ ok: false, reason: 'invalid_join' });
    expect(parseBattlefieldJoinOptions({ protocolVersion: 3, name: 'Ana' })).toEqual({ ok: false, reason: 'unsupported_version' });
  });

  it('rejects extra data, symbols, prototypes and getters without running them', () => {
    let getterCalls = 0;
    const getter = { protocolVersion: 3, body: {} };
    Object.defineProperty(getter, 'body', { get() { getterCalls++; return {}; } });
    const symbol = { protocolVersion: 3, body: {}, [Symbol('hidden')]: true };
    const inherited = Object.create({ protocolVersion: 3 });
    Object.assign(inherited, { body: {} });
    for (const value of [getter, symbol, inherited, { protocolVersion: 3, body: {}, map: {} }]) {
      expect(openCampaignEnvelope(value)).toEqual({ ok: false, reason: 'invalid_envelope' });
    }
    const joinGetter = { protocolVersion: 3, name: 'Ana' };
    Object.defineProperty(joinGetter, 'name', { get() { getterCalls++; return 'Ana'; } });
    expect(parseCampaignJoinOptions(joinGetter)).toEqual({ ok: false, reason: 'invalid_join' });
    expect(parseCampaignJoinOptions({ protocolVersion: 3, name: 'Ana', admin: true }))
      .toEqual({ ok: false, reason: 'invalid_join' });
    expect(getterCalls).toBe(0);
  });
});

describe('join options', () => {
  it('accepts the protocol version and an optional display name', () => {
    expect(parseJoinOptions({ protocolVersion: PROTOCOL_VERSION, name: '  Ñandú 07  ' }))
      .toEqual({ ok: true, name: 'Ñandú 07' });
    expect(parseJoinOptions({ protocolVersion: PROTOCOL_VERSION })).toEqual({ ok: true, name: 'Comandante' });
  });
  it('rejects a missing or different protocol version before admission', () => {
    expect(parseJoinOptions({})).toEqual({ ok: false, reason: 'unsupported_version' });
    expect(parseJoinOptions({ protocolVersion: 0, name: 'A' })).toEqual({ ok: false, reason: 'unsupported_version' });
  });
  it('rejects names that are empty, too long or carry markup', () => {
    for (const name of ['   ', 'x'.repeat(25), '<script>', 7]) {
      expect(parseJoinOptions({ protocolVersion: PROTOCOL_VERSION, name })).toEqual({ ok: false, reason: 'invalid_join' });
    }
    expect(parseJoinOptions({ protocolVersion: PROTOCOL_VERSION, name: 'A', admin: true }))
      .toEqual({ ok: false, reason: 'invalid_join' });
  });
});

describe('commander display name', () => {
  it('trims and accepts 1 to 24 letters, digits, spaces, dots, hyphens or underscores', () => {
    expect(parseDisplayName('  Ñandú 07  ')).toBe('Ñandú 07');
    expect(parseDisplayName('Vega_2.alfa-b')).toBe('Vega_2.alfa-b');
    expect(parseDisplayName('x'.repeat(24))).toBe('x'.repeat(24));
  });
  it('rejects what a room would also reject as a name', () => {
    for (const value of ['', '   ', 'x'.repeat(25), '<script>', 'ana@example.com', 7, null, undefined, {}]) {
      expect(parseDisplayName(value)).toBeNull();
    }
  });
});

describe('lobby and augment bodies', () => {
  it('accepts only an empty body as a ready signal', () => {
    expect(parseReady({})).toBe(true);
    expect(parseReady({ ready: true })).toBe(false);
    expect(parseReady(null)).toBe(false);
  });
  it('accepts an augment pick with a choice number and a card id only', () => {
    expect(parseAugmentPick({ choice: 1, id: 'g-asalto' })).toEqual({ ok: true, choice: 1, id: 'g-asalto' });
    for (const body of [{}, null, { choice: 3, id: 'g-x' }, { choice: -1, id: 'g-x' }, { choice: 1.5, id: 'g-x' },
      { choice: '1', id: 'g-x' }, { choice: 1, id: '' }, { choice: 1, id: 'G X' }, { choice: 1, id: 'g-' + 'x'.repeat(41) },
      { choice: 1, id: 'g-x', more: 1 }]) {
      expect(parseAugmentPick(body)).toEqual({ ok: false, reason: 'invalid_augment_pick' });
    }
  });
  it('accepts a reroll with a choice number and nothing else', () => {
    expect(parseAugmentReroll({ choice: 2 })).toEqual({ ok: true, choice: 2 });
    for (const body of [{}, null, { choice: 3 }, { choice: 0, id: 's-optica' }]) {
      expect(parseAugmentReroll(body)).toEqual({ ok: false, reason: 'invalid_augment_reroll' });
    }
  });
});
