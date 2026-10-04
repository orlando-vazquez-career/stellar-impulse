import type { UnitKind } from '../index.js';
import type { StatKey } from '../stats.js';
export type AugmentTier = 'silver' | 'gold' | 'prismatic';
export type ChallengeId = 'double-impact' | 'elite-veteran' | 'steel-wall' | 'ace' | 'untouchable' | 'scrapper' | 'full-armada';
export type Effect =
  | { hook: 'stat'; stat: StatKey; value: number; operation: 'add' | 'set' | 'multiply'; kind?: UnitKind }
  | { hook: 'pick-metal'; amount: number }
  | { hook: 'next-builds'; count: number; factor: number }
  | { hook: 'repair'; rate: number; radius: number }
  | { hook: 'capture-bounty'; amount: number; count: number }
  | { hook: 'cartography' }
  | { hook: 'node-income'; amount?: number; interval?: number; factor?: number }
  | { hook: 'counter-bonus'; kind: UnitKind; against: UnitKind; amount: number }
  | { hook: 'armor'; kind?: UnitKind; nearKind?: UnitKind; radius: number; amount: number; origin?: 'base' | 'core' }
  | { hook: 'field-repair'; idleTicks: number; rate: number }
  | { hook: 'sensors'; baseBonus: number; nodeRadius: number }
  | { hook: 'kill-income' | 'loss-income'; factor: number }
  | { hook: 'spawn'; kind: UnitKind; interval: number; decoy?: boolean; lifetime?: number }
  | { hook: 'veteran'; kills: number; hp: number; damage: number }
  | { hook: 'base-income'; factor: number; duration?: number }
  | { hook: 'base-damage'; levels: number }
  | { hook: 'fleet'; amount?: number; set?: number }
  | { hook: 'capture'; factor: number; coreOnly?: boolean }
  | { hook: 'camouflage'; idleTicks: number }
  | { hook: 'no-base-repair' }
  | { hook: 'no-production'; kind: UnitKind };
export interface Augment {
  id: string; tier: AugmentTier; tags: readonly string[];
  unlock: 'initial' | { level: number } | { challenge: ChallengeId };
  icon: string; weight: number;
  text: { es: { name: string; advantage: string; disadvantage?: string }; en: { name: string; advantage: string; disadvantage?: string } };
  effects: readonly Effect[];
}
function card(id: string, tier: AugmentTier, name: string, enName: string, advantage: string, enAdvantage: string,
  effects: Effect[], unlock: Augment['unlock'] = 'initial', tags: string[] = [], disadvantage?: string, enDisadvantage?: string): Augment {
  const icons: Record<string, string> = { reservas:'▣',optica:'◎',blindaje:'⬟',hangar:'↟',exploradores:'⌖',nanorep:'✚',contratos:'⚒',cartografia:'⌘',mamparos:'▥',espoletas:'✳',mineria:'⛏',cazadores:'➶',linea:'▤',campo:'✜',serie:'≋',sensores:'◉',chatarra:'♻',senuelos:'◌',escolta:'⬠',veteranos:'★',asalto:'➤',enjambre:'⠿',fortaleza:'♜',artilleria:'✹',todo:'⚡',guerra:'⚒',relampago:'ϟ',camuflaje:'◐',reciclaje:'↻',mercenarios:'⚔',aceleradores:'»',refuerzos:'▰',mantenimiento:'⚙',carga:'⊕',impulso:'⇈',corazas:'⬢',calibracion:'⊙',tripulacion:'✥',logistica:'⇄',titanes:'◆',sobrecarga:'✴',expansion:'⤢',dominio:'⚑',escuadra:'❖' };
  return { id, tier, unlock, tags, icon: icons[id.slice(2)] ?? '✦', weight: 1, effects,
    text: { es: { name, advantage, disadvantage }, en: { name: enName, advantage: enAdvantage, disadvantage: enDisadvantage } } };
}
export const AUGMENT_CATALOG: readonly Augment[] = [
  card('s-reservas','silver','Reservas de emergencia','Emergency reserves','+8 Metal al elegirlo.','Gain 8 Metal now.',[{hook:'pick-metal',amount:8}]),
  card('s-optica','silver','Óptica de largo alcance','Long-range optics','+1 de visión a todas tus naves.','All ships gain 1 vision.',[{hook:'stat',stat:'vision',operation:'add',value:1}]),
  card('s-blindaje','silver','Blindaje reactivo','Reactive armor','Interceptores +1 de armadura.','Interceptors gain 1 armor.',[{hook:'stat',kind:'interceptor',stat:'armor',operation:'add',value:1}]),
  card('s-hangar','silver','Hangar caliente','Hot hangar','Tus próximas 2 naves se construyen al doble de velocidad.','Your next 2 ships build twice as fast.',[{hook:'next-builds',count:2,factor:0.5}]),
  card('s-exploradores','silver','Programa de reconocimiento','Recon program','Exploradores cuestan 3 Metal y ganan 0,5 c/s.','Explorers cost 3 Metal and gain 0.5 cells/s.',[{hook:'stat',kind:'explorer',stat:'cost',operation:'set',value:3},{hook:'stat',kind:'explorer',stat:'speed',operation:'add',value:0.5}]),
  card('s-nanorep','silver','Nanorreparadores','Nanorepair','Reparación en base: 3 de vida/s, radio 3.','Base repair: 3 health/s, radius 3.',[{hook:'repair',rate:3,radius:3}]),
  card('s-aceleradores','silver','Aceleradores de maniobra','Maneuver thrusters','Interceptores +0,2 c/s.','Interceptors gain 0.2 cells/s.',[{hook:'stat',kind:'interceptor',stat:'speed',operation:'add',value:0.2}]),
  card('s-refuerzos','silver','Refuerzos de fuselaje','Hull bracing','Bombarderos +15 de vida máxima.','Bombers gain 15 maximum health.',[{hook:'stat',kind:'bomber',stat:'maxHp',operation:'add',value:15}]),
  card('s-mantenimiento','silver','Mantenimiento preventivo','Preventive maintenance','Todas tus naves se construyen en 90 % del tiempo.','All ships build in 90% of the usual time.',[{hook:'stat',stat:'buildTicks',operation:'multiply',value:0.9}]),
  card('s-carga','silver','Carga concentrada','Focused charge','Fragatas +1 de daño.','Frigates gain 1 damage.',[{hook:'stat',kind:'frigate',stat:'damage',operation:'add',value:1}]),
  card('s-contratos','silver','Contratos mineros','Mining contracts','Tu próximo nodo capturado da +6 Metal.','Your next captured node grants 6 Metal.',[{hook:'capture-bounty',amount:6,count:1}],{level:2}),
  card('s-cartografia','silver','Cartografía','Cartography','Marcadores fijos de todos los nodos y guardianes.','Fixed markers reveal all node and guardian positions.',[{hook:'cartography'}],{level:4}),
  card('s-mamparos','silver','Mamparos','Bulkheads','Fragatas +25 de vida máxima.','Frigates gain 25 maximum health.',[{hook:'stat',kind:'frigate',stat:'maxHp',operation:'add',value:25}],{level:6}),
  card('s-espoletas','silver','Espoletas de proximidad','Proximity fuses','El daño de área del Bombardero pasa de 50 % a 65 %.','Bomber splash damage rises from 50% to 65%.',[{hook:'stat',kind:'bomber',stat:'splashFactor',operation:'set',value:0.65}],{challenge:'double-impact'}),
  card('g-mineria','gold','Minería profunda','Deep mining','Cada nodo propio da +1 Metal cada 4 s.','Each owned node grants 1 extra Metal every 4 s.',[{hook:'node-income',amount:1,interval:40}]),
  card('g-cazadores','gold','Escuadrón de caza','Hunter squadron','Interceptores +2 de daño contra Bombarderos y +0,3 c/s.','Interceptors gain 2 damage against Bombers and 0.3 cells/s.',[{hook:'counter-bonus',kind:'interceptor',against:'bomber',amount:2},{hook:'stat',kind:'interceptor',stat:'speed',operation:'add',value:0.3}]),
  card('g-linea','gold','Línea de batalla','Battle line','Fragatas cerca de otra Fragata aliada (radio 2): +2 de armadura.','Frigates within 2 cells of another allied Frigate gain 2 armor.',[{hook:'armor',kind:'frigate',nearKind:'frigate',radius:2,amount:2}]),
  card('g-campo','gold','Reparación de campo','Field repair','Tras 5 s sin atacar ni recibir daño: +2 de vida/s.','After 5 s without attacking or taking damage: recover 2 health/s.',[{hook:'field-repair',idleTicks:50,rate:2}]),
  card('g-serie','gold','Producción en serie','Mass production','Todas tus naves cuestan 1 Metal menos (mínimo 3).','All ships cost 1 less Metal (minimum 3).',[{hook:'stat',stat:'cost',operation:'add',value:-1}],'initial',['cost']),
  card('g-impulso','gold','Impulso coordinado','Coordinated thrust','Todas tus naves +0,2 c/s.','All ships gain 0.2 cells/s.',[{hook:'stat',stat:'speed',operation:'add',value:0.2}]),
  card('g-corazas','gold','Corazas laminadas','Layered armor','Todas tus naves +1 de armadura.','All ships gain 1 armor.',[{hook:'stat',stat:'armor',operation:'add',value:1}]),
  card('g-calibracion','gold','Calibración de asedio','Siege calibration','Bombarderos +6 de daño.','Bombers gain 6 damage.',[{hook:'stat',kind:'bomber',stat:'damage',operation:'add',value:6}]),
  card('g-tripulacion','gold','Tripulación de reserva','Reserve crews','Fragatas +40 de vida; Interceptores +15 de vida.','Frigates gain 40 health; Interceptors gain 15 health.',[{hook:'stat',kind:'frigate',stat:'maxHp',operation:'add',value:40},{hook:'stat',kind:'interceptor',stat:'maxHp',operation:'add',value:15}]),
  card('g-logistica','gold','Logística orbital','Orbital logistics','Flota máxima +2. Construcción en 85 % del tiempo.','Fleet limit gains 2. Ships build in 85% of the usual time.',[{hook:'fleet',amount:2},{hook:'stat',stat:'buildTicks',operation:'multiply',value:0.85}]),
  card('g-sensores','gold','Red de sensores','Sensor network','Base +4 de visión; nodos propios dan visión de radio 3.','Base gains 4 vision; owned nodes reveal a radius of 3.',[{hook:'sensors',baseBonus:4,nodeRadius:3}],{level:3}),
  card('g-chatarra','gold','Recuperación de chatarra','Salvage','Destruir una nave enemiga da 30 % de su costo, redondeado abajo.','Enemy ship kills grant 30% of its cost, rounded down.',[{hook:'kill-income',factor:0.3}],{level:7}),
  card('g-senuelos','gold','Señuelos','Decoys','Ahora y cada 90 s: señuelo de Bombardero, 30 de vida, dura 60 s.','Now and every 90 s: a 30-health Bomber decoy lasting 60 s.',[{hook:'spawn',kind:'bomber',interval:900,decoy:true,lifetime:600}],{challenge:'elite-veteran'}),
  card('g-escolta','gold','Escolta de asedio','Siege escort','Bombarderos cerca de una Fragata aliada (radio 2): +3 de armadura.','Bombers within 2 cells of an allied Frigate gain 3 armor.',[{hook:'armor',kind:'bomber',nearKind:'frigate',radius:2,amount:3}],{challenge:'steel-wall'}),
  card('g-veteranos','gold','Pilotos veteranos','Veteran pilots','Tras 3 destrucciones: +20 de vida máxima y +1 de daño, una vez.','After 3 kills: gain 20 maximum health and 1 damage, once.',[{hook:'veteran',kills:3,hp:20,damage:1}],{challenge:'ace'}),
  card('p-asalto','prismatic','Ala de asalto','Assault wing','Recibes un Bombardero gratis, aun con la flota llena.','Receive a free Bomber, even with a full fleet.',[{hook:'spawn',kind:'bomber',interval:0},{hook:'base-income',factor:0,duration:600}],'initial',['base-income'],'La base no da Metal durante 60 s.','Base income stops for 60 s.'),
  card('p-enjambre','prismatic','Enjambre','Swarm','Interceptores cuestan 4 Metal y se construyen en 2 s.','Interceptors cost 4 Metal and build in 2 s.',[{hook:'stat',kind:'interceptor',stat:'cost',operation:'set',value:4},{hook:'stat',kind:'interceptor',stat:'buildTicks',operation:'set',value:20},{hook:'stat',stat:'maxHp',operation:'add',value:-20}],'initial',['cost'],'Todas tus naves pierden 20 de vida máxima.','All ships lose 20 maximum health.'),
  card('p-fortaleza','prismatic','Fortaleza','Fortress','Naves cerca de base (radio 5): +3 de armadura. Base +1 nivel de daño.','Ships within 5 cells of base gain 3 armor. Base gains 1 damage level.',[{hook:'armor',origin:'base',radius:5,amount:3},{hook:'base-damage',levels:1},{hook:'stat',stat:'speed',operation:'add',value:-0.3}],'initial',[],'Todas tus naves pierden 0,3 c/s.','All ships lose 0.3 cells/s.'),
  card('p-artilleria','prismatic','Artillería pesada','Heavy artillery','Bombarderos: alcance 6 y área de radio 2.','Bombers gain range 6 and splash radius 2.',[{hook:'stat',kind:'bomber',stat:'range',operation:'set',value:6},{hook:'stat',kind:'bomber',stat:'splashRadius',operation:'set',value:2},{hook:'stat',kind:'bomber',stat:'attackTicks',operation:'set',value:45},{hook:'stat',kind:'bomber',stat:'cost',operation:'set',value:15}],'initial',[],'Disparan cada 4,5 s y cuestan 15 Metal.','Fire every 4.5 s and cost 15 Metal.'),
  card('p-todo','prismatic','Todo o nada','All or nothing','+15 Metal ahora y +2 de daño a todas tus naves.','Gain 15 Metal now and 2 damage on all ships.',[{hook:'pick-metal',amount:15},{hook:'stat',stat:'damage',operation:'add',value:2},{hook:'fleet',amount:-3}],'initial',['fleet'],'Límite de flota −3; las naves sobrantes sobreviven.','Fleet limit falls by 3; excess ships survive.'),
  card('p-titanes','prismatic','Titanes del vacío','Void titans','Todas tus naves +60 de vida máxima.','All ships gain 60 maximum health.',[{hook:'stat',stat:'maxHp',operation:'add',value:60},{hook:'stat',stat:'speed',operation:'add',value:-0.2}],'initial',[],'Todas tus naves pierden 0,2 c/s.','All ships lose 0.2 cells/s.'),
  card('p-sobrecarga','prismatic','Reactores sobrecargados','Overloaded reactors','Tus armas infligen 30 % más de daño.','Your weapons deal 30% more damage.',[{hook:'stat',stat:'damage',operation:'multiply',value:1.3},{hook:'stat',stat:'armor',operation:'add',value:-1}],'initial',[],'Todas tus naves pierden 1 de armadura.','All ships lose 1 armor.'),
  card('p-expansion','prismatic','Expansión militar','Military expansion','Flota máxima +6. Construcción en 75 % del tiempo.','Fleet limit gains 6. Ships build in 75% of the usual time.',[{hook:'fleet',amount:6},{hook:'stat',stat:'buildTicks',operation:'multiply',value:0.75},{hook:'stat',stat:'cost',operation:'add',value:1}],'initial',['fleet'],'Todas tus naves cuestan 1 Metal más.','All ships cost 1 more Metal.'),
  card('p-dominio','prismatic','Dominio del sector','Sector dominance','Capturar nodos y núcleo tarda 40 % menos.','Node and core captures take 40% less time.',[{hook:'capture',factor:0.6},{hook:'stat',stat:'maxHp',operation:'add',value:-25}],'initial',[],'Todas tus naves pierden 25 de vida máxima.','All ships lose 25 maximum health.'),
  card('p-escuadra','prismatic','Escuadra de intervención','Intervention squadron','Recibes 2 Fragatas gratis, aun con la flota llena.','Receive 2 free Frigates, even with a full fleet.',[{hook:'spawn',kind:'frigate',interval:0},{hook:'spawn',kind:'frigate',interval:0},{hook:'base-income',factor:0,duration:900}],'initial',['base-income'],'La base no da Metal durante 90 s.','Base income stops for 90 s.'),
  card('p-guerra','prismatic','Economía de guerra','War economy','Tus nodos producen el doble.','Owned nodes produce twice as much.',[{hook:'node-income',factor:2},{hook:'base-income',factor:0},{hook:'capture',factor:1.5}],{level:5},['base-income'],'Sin ingreso de base. Capturar tarda 50 % más.','No base income. Capture takes 50% longer.'),
  card('p-relampago','prismatic','Golpe relámpago','Lightning strike','Capturar el núcleo tarda 40 % menos.','Core capture takes 40% less time.',[{hook:'capture',factor:0.6,coreOnly:true},{hook:'armor',origin:'core',radius:1,amount:-3}],{level:8},[],'Tus naves sobre el núcleo tienen −3 de armadura.','Ships on the core have 3 less armor.'),
  card('p-camuflaje','prismatic','Camuflaje','Camouflage','Tras 3 s quietas: invisibles hasta moverse o atacar.','After 3 s stationary: invisible until moving or attacking.',[{hook:'camouflage',idleTicks:30},{hook:'stat',stat:'maxHp',operation:'add',value:-30}],{challenge:'untouchable'},[],'Todas tus naves pierden 30 de vida máxima.','All ships lose 30 maximum health.'),
  card('p-reciclaje','prismatic','Reciclaje de emergencia','Emergency recycling','Al perder una nave recuperas 75 % de su costo.','Losing a ship refunds 75% of its cost.',[{hook:'loss-income',factor:0.75},{hook:'no-base-repair'}],{challenge:'scrapper'},[],'Tus naves no se reparan en la base.','Your ships cannot repair at the base.'),
  card('p-mercenarios','prismatic','Mercenarios','Mercenaries','Ahora y cada 120 s recibes un Interceptor gratis.','Receive a free Interceptor now and every 120 s.',[{hook:'spawn',kind:'interceptor',interval:1200},{hook:'fleet',set:8},{hook:'no-production',kind:'interceptor'}],{challenge:'full-armada'},['fleet'],'Flota máxima 8 y no puedes construir Interceptores.','Fleet limit is 8 and you cannot build Interceptors.'),
];
export const AUGMENTS_BY_ID: ReadonlyMap<string, Augment> = new Map(AUGMENT_CATALOG.map((augment) => [augment.id, augment]));
export const INITIAL_AUGMENTS = AUGMENT_CATALOG.filter((augment) => augment.unlock === 'initial').map((augment) => augment.id);
