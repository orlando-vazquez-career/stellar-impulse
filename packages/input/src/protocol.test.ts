import { describe, expect, it } from 'vitest';
import { openEnvelope, parseJoinOptions, parseReady, parseTechChoice, PROTOCOL_VERSION } from './protocol.js';

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
