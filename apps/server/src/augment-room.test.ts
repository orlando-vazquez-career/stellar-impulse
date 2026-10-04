import {afterAll,beforeAll,expect,it} from 'vitest';
import {Client,type Room} from '@colyseus/sdk';
import type {PlayerView} from '@impulso/state';
import {createMatchWorld} from '@impulso/sim';
import {AuthService} from './auth';
import {createGameServer} from './app';
const port=37000+Math.floor(Math.random()*900),url=`http://127.0.0.1:${port}`,auth=new AuthService();
const a=auth.register('aug-a@example.com','test-password'),b=auth.register('aug-b@example.com','test-password');
const world=createMatchWorld('sector-01','complete');world.winner='p1';world.matchRecord!.players.p1.combatLosses=1;
for(let i=0;i<3;i++)auth.awardMatch(a.user.id,`level-${i}`,world,'p1','medium');
const server=createGameServer({auth});
beforeAll(()=>server.listen(port,'127.0.0.1'));afterAll(()=>server.gracefullyShutdown(false));
function next<T>(room:Room,type:string,accept:(value:T)=>boolean=()=>true):Promise<T>{return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error(`Missing ${type}`)),5000);
  const off=room.onMessage(type,(value:T)=>{if(accept(value)){clearTimeout(timer);off();resolve(value);}});
});}
it('admits account pools, keeps offers private, validates rerolls and broadcasts choices to both humans',async()=>{
  const host=await new Client(url).create('training',{opponent:'human',token:a.token,map:'sector-01'});
  const guest=await new Client(url).joinById(host.roomId,{token:b.token});
  for(const r of [host,guest]){r.onMessage('augmentOffer',()=>{});r.onMessage('augmentChosen',()=>{});r.onMessage('view',()=>{});}
  try{
    const v=await next<PlayerView>(host,'view');expect(v.tick).toBe(0);expect(v.augments!.started).toBe(false);
    const gv=await next<PlayerView>(guest,'view');expect(gv.augments!.offer!.cards.every(c=>c.id!=='s-contratos')).toBe(true);
    const invalid=next<{reason:string}>(host,'rejected');host.send('augmentPick',{choice:0,id:'p-asalto'});expect((await invalid).reason).toBe('invalid_augment_pick');
    const offer=next<NonNullable<PlayerView['augments']>['offer']>(host,'augmentOffer',value=>value?.rerolls===1);
    host.send('augmentReroll',{choice:0});const renewed=(await offer)!;
    const rejected=next<{reason:string}>(host,'rejected');host.send('augmentReroll',{choice:0});expect((await rejected).reason).toBe('augment_reroll_used_or_expired');
    const reveal=next<{playerId:string;id:string}>(guest,'augmentChosen',value=>value.playerId==='p1');
    host.send('augmentPick',{choice:0,id:renewed.cards[0]!.id});expect((await reveal).id).toBe(renewed.cards[0]!.id);
    const running=next<PlayerView>(host,'view',value=>!!value.augments?.started);
    guest.send('augmentPick',{choice:0,id:gv.augments!.offer!.cards[0]!.id});
    expect((await running).augments!.rival).toHaveLength(1);
    expect(auth.profile(a.user.id).xp).toBe(375);
  }finally{await host.leave();await guest.leave();}
});
