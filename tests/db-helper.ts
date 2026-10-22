import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export async function database(){
 const db=new PGlite();await db.exec(await readFile(new URL('./support-schema.sql',import.meta.url),'utf8'));await db.exec(await readFile(process.env.OFERTABOT_SCHEMA?resolve(process.env.OFERTABOT_SCHEMA):new URL('../supabase/schema.sql',import.meta.url),'utf8'));return db;
}
export async function user(db:PGlite,id:string){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
export async function rpc(db:PGlite,name:string,...args:unknown[]){const qs=args.map((_,i)=>`$${i+1}`).join(',');return (await db.query<{value:any}>(`select public.${name}(${qs}) as value`,args)).rows[0].value;}
