import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { AUGMENT_CATALOG } from '../packages/sim/src/augments/catalog.js';
const slots=Number(process.env.BALANCE_WORKERS ?? 4);
const samples=Number(process.env.BALANCE_SAMPLES ?? 200);
mkdirSync('.local/balance',{recursive:true});
const queue=[...AUGMENT_CATALOG];
await Promise.all(Array.from({length:slots},async()=>{
  while(queue.length){
    const card=queue.shift()!;
    await new Promise<void>((resolve,reject)=>{
      const child=spawn(process.execPath,[...process.execArgv,'scripts/balance-augments.ts','--id',card.id,'--samples',String(samples)],{stdio:'inherit',windowsHide:true});
      child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`${card.id}: ${code}`)));
    });
  }
}));
const rows=AUGMENT_CATALOG.map(card=>JSON.parse(readFileSync(`.local/balance/${card.id}.json`,'utf8')).row);
writeFileSync('.local/balance/summary.json',JSON.stringify(rows,null,2));
console.table(rows);
