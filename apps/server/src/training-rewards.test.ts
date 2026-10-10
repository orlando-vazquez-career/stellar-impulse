import {expect,it} from 'vitest';
import {createMatchWorld} from '@impulso/sim';
import {AuthService} from './auth';
import {rewardModeFor,trainingReward,type SeatHolder} from './training-room';

type Row=[string,'p1'|'p2',boolean,Record<'p1'|'p2',SeatHolder>,'hard'|'pvp'|null];
const rows:Row[]=[
  ['solo account against the AI keeps the chosen difficulty','p1',true,{p1:'account',p2:null},'hard'],
  ['no AI and an empty rival seat is practice, not a Hard win','p1',false,{p1:'account',p2:null},null],
  ['two accounts face each other','p1',false,{p1:'account',p2:'account'},'pvp'],
  ['the second account is measured against the first','p2',false,{p1:'account',p2:'account'},'pvp'],
  ['a guest rival cannot pay out account rewards','p1',false,{p1:'account',p2:'guest'},null],
  ['a guest that took the AI seat cannot either','p1',true,{p1:'account',p2:'guest'},null],
  ['an account facing a guest host gets nothing','p2',false,{p1:'guest',p2:'account'},null],
];
it.each(rows)('%s',(_name,player,aiRival,seats,expected)=>{
  expect(rewardModeFor(player,aiRival,'hard',seats)).toBe(expected);
});

it('records nothing for a practice win and tells the account why', async () => {
  const auth=new AuthService(),user=(await auth.register('practice@example.com','Secret-1234')).user;
  const world=createMatchWorld('sector-01','complete');world.winner='p1';
  const reward=(await trainingReward(auth,user.id,'practice-room',world,'p1',null));
  expect(reward).toMatchObject({xpGained:0,challenges:[],unlocked:[],practice:true});
  expect(reward.guest).toBeUndefined();
  expect(auth.profile(user.id).xp).toBe(0);
  expect(auth.profile(user.id).completed).toEqual([]);
});

it('still pays a real win against the AI and marks guests as guests', async () => {
  const auth=new AuthService(),user=(await auth.register('rated@example.com','Secret-1234')).user;
  const world=createMatchWorld('sector-01','complete');world.winner='p1';
  // Win 100 + core 25, no nodes, factor 1 on a complete match; "elite-veteran" and "untouchable" add 50 each.
  expect((await trainingReward(auth,user.id,'rated-room',world,'p1','hard')).xpGained).toBe(225);
  expect((await trainingReward(auth,undefined,'rated-room',world,'p2','hard'))).toMatchObject({xpGained:0,guest:true});
});
