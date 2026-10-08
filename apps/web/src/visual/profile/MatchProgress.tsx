import { AUGMENTS_BY_ID, CHALLENGES, type MatchReward } from '@impulso/sim';
import { useI18n } from '../i18n';
import { AugmentCard } from '../game/AugmentHud';
import './profile.css';
export function MatchProgress({reward}:{reward:MatchReward}) {
  const {locale}=useI18n(),es=locale==='es';
  return <section className="match-progress" aria-label={es?'Progreso de partida':'Match progression'}>
    {reward.guest?<p>{es?'Inicia sesión para guardar XP y desbloquear aumentos.':'Sign in to save XP and unlock augments.'}</p>
    :reward.practice?<p>{es?'Partida sin rival: no suma XP ni desafíos.':'No rival in this match: no XP or challenges saved.'}</p>:<>
      <strong>+{reward.xpGained} XP</strong><small>{es?'Nivel':'Level'} {reward.profile.level} · {reward.profile.levelXp}/300 XP</small>
      <progress aria-label={es?'Progreso de nivel':'Level progress'} value={reward.profile.levelXp} max={300}/>
      {reward.profile.level>1+Math.floor(reward.beforeXp/300)&&<p>{es?'¡Subiste de nivel!':'Level up!'}</p>}
      {!!reward.challenges.length&&<ul>{reward.challenges.map(id=><li key={id}>{CHALLENGES.find(c=>c.id===id)!.name[locale]} · +50 XP</li>)}</ul>}
      {!!reward.unlocked.length&&<><h3>{es?'¡Nuevo aumento desbloqueado!':'New augment unlocked!'}</h3><div className="match-unlocks">{reward.unlocked.map(id=><AugmentCard key={id} card={AUGMENTS_BY_ID.get(id)!}/>)}</div></>}
    </>}
  </section>;
}
