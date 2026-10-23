import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
const root=process.cwd();
for(const target of ['web','mobile']){
  const base=path.join(root,'dist',target);
  for(const f of ['index.html','platform.js','store.js','app.js','styles.css','icons/icon-192.png','icons/icon-512.png']) await access(path.join(base,f));
  const platform=await readFile(path.join(base,'platform.js'),'utf8');
  if(target==='web' && !platform.includes('DARTDECK_NATIVE=false')) throw new Error('Web platform flag incorrect');
  if(target==='mobile' && !platform.includes('DARTDECK_NATIVE=true')) throw new Error('Mobile platform flag incorrect');
  const index=await readFile(path.join(base,'index.html'),'utf8');
  if(!index.includes('0.9.0') || !index.includes('./store.js')) throw new Error(`${target} index is not unified 0.9.0`);
}
const store=await readFile(path.join(root,'src','store.js'),'utf8');
if(!store.includes("DB_NAME='dartdeck-local'")) throw new Error('IndexedDB name changed; this would break web migration');
console.log('DartDeck 0.9.0 smoke tests passed.');
