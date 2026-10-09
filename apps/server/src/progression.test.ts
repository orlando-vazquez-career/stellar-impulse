import {expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {readFileSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {createMatchWorld} from '@impulso/sim';
import {AuthService} from './auth';
it('persists XP, unlocks and result idempotency across account/server restarts', async () => {
  const file=join(process.cwd(),'.local',`progress-${randomUUID()}.json`);
  try{
    const auth=new AuthService(file),user=(await auth.register('progress@example.com','password-123')).user;
    const world=createMatchWorld();world.winner='p1';world.matchRecord!.players.p1.kills=15;
    const first=(await auth.awardMatch(user.id,'official-match',world,'p1','medium'));
    expect(first.challenges).toContain('scrapper');expect(auth.profile(user.id).unlocked).toContain('p-reciclaje');
    const restarted=new AuthService(file);const token=restarted.login('progress@example.com','password-123').token;
    expect(restarted.profile(user.id)).toEqual(first.profile);
    expect((await restarted.awardMatch(user.id,'official-match',world,'p1','medium'))).toEqual(first);
    expect(restarted.profile(user.id).xp).toBe(first.profile.xp);
    const stored=readFileSync(file,'utf8');expect(stored).not.toContain(token);expect(stored).not.toContain('password-123');
  }finally{unlinkSync(file);}
});
