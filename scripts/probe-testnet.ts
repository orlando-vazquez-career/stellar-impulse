import { probeTestnet } from '../packages/chain/src/index';
console.log(JSON.stringify(await probeTestnet(), null, 2));
