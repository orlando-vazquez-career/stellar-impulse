import { describe,expect,it } from 'vitest';
import { applyCommand,createMatchWorld,createSquad,emptyProgress,emptyMatchRecord,profileFor,rewardForCampaign,rewardForMatch,stepWorld,unlockedPool,CHALLENGES,type RivalDifficulty } from './index.js';
function finished(){const w=createMatchWorld('sector-01','complete',42);w.winner='p1';w.squads=[];w.matchRecord!.players.p1.combatLosses=1;return w;}
describe('account progression',()=>{
  it.each([['medium','complete',100],['hard','complete',100],['easy','complete',25],['medium','skirmish',60],['easy','skirmish',15]] as const)('scales official loss XP in %s/%s', (difficulty,mode,winningBase)=>{
    const w=finished();w.duration=mode;
    const award=rewardForMatch(emptyProgress(),'loss',w,'p2',difficulty).reward;
    expect(award.xpGained).toBe(Math.floor(40*(difficulty==='easy'?0.25:1)*(mode==='skirmish'?0.6:1)));
    const winner=rewardForMatch(emptyProgress(),'win',w,'p1',difficulty).reward;
    expect(winner.xpGained).toBe(Math.floor((100+25)*(difficulty==='easy'?0.25:1)*(mode==='skirmish'?0.6:1))+(difficulty==='hard'?50:0));
    expect(winningBase).toBeGreaterThan(0);
  });
  it('caps capture XP at five nodes, adds the core and grants fixed challenge bonuses once',()=>{
    const w=finished();w.matchRecord!.players.p1.nodes=9;w.matchRecord!.players.p1.kills=15;
    const first=rewardForMatch(emptyProgress(),'a',w,'p1','medium');expect(first.reward.xpGained).toBe(225);
    const repeated=rewardForMatch(first.progress,'a',w,'p1','medium');expect(repeated.progress).toBe(first.progress);expect(repeated.reward).toEqual(first.reward);
    const second=rewardForMatch(first.progress,'b',w,'p1','medium');expect(second.reward.xpGained).toBe(175);expect(second.reward.challenges).toEqual([]);
  });
  it('awards all level unlocks exactly at each 300-XP boundary and leaves guests initial-only',()=>{
    expect(unlockedPool(null)).toHaveLength(30);
    const ids=['s-contratos','g-sensores','s-cartografia','p-guerra','s-mamparos','g-chatarra','p-relampago'];
    ids.forEach((id,i)=>{
      const p=emptyProgress();p.xp=(i+1)*300-1;expect(unlockedPool(p)).not.toContain(id);
      p.xp++;expect(unlockedPool(p)).toContain(id);expect(profileFor(p).level).toBe(i+2);
    });
  });
  it.each(CHALLENGES.map(c=>c.id))('%s uses official match records and unlocks once',id=>{
    const w=finished(),p=w.matchRecord!.players.p1;
    switch(id){case'double-impact':p.bestSplash=2;break;case'ace':p.killsByShip.a=5;break;case'scrapper':p.kills=15;break;case'full-armada':p.fullFleet=true;break;case'untouchable':p.combatLosses=0;break;case'steel-wall':w.squads=[...Array.from({length:3},(_,i)=>createSquad(`f${i}`,'p1','frigate',{x:i,y:0},w)),...Array.from({length:2},(_,i)=>createSquad(`b${i}`,'p1','bomber',{x:i,y:1},w))];break;}
    const difficulty:RivalDifficulty=id==='elite-veteran'?'hard':'medium';
    const result=rewardForMatch(emptyProgress(),id,w,'p1',difficulty);
    expect(result.reward.challenges).toContain(id);expect(result.reward.unlocked).toHaveLength(1);
    expect(rewardForMatch(result.progress,`${id}-again`,w,'p1',difficulty).reward.challenges).toEqual([]);
    expect(rewardForMatch(emptyProgress(),`${id}-easy`,w,'p1','easy').reward.challenges).toEqual([]);
  });
  it('stores the best per-match progress without summing kills from different matches',()=>{
    const w=finished();w.matchRecord!.players.p1.kills=9;
    const a=rewardForMatch(emptyProgress(),'a',w,'p1','medium');expect(a.reward.profile.best.scrapper).toBe(9);expect(a.reward.challenges).toEqual([]);
    w.matchRecord!.players.p1.kills=8;
    expect(rewardForMatch(a.progress,'b',w,'p1','medium').reward.profile.best.scrapper).toBe(9);
  });
  it('observes simultaneous Bomber deaths and prevents retirement from earning Intocable',()=>{
    let w=createMatchWorld('sector-01');w.augmentMatch=undefined;w.guardians=[];w.nodes=[];w.economy=false;w.surface=null;
    w.squads=[createSquad('b','p1','bomber',{x:10,y:10},w),createSquad('a','p2','frigate',{x:12,y:10},w),createSquad('c','p2','frigate',{x:12,y:11},w)];
    w.squads[1]!.hp=w.squads[2]!.hp=10;w.tick=29;w=stepWorld(w);
    expect(w.matchRecord!.players.p1).toMatchObject({kills:2,bestSplash:2,killsByShip:{b:2}});
    const retired=applyCommand(w,'p1',{seq:1,type:'disband',squadIds:['b']}).world;
    expect(retired.matchRecord!.players.p1.combatLosses).toBe(1);expect(w.matchRecord!.players.p1.combatLosses).toBe(0);
  });
  it('requires a terminal authoritative result',()=>expect(()=>rewardForMatch(emptyProgress(),'x',createMatchWorld(),'p1','medium')).toThrow('official result'));
});
describe('campaign progression',()=>{
  // [name, outcome, completed sectors, player, expected XP]
  const rows=[
    ['core winner',{winner:'p1',reason:'core'},3,'p1',125],
    ['core loser',{winner:'p1',reason:'core'},3,'p2',40],
    ['draw on the final core',{winner:null,reason:'draw'},3,'p2',40],
    ['forfeit after a played sector',{winner:'p2',reason:'forfeit'},1,'p2',40],
    ['instant forfeit pays nothing',{winner:'p2',reason:'forfeit'},0,'p2',0],
    ['the player who left',{winner:'p2',reason:'forfeit'},2,'p1',0],
    ['annulled campaign',{winner:null,reason:'annulled'},2,'p1',0],
  ] as const;
  it.each(rows)('%s',(_name,outcome,sectors,player,xp)=>{
    const result=rewardForCampaign(emptyProgress(),'campaign:ROOM',outcome,sectors,player);
    expect(result.reward.xpGained).toBe(xp);
    expect(result.progress.xp).toBe(xp);
    expect(result.reward.challenges).toEqual([]);
  });
  it('pays a campaign once even if the result is reported again',()=>{
    const first=rewardForCampaign(emptyProgress(),'campaign:ROOM',{winner:'p1',reason:'core'},3,'p1');
    const again=rewardForCampaign(first.progress,'campaign:ROOM',{winner:'p1',reason:'core'},3,'p1');
    expect(again.progress.xp).toBe(125);
    expect(again.reward).toEqual(first.reward);
  });
});
describe('stored awards',()=>{
  it('keeps a compact record per match instead of a profile snapshot',()=>{
    const {progress}=rewardForCampaign(emptyProgress(),'campaign:ROOM',{winner:'p1',reason:'core'},3,'p1');
    expect(progress.awards['campaign:ROOM']).toEqual({xpGained:125,beforeXp:0,challenges:[],unlocked:[]});
  });
  it('stores training results the same way',()=>{
    const {progress}=rewardForMatch(emptyProgress(),'room',finished(),'p1','medium');
    expect(Object.keys(progress.awards.room!).sort()).toEqual(['beforeXp','challenges','unlocked','xpGained']);
  });
  it('still answers a repeated result with the full reward',()=>{
    const first=rewardForCampaign(emptyProgress(),'campaign:ROOM',{winner:'p1',reason:'core'},3,'p1');
    const again=rewardForCampaign(first.progress,'campaign:ROOM',{winner:'p1',reason:'core'},3,'p1');
    expect(again.reward.profile.xp).toBe(125);
    expect(again.reward.profile.level).toBe(1);
  });
  it('remembers only the latest 100 results',()=>{
    let progress=emptyProgress();
    for(let i=0;i<105;i++)progress=rewardForCampaign(progress,`campaign:${i}`,{winner:null,reason:'draw'},3,'p1').progress;
    const keys=Object.keys(progress.awards);
    expect(keys).toHaveLength(100);
    expect(keys).not.toContain('campaign:4');
    expect(keys).toContain('campaign:5');
    expect(keys).toContain('campaign:104');
    expect(progress.xp).toBe(105*40);
  });
});
