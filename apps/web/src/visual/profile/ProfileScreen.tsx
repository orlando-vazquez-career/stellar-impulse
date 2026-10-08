import { useEffect, useState } from 'react';
import { AUGMENT_CATALOG, CHALLENGES, INITIAL_AUGMENTS, type ProgressProfile } from '@impulso/sim';
import { sessionToken } from '../../auth/client';
import { useI18n } from '../i18n';
import { Brand } from '../shared/Brand';
import { AugmentCard } from '../game/AugmentHud';
import './profile.css';
const guest:ProgressProfile={xp:0,level:1,levelXp:0,nextLevelXp:300,completed:[],best:{},unlocked:[...INITIAL_AUGMENTS],merits:[]};
export function ProfileScreen({onBack}:{onBack():void}) {
  const {locale}=useI18n(),es=locale==='es';
  const [profile,setProfile]=useState<ProgressProfile|null>(sessionToken()?null:guest),[error,setError]=useState(false);
  useEffect(()=>{
    const token=sessionToken();if(!token)return;
    const abort=new AbortController();
    void fetch(`${(import.meta.env.VITE_SERVER_URL||'http://127.0.0.1:2567').replace(/\/$/,'')}/auth/profile`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:abort.signal})
      .then(async r=>{if(!r.ok)throw Error('profile');return r.json() as Promise<ProgressProfile>;}).then(setProfile)
      .catch(()=>{if(!abort.signal.aborted)setError(true);});
    return()=>abort.abort();
  },[]);
  return <main className="vi-profile vi-screen">
    <header className="vi-screen__header"><Brand/><button className="vi-text-button" onClick={onBack}>{es?'Volver':'Back'}</button></header>
    <section className="profile-summary"><span>{es?'EXPEDIENTE DEL COMANDANTE':'COMMANDER RECORD'}</span><h1>{es?'Tu próxima configuración empieza aquí.':'Your next build starts here.'}</h1>
      {error?<p role="alert">{es?'No se pudo cargar tu progreso. Vuelve a intentarlo.':'Unable to load your progress. Please try again.'}</p>:!profile?<p role="status">{es?'Cargando progreso…':'Loading progress…'}</p>:<>
        <div className="profile-level"><strong>{es?'Nivel':'Level'} {profile.level}</strong><span>{profile.levelXp} / 300 XP · {profile.xp} {es?'acumulada':'total'}</span></div>
        <progress aria-label={es?'Progreso de nivel':'Level progress'} value={profile.levelXp} max={300}/>
        <p>{sessionToken()?(es?'Desbloquea más opciones para tu próxima partida.':'Unlock more choices for your next match.'):(es?'Como invitado tienes las 30 cartas iniciales. Inicia sesión para guardar XP y desbloquear variedad.':'Guests use the 30 starting cards. Sign in to save XP and unlock variety.')}</p>
      </>}
    </section>
    {profile&&<>
      <section className="profile-challenges"><h2>{es?'Desafíos':'Challenges'}</h2><div>{CHALLENGES.map(c=><article key={c.id} className={profile.completed.includes(c.id)?'is-complete':''}><strong>{c.name[locale]} {profile.completed.includes(c.id)?'✓':''}</strong><p>{c.condition[locale]}</p><span>{profile.best[c.id]??0}/{c.target} · +50 XP</span><progress value={profile.best[c.id]??0} max={c.target}/></article>)}</div></section>
      <section className="profile-catalog"><h2>{es?'Catálogo de aumentos':'Augment catalog'} <small>{profile.unlocked.length}/{AUGMENT_CATALOG.length}</small></h2><div>{AUGMENT_CATALOG.map(card=>{
        const unlocked=profile.unlocked.includes(card.id),unlock=card.unlock;
        const condition=unlock==='initial'?(es?'Inicial':'Starting'):'level' in unlock?`${es?'Nivel':'Level'} ${unlock.level}`:CHALLENGES.find(c=>c.id===unlock.challenge)!.name[locale];
        return <article key={card.id} className={unlocked?'':'is-locked'}><AugmentCard card={card} disabled={!unlocked}/><span>{unlocked?(es?'Disponible':'Available'):`${es?'Desbloquea':'Unlock'}: ${condition}`}</span></article>;
      })}</div></section>
    </>}
  </main>;
}
