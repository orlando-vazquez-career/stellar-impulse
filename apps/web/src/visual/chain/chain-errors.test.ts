import { describe, expect, it } from 'vitest';
import { ChainError } from '@impulso/chain';
import { chainErrorHash, chainErrorText, short, WrongAccountError } from './chain-errors';

const refused = (code: number) => new ChainError('CONTRACT_REJECTED', 'texto del cliente', code);

describe('chain error text', () => {
  it.each([
    [10, 'No tienes saldo suficiente en testnet.', 'Your testnet balance is too low.'],
    [101, 'Ese anuncio no existe.', 'That listing does not exist.'],
    [105, 'El vendedor ya no tiene esta pieza.', 'The seller no longer holds this piece.'],
    [107, 'El precio cambió. Revisa el anuncio antes de comprar.', 'The price changed. Check the listing before buying.'],
  ])('words contract refusal %i in each language without its number', (code, es, en) => {
    expect(chainErrorText(refused(code), 'es')).toBe(es);
    expect(chainErrorText(refused(code), 'en')).toBe(en);
  });

  it('keeps the number of a refusal it cannot word', () => {
    expect(chainErrorText(refused(42), 'es')).toBe('El contrato rechazó la operación (#42).');
    expect(chainErrorText(refused(42), 'en')).toContain('#42');
  });

  it('sends a pending or unconfirmed operation to the explorer', () => {
    expect(chainErrorText(new ChainError('PENDING', 'x', undefined, 'ab'.repeat(32)), 'es')).toBe('Pendiente: revisa en el explorador.');
    expect(chainErrorText(new ChainError('PENDING', 'x'), 'en')).toBe('Pending: check the explorer.');
    expect(chainErrorText(new ChainError('INVALID_RESPONSE', 'x'), 'es')).toMatch(/explorador/);
    expect(chainErrorText(new ChainError('INVALID_RESPONSE', 'x'), 'en')).toMatch(/explorer/);
  });

  it('keeps the wrong-account message with both addresses shortened', () => {
    const active = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ';
    const linked = 'GBKNU5OIKQ4F6GYBSHLFYFXBVJ57BU5G7MSRP2UKWM3R5WSKB6Z3M5GQ';
    expect(chainErrorText(new WrongAccountError(active, linked), 'es'))
      .toBe(`En Freighter está activa otra cuenta (${short(active)}). Cambia a ${short(linked)}, la vinculada a tu cuenta.`);
  });

  it('names wallet, network and server failures', () => {
    expect(chainErrorText(new ChainError('WALLET_REJECTED', 'x'), 'es')).toBe('La firma se canceló en Freighter.');
    expect(chainErrorText(new ChainError('RPC_UNAVAILABLE', 'x'), 'en')).toBe('Could not read Stellar testnet. Check your connection.');
    expect(chainErrorText({ code: 'wallet_in_use' }, 'es')).toBe('Esa wallet ya está vinculada a otra cuenta.');
    expect(chainErrorText(new Error('boom'), 'es')).toBe('No se pudo completar la operación.');
    expect(chainErrorText(null, 'en')).toBe('The operation could not be completed.');
  });

  it('hands the transaction hash of a pending or refused operation to the notice', () => {
    expect(chainErrorHash(new ChainError('PENDING', 'x', undefined, 'ab'.repeat(32)))).toBe('ab'.repeat(32));
    expect(chainErrorHash(new ChainError('CONTRACT_REJECTED', 'x', 8))).toBeUndefined();
    expect(chainErrorHash({ transactionHash: 'javascript:alert(1)' })).toBeUndefined();
    expect(chainErrorHash(null)).toBeUndefined();
  });
});
