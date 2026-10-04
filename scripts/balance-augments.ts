import { mkdirSync, writeFileSync } from 'node:fs';
import { AUGMENT_CATALOG } from '../packages/sim/src/augments/catalog.js';
import { simulateAugmentMatch } from '../packages/sim/src/augments/balance.js';
const flag=(name:string,fallback:string)=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]!:fallback;
const samples=Number(flag('--samples','200')), filter=flag('--id','all');
if(!Number.isSafeInteger(samples)||samples<1)throw Error('Invalid sample count');
mkdirSync('.local/balance',{recursive:true});
const cards=filter==='all'?AUGMENT_CATALOG:AUGMENT_CATALOG.filter(a=>a.id===filter);
const cases=[['sector-01','complete'],['sector-01','skirmish'],['espiral','complete'],['espiral','skirmish']] as const;
const rows=[];
for(const card of cards){
  const started=performance.now(), games=[];
  for(let i=0;i<samples;i++){
    const [map,mode]=cases[Math.floor(i/2)%4]!;
    const seed=1000+Math.floor(i/2),augmented=i%2===0?'p1':'p2';
    const outcome=simulateAugmentMatch(seed,map,mode,card.id,augmented);games.push({seed,map,mode,...outcome});
    if(i%10===9)console.log(`${card.id}: ${i+1}/${samples}`);
  }
  const wins=games.filter(g=>g.winner===g.augmented).length,draws=games.filter(g=>g.winner===null).length;
  const row={id:card.id,tier:card.tier,samples,wins,losses:samples-wins-draws,draws,winPercent:100*wins/samples,seconds:(performance.now()-started)/1000};rows.push(row);
  writeFileSync(`.local/balance/${card.id}.json`,JSON.stringify({row,games},null,2));console.log(JSON.stringify(row));
}
writeFileSync('.local/balance/summary.json',JSON.stringify(rows,null,2));
