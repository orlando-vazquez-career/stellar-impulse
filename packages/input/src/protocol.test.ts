import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_PROTOCOL_VERSION, openCampaignEnvelope, openEnvelope, parseCampaignJoinOptions,
  parseJoinOptions, parseReady, parseTechChoice, PROTOCOL_VERSION,
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

describe('campaign v2 alongside legacy v1', () => {
  it('admits only version 2 for campaign without changing legacy validation', () => {
    const body = { type: 'stop', seq: 1, squadIds: ['p1-interceptor'] };
    expect(CAMPAIGN_PROTOCOL_VERSION).toBe(2);
    expect(openCampaignEnvelope({ protocolVersion: 2, body })).toEqual({ ok: true, body });
    expect(openCampaignEnvelope({ protocolVersion: 1, body })).toEqual({ ok: false, reason: 'unsupported_version' });
    expect(openEnvelope({ protocolVersion: 1, body })).toEqual({ ok: true, body });
    expect(openEnvelope({ protocolVersion: 2, body })).toEqual({ ok: false, reason: 'unsupported_version' });
    expect(parseCampaignJoinOptions({ protocolVersion: 2, name: 'Ana' })).toEqual({ ok: true, name: 'Ana' });
    expect(parseCampaignJoinOptions({ protocolVersion: 1 })).toEqual({ ok: false, reason: 'unsupported_version' });
    expect(parseJoinOptions({ protocolVersion: 1 })).toEqual({ ok: true, name: 'Comandante' });
  });

  it('rejects extra data, symbols, prototypes and getters without running them', () => {
    let getterCalls = 0;
    const getter = { protocolVersion: 2, body: {} };
    Object.defineProperty(getter, 'body', { get() { getterCalls++; return {}; } });
    const symbol = { protocolVersion: 2, body: {}, [Symbol('hidden')]: true };
    const inherited = Object.create({ protocolVersion: 2 });
    Object.assign(inherited, { body: {} });
    for (const value of [getter, symbol, inherited, { protocolVersion: 2, body: {}, map: {} }]) {
      expect(openCampaignEnvelope(value)).toEqual({ ok: false, reason: 'invalid_envelope' });
    }
    const joinGetter = { protocolVersion: 2, name: 'Ana' };
    Object.defineProperty(joinGetter, 'name', { get() { getterCalls++; return 'Ana'; } });
    expect(parseCampaignJoinOptions(joinGetter)).toEqual({ ok: false, reason: 'invalid_join' });
    expect(parseCampaignJoinOptions({ protocolVersion: 2, name: 'Ana', admin: true }))
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

describe('lobby and transition bodies', () => {
  it('accepts only an empty body as a ready signal', () => {
    expect(parseReady({})).toBe(true);
    expect(parseReady({ ready: true })).toBe(false);
    expect(parseReady(null)).toBe(false);
  });
  it('accepts a short technology identifier and nothing else', () => {
    expect(parseTechChoice({ techId: 'frigate-shield' })).toEqual({ ok: true, techId: 'frigate-shield' });
    for (const body of [{}, { techId: '' }, { techId: 'Frigate Shield' }, { techId: 'x'.repeat(41) }, { techId: 'a', more: 1 }]) {
      expect(parseTechChoice(body)).toEqual({ ok: false, reason: 'invalid_tech' });
    }
  });
});
