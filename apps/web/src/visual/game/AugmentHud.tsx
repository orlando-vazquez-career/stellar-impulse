import { useEffect, useRef, useState } from 'react';
import type { AugmentCardView } from '@impulso/state';
import { useI18n } from '../i18n';
import type { GameplayPresentationAdapter, GameplayViewModel } from './model';
import { AudioChannelBus, channelVolume, getAudioMix } from '../audio-mix';
import './augments.css';
export function AugmentCard({ card, disabled, onPick }: {card:AugmentCardView;disabled?:boolean;onPick?():void}) {
  const {locale}=useI18n();const text=card.text[locale];
  return <button className={`augment-card augment-card--${card.tier}`} disabled={disabled} onClick={onPick} aria-label={text.name}>
    <span className="augment-card__orbit" aria-hidden="true"><i>{card.icon}</i></span>
    <span className="augment-card__name">{text.name}</span>
    <span className="augment-card__advantage">{text.advantage}</span>
    {text.disadvantage && <span className="augment-card__disadvantage">{text.disadvantage}</span>}
  </button>;
}
const time=(seconds:number)=>`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
export function AugmentHud({view,adapter,sound=true}:{view:GameplayViewModel;adapter:GameplayPresentationAdapter;sound?:boolean}) {
  const {locale}=useI18n();const es=locale==='es';
  const [expanded,setExpanded]=useState(false), sounded=useRef('');
  const augments=view.augments, offer=augments?.offer;
  useEffect(()=>{
    const key=offer?`${offer.choice}`:'';
    if(!offer || offer.choice===0 || sounded.current===key) return;
    sounded.current=key;
    const volume=channelVolume(getAudioMix(),'effects');
    if(!sound||volume<=0) return;
    const audio=new AudioContext(), bus=new AudioChannelBus(audio), oscillator=audio.createOscillator(),gain=audio.createGain();
    oscillator.type='sine';oscillator.frequency.setValueAtTime(660,audio.currentTime);oscillator.frequency.exponentialRampToValueAtTime(990,audio.currentTime+0.3);
    gain.gain.setValueAtTime(0.08,audio.currentTime);gain.gain.exponentialRampToValueAtTime(0.001,audio.currentTime+0.5);
    oscillator.connect(gain);gain.connect(bus.channel('effects'));oscillator.start();oscillator.stop(audio.currentTime+0.5);
    oscillator.onended=()=>{bus.dispose();void audio.close();};
  },[offer?.choice,sound]);
  if(!augments) return null;
  const opening=!augments.started;
  const upcoming=augments.nextChoiceTick===null ? es?'Configuración completa':'Build complete'
    : `${augments.own.length<2?(es?'Oro':'Gold'):(es?'Prismático':'Prismatic')} ${es?'en':'in'} ${time(Math.max(0,Math.ceil(augments.nextChoiceTick/10-view.elapsedSeconds)))}`;
  const row=(cards:AugmentCardView[],rival:boolean)=><div className="augment-strip__row"><b>{rival?(es?'Rival':'Opponent'):(es?'Tu flota':'Your fleet')}</b>
    {cards.map((card)=><span key={card.id} className={`augment-badge augment-badge--${card.tier}`} tabIndex={0} title={`${card.text[locale].name}: ${card.text[locale].advantage} ${card.text[locale].disadvantage??''}`} aria-label={card.text[locale].name}>{card.icon}</span>)}
    {!rival && cards.length<3 && <span className="augment-upcoming">{upcoming}</span>}
  </div>;
  return <>
    <aside className="augment-strip" aria-label={es?'Aumentos elegidos':'Chosen augments'}>{row(augments.own,false)}{row(augments.rival,true)}</aside>
    {offer && <section className={opening?'augment-opening':`augment-side ${expanded?'is-expanded':''}`} role="dialog" aria-modal={opening} aria-label={es?'Elección de aumento':'Augment choice'}>
      <div className={`augment-offer augment-offer--${offer.tier}`}>
        <header><div><span>{es?'SEÑAL DE MEJORA':'UPGRADE SIGNAL'} · {offer.choice+1}/3</span><h2>{es?'Elige tu aumento':'Choose your augment'}</h2></div>
          <strong className="augment-timer" aria-label={es?'Tiempo restante':'Time remaining'}>{time(offer.remainingSeconds)}</strong></header>
        <p>{opening?(es?'Tu rival también está eligiendo. La partida comienza cuando ambos estén listos.':'Your rival is choosing too. The match starts when both are ready.'):(es?'La batalla continúa. Elige antes de que termine el tiempo.':'The battle continues. Pick before time runs out.')}</p>
        <div className="augment-cards">{offer.cards.map((card)=><AugmentCard key={card.id} card={card} onPick={()=>adapter.dispatch({type:'augment-pick',choice:offer.choice,id:card.id})}/>)}</div>
        <footer><span>{es?'GRATIS · SIN COSTO DE METAL':'FREE · NO METAL COST'}</span><button disabled={offer.rerolls>=(offer.rerollLimit??1)} onClick={()=>adapter.dispatch({type:'augment-reroll',choice:offer.choice})}>{es?'Renovar cartas':'Reroll cards'} · {Math.max(0,(offer.rerollLimit??1)-offer.rerolls)}</button>
          {!opening && <button onClick={()=>setExpanded(!expanded)}>{expanded?(es?'Reducir':'Collapse'):(es?'Ampliar':'Expand')}</button>}</footer>
      </div>
    </section>}
    {opening && !offer && <div className="augment-opening"><div className="augment-wait" role="status">{es?'Aumento confirmado. Esperando al rival…':'Augment confirmed. Waiting for the opponent…'}</div></div>}
  </>;
}
