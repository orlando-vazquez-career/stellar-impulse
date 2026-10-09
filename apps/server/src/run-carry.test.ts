import {afterAll,beforeAll,expect,it} from 'vitest';
import {Client,type Room} from '@colyseus/sdk';
import type {PlayerView} from '@impulso/state';
import {createGameServer} from './app';
const port=38000+Math.floor(Math.random()*900),url=`http://127.0.0.1:${port}`;
const server=createGameServer();
beforeAll(()=>server.listen(port,'127.0.0.1'));afterAll(()=>server.gracefullyShutdown(false));
function next<T>(room:Room,type:string,accept:(value:T)=>boolean=()=>true):Promise<T>{return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error(`Missing ${type}`)),5000);
  const off=room.onMessage(type,(value:T)=>{if(accept(value)){clearTimeout(timer);off();resolve(value);}});
});}
it('starts the next sector of a run owning the augments carried from earlier ones, and still offers a new one',async()=>{
  const room=await new Client(url).create('training',{map:'espiral-2',carried:['s-optica','g-impulso','not-a-card',7]});
  for(const type of ['augmentOffer','augmentChosen','ack','rejected'])room.onMessage(type,()=>{});
  try{
    const view=await next<PlayerView>(room,'view',value=>!!value.augments);
    expect(view.augments!.own.map(card=>card.id)).toEqual(['s-optica','g-impulso']);
    expect(view.augments!.offer!.cards).toHaveLength(3);
    expect(view.augments!.offer!.cards.map(card=>card.id)).not.toContain('s-optica');
  }finally{await room.leave();}
});
it('does not let a match between humans start with carried augments',async()=>{
  const room=await new Client(url).create('training',{opponent:'human',map:'sector-01',carried:['s-optica']});
  for(const type of ['augmentOffer','augmentChosen','ack','rejected'])room.onMessage(type,()=>{});
  try{
    const view=await next<PlayerView>(room,'view',value=>!!value.augments);
    expect(view.augments!.own).toEqual([]);
  }finally{await room.leave();}
});
