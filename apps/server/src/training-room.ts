import { randomInt } from 'node:crypto';
import { Room, ServerError, type Client } from '@colyseus/core';
import type { AuthService } from './auth';
import { savedReward } from './rewards';
import { setAugmentPool, carryAugments, emptyProgress, profileFor, type MatchReward } from '@impulso/sim';
import { parseCommand } from '@impulso/input';
import { createSectorWorld, createMatchWorld, initializeAugments, applyCommand, runTrainingRival, stepWorld, effectiveFleetCap, pickAugment, rerollAugments, chooseAiAugment, type AiMemory, type PlayerId, type RivalDifficulty, type TrainingMapId, type World } from '@impulso/sim';
import { viewFor, type MatchLobbyView } from '@impulso/state';

/** Diego's Espiral Estelar is the training map unless the creator asks for Sector 01. */
const DEFAULT_MAP: TrainingMapId = 'espiral';

export class TrainingRoom extends Room {
  protected auth!: AuthService;
  private accountIds=new Map<PlayerId,string>();
  private rewards=new Map<PlayerId,MatchReward>();
  /** Players whose reward is being saved; the view carries it once the store confirms. */
  private settling=new Set<PlayerId>();
  maxClients = 2;
  private world = createSectorWorld(DEFAULT_MAP);
  private seats = new Map<string, PlayerId>();
  private usedSeats = new Set<PlayerId>();
  private rates = new Map<string, { tick: number; count: number }>();
  private enemyMemory = new Map<string, AiMemory>();
  private difficulty: RivalDifficulty = 'medium';
  private timeScale = 1;
  private aiRival = true;
  private lobby=false;
  private deployed=false;
  private names=new Map<PlayerId,string>();
  private readyPlayers=new Set<PlayerId>();
  private map:TrainingMapId=DEFAULT_MAP;
  private offerKeys = new Map<string, string>();
  private chosenKeys = new Map<string, string>();
  /** Augments the creator won in earlier sectors of a run against the AI. */
  private carried: string[] = [];

  private reject(client: Client, reason: string): void {
    const messages: Record<string, string> = {
      blocked_destination: 'No puedo ir ahí.',
      unreachable_destination: 'No puedo llegar ahí.',
      target_not_visible: 'No puedo atacar un objetivo que no veo.',
      target_destroyed: 'Ese objetivo ya fue destruido.',
      friendly_target: 'No puedo hacer eso.',
      squad_destroyed: 'Esta nave ya no puede actuar.',
      rate_limit: 'No puedo hacer eso tan rápido.',
    };
    client.send('rejected', { reason, message: messages[reason] ?? 'No puedo hacer eso.' });
  }

  /** The room creator picks the map and the rival's difficulty; anything unexpected falls back to the defaults. */
  onCreate(options?: unknown) {
    const fields = typeof options === 'object' && options !== null ? options as { difficulty?: unknown; map?: unknown; duration?: unknown; opponent?:unknown; lobby?:unknown; testTimeScale?: unknown; testSeed?: unknown } : {};
    this.lobby=fields.lobby===true;
    this.aiRival=!this.lobby && fields.opponent!=='human';
    this.map=fields.map==='sector-01'||fields.map==='espiral-2'||fields.map==='trascendencia'?fields.map:DEFAULT_MAP;
    const carried = (options as { carried?: unknown } | undefined)?.carried;
    if (this.aiRival && Array.isArray(carried)) this.carried = [...new Set(carried.filter((id): id is string => typeof id === 'string'))].slice(0, 9);
    const requested = fields.difficulty;
    if (requested === 'easy' || requested === 'medium' || requested === 'hard') this.difficulty = requested;
    this.world = createMatchWorld(this.map, fields.duration === 'complete' ? 'complete' : 'skirmish', randomInt(0x100000000));
    if (process.env.GAME_TEST_MODE === '1' && process.env.NODE_ENV !== 'production') {
      if (Number.isSafeInteger(fields.testTimeScale) && Number(fields.testTimeScale) >= 1 && Number(fields.testTimeScale) <= 30) this.timeScale = Number(fields.testTimeScale);
      if (Number.isSafeInteger(fields.testSeed)) this.world.seed = Number(fields.testSeed) >>> 0;
      initializeAugments(this.world);
    }
    this.setPrivate(true);
    this.onMessage('ready',client=>{
      const player=this.seats.get(client.sessionId);if(!this.lobby||this.deployed||!player)return;
      this.readyPlayers.add(player);
      this.deployed=this.usedSeats.size===2 && this.readyPlayers.size===2;
      this.sendLobby();
    });
    this.onMessage('command', (client, command: unknown) => {
      const player = this.seats.get(client.sessionId);
      if (!player) return;
      if(this.lobby&&!this.deployed){this.reject(client,'waiting_for_players');return;}
      const bucket = this.rates.get(client.sessionId) ?? { tick: this.world.tick, count: 0 };
      if (this.world.tick - bucket.tick >= 10) { bucket.tick = this.world.tick; bucket.count = 0; }
      bucket.count += 1;
      this.rates.set(client.sessionId, bucket);
      if (bucket.count > effectiveFleetCap(this.world,player) + 8) { this.reject(client, 'rate_limit'); return; }
      const result = applyCommand(this.world, player, command);
      if (result.accepted) this.world = result.world;
      else { this.reject(client, result.reason); return; }
      const parsed = parseCommand(command);
      if (parsed.ok) client.send('ack', { seq: parsed.command.seq });
    });
    for (const message of ['augmentPick','augmentReroll'] as const) this.onMessage(message,(client,raw:unknown)=>{
      const player=this.seats.get(client.sessionId);
      if(!player || !raw || typeof raw!=='object' || Array.isArray(raw)) return;
      if(this.lobby&&!this.deployed){this.reject(client,'waiting_for_players');return;}
      const fields=raw as {choice?:unknown;id?:unknown};
      if(Object.keys(fields).some((key)=>!['choice','id'].includes(key))) {this.reject(client,'invalid_augment_pick');return;}
      const result=message==='augmentPick'?pickAugment(this.world,player,fields.choice,fields.id):rerollAugments(this.world,player,fields.choice);
      if(result.accepted) this.world=result.world;else this.reject(client,result.reason);
    });
    this.setSimulationInterval(() => {
      if(this.lobby&&!this.deployed){this.sendLobby();return;}
      for (let tick=0;tick<this.timeScale && this.world.winner===null;tick++) {
      if (!this.usedSeats.has('p2') && this.aiRival) {
        this.world=chooseAiAugment(this.world,'p2',this.difficulty);
        if ((!this.world.augmentMatch || this.world.augmentMatch.started) && this.world.tick%this.world.rules.tickRate===0) {
        const rival = runTrainingRival(this.world, this.enemyMemory, this.difficulty);
        this.enemyMemory = new Map(rival.memories);
        this.world = rival.world;
        }
      }
      this.world = stepWorld(this.world);
      }
      if(this.world.winner!==null)for(const player of ['p1','p2'] as const) {
        if(this.settling.has(player))continue;
        this.settling.add(player);
        const mode=rewardModeFor(player,this.aiRival,this.difficulty,{p1:this.holder('p1'),p2:this.holder('p2')});
        void trainingReward(this.auth,this.accountIds.get(player),this.roomId,this.world,player,mode).then(reward=>this.rewards.set(player,reward));
      }
      if(this.lobby)this.sendLobby();
      for (const client of this.clients) {
        const player = this.seats.get(client.sessionId);
        if (player) {
          const view=viewFor(this.world,player);
          client.send('view', {...view,reward:this.rewards.get(player)});
          const offer=view.augments?.offer;
          const key=offer?`${offer.choice}:${offer.rerolls}`:'';
          if(key && this.offerKeys.get(client.sessionId)!==key) client.send('augmentOffer',offer);
          this.offerKeys.set(client.sessionId,key);
          for(const owner of ['p1','p2'] as const) {
            const cards=this.world.augmentMatch?.players[owner].chosen ?? [];
            const seen=this.chosenKeys.get(`${client.sessionId}:${owner}`) ?? '';
            for(const id of cards.filter((id)=>!seen.split(',').includes(id))) client.send('augmentChosen',{playerId:owner,id});
            this.chosenKeys.set(`${client.sessionId}:${owner}`,cards.join(','));
          }
        }
      }
    }, 100);
    // Ephemeral development room. A full campaign/session lifecycle is planned.
    this.clock.setTimeout(() => { void this.disconnect(); }, 45 * 60 * 1000);
  }

  onJoin(client: Client, options?: {token?:unknown;name?:unknown}) {
    const player: PlayerId | undefined = !this.usedSeats.has('p1') ? 'p1' : !this.usedSeats.has('p2') ? 'p2' : undefined;
    if (!player) { void client.leave(4001); return; }
    const user=this.auth.getUser(options?.token);
    if(options?.token && !user)throw new ServerError(401,'authentication_required');
    if(player==='p2' && (this.world.augmentMatch?.players.p2.chosen.length ?? 0)>0)throw new ServerError(409,'match_already_started');
    if(user) {
      if([...this.accountIds.values()].includes(user.id))throw new ServerError(409,'already_in_room');
      this.accountIds.set(player,user.id);
      setAugmentPool(this.world,player,this.auth.profile(user.id).unlocked);
    }
    if(player==='p1' && this.carried.length) carryAugments(this.world,'p1',this.carried);
    this.usedSeats.add(player);
    this.seats.set(client.sessionId, player);
    this.names.set(player,typeof options?.name==='string'?options.name.trim().slice(0,24):'Comandante');
    if(!this.lobby)client.send('view', viewFor(this.world, player));
    this.sendLobby();
    if (this.usedSeats.size === 2) void this.lock();
  }

  onLeave(client: Client) {
    const player=this.seats.get(client.sessionId);
    if(this.lobby&&!this.deployed&&player){this.usedSeats.delete(player);this.readyPlayers.delete(player);this.names.delete(player);this.accountIds.delete(player);void this.unlock();}
    this.seats.delete(client.sessionId);
    this.rates.delete(client.sessionId);
    // Do not give a departed player's authority to a new stranger.
  }
  private holder(player:PlayerId):SeatHolder {
    return this.usedSeats.has(player) ? (this.accountIds.has(player)?'account':'guest') : null;
  }
  private sendLobby():void {
    if(!this.lobby)return;
    const seat=(p:PlayerId)=>this.usedSeats.has(p)?{name:this.names.get(p)??'Comandante',ready:this.readyPlayers.has(p)}:null;
    for(const client of this.clients){const playerId=this.seats.get(client.sessionId);if(!playerId)continue;
      const view:MatchLobbyView={roomId:this.roomId,phase:this.world.winner?'results':this.deployed?'sector':'lobby',playerId,map:this.map,duration:this.world.duration!,seats:{p1:seat('p1'),p2:seat('p2')}};
      client.send('matchLobby',view);
    }
  }
}
export type SeatHolder='account'|'guest'|null;
/** What scales a player's reward: the AI difficulty, 'pvp', or null when there is no real rival. */
export function rewardModeFor(player:PlayerId,aiRival:boolean,difficulty:RivalDifficulty,seats:Record<PlayerId,SeatHolder>):RivalDifficulty|'pvp'|null {
  const rival=seats[player==='p1'?'p2':'p1'];
  if(rival)return rival==='account'?'pvp':null;
  return player==='p1'&&aiRival?difficulty:null;
}
/** Guests save nothing; an account in a match without a real rival keeps its profile untouched. */
export async function trainingReward(auth:AuthService,accountId:string|undefined,matchId:string,world:World,player:PlayerId,mode:RivalDifficulty|'pvp'|null):Promise<MatchReward> {
  if(!accountId)return {xpGained:0,beforeXp:0,profile:profileFor(emptyProgress()),challenges:[],unlocked:[],guest:true};
  if(!mode){const profile=auth.profile(accountId);return {xpGained:0,beforeXp:profile.xp,profile,challenges:[],unlocked:[],practice:true};}
  return savedReward(auth,accountId,()=>auth.awardMatch(accountId,matchId,world,player,mode));
}
export function trainingRoomWith(auth:AuthService):typeof TrainingRoom {
  return class extends TrainingRoom {protected auth=auth;};
}
