import { describe, expect, it } from 'vitest';
import { describeRoute, initialLobby, reduceLobby, routeHint } from './lobby-state';
import { findMode, opensCurrentArena } from './modes';

const campaign = findMode('campaign');
const training = findMode('training');

describe('lobby state', () => {
  it('keeps the open mode while browsing another', () => {
    const entered = reduceLobby(initialLobby(campaign.id), { type: 'enter', modeId: 'versus' });
    expect(reduceLobby(entered, { type: 'preview', modeId: 'hangar' })).toEqual(entered);
  });

  it('clears the chosen option when entering a mode', () => {
    const browsing = reduceLobby(initialLobby(campaign.id), { type: 'preview', modeId: 'training' });
    const picked = reduceLobby({ ...browsing, entered: true, optionIndex: 1, deployed: true }, { type: 'enter', modeId: 'training' });
    expect(picked).toEqual({ modeId: 'training', entered: true, optionIndex: null, deployed: false });
  });

  it('ignores deploy before a choice', () => {
    const entered = reduceLobby(initialLobby(campaign.id), { type: 'enter', modeId: campaign.id });
    expect(reduceLobby(entered, { type: 'deploy' })).toEqual(entered);
  });

  it('marks the choice ready to jump', () => {
    const entered = reduceLobby(initialLobby(campaign.id), { type: 'enter', modeId: campaign.id });
    const picked = reduceLobby(entered, { type: 'pick', optionIndex: 1 });
    expect(reduceLobby(picked, { type: 'deploy' }).deployed).toBe(true);
  });

  it('returns to the atlas without a selection', () => {
    const entered = reduceLobby(initialLobby(campaign.id), { type: 'enter', modeId: 'credits' });
    const picked = reduceLobby(entered, { type: 'pick', optionIndex: 0 });
    expect(reduceLobby(picked, { type: 'back' })).toEqual({ modeId: 'credits', entered: false, optionIndex: null, deployed: false });
  });
});

describe('route copy', () => {
  it('names the mode while the atlas is open', () => {
    expect(describeRoute(campaign, initialLobby(campaign.id))).toBe('CMP · CAMPAÑA');
    expect(routeHint(false)).toBe('PASA EL CURSOR · CLIC PARA ENTRAR');
  });

  it('asks for an option after entering', () => {
    const entered = reduceLobby(initialLobby(campaign.id), { type: 'enter', modeId: campaign.id });
    expect(describeRoute(campaign, entered)).toBe('ELIGE UNA OPCIÓN');
    expect(routeHint(true)).toBe('T+00:00 · EN ÓRBITA');
  });

  it('names the choice once it is selected', () => {
    const entered = reduceLobby(initialLobby(training.id), { type: 'enter', modeId: training.id });
    const picked = reduceLobby(entered, { type: 'pick', optionIndex: 0 });
    expect(describeRoute(training, picked)).toBe('LISTO · UN SECTOR');
    expect(describeRoute(training, reduceLobby(picked, { type: 'deploy' }))).toBe('SALTANDO A UN SECTOR');
  });
});

describe('arena entry', () => {
  it('opens the current arena only from training on one sector', () => {
    const sector = training.options.findIndex((option) => option.name === 'Un sector');
    expect(opensCurrentArena(training, sector)).toBe(true);
    expect(opensCurrentArena(training, sector + 1)).toBe(false);
    expect(opensCurrentArena(campaign, 0)).toBe(false);
  });
});
