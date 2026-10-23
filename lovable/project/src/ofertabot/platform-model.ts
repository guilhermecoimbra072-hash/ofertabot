import {z} from 'zod';
import {parseMoney} from './money';
const number=z.number().int().nonnegative();
export const platformCompanySchema=z.object({id:z.string().uuid(),name:z.string(),owner:z.string().nullable(),plan:z.string(),group_limit:number,active_groups:number,access_status:z.enum(['active','paused']),paused_reason:z.string().nullable(),ai_hourly_limit:number,image_hourly_limit:number,spend_limit_minor:z.string().nullable(),ai_cost_minor:number,image_cost_minor:number,spent_minor:z.string(),text_hour:number,image_hour:number,offers:number,pending:number,sent:number,failed:number,online:number,timezone:z.string(),created_at:z.string()});
export const platformSnapshotSchema=z.object({stats:z.record(number),days:z.array(z.object({day:z.string(),offers:number})),statuses:z.array(z.object({status:z.string(),count:number})),companies:z.array(platformCompanySchema),operators:z.array(z.object({user_id:z.string().uuid(),email:z.string().nullable(),created_at:z.string()})),detail:z.object({company_id:z.string().uuid(),members:z.array(z.object({user_id:z.string(),email:z.string().nullable(),role:z.string()})),connections:z.array(z.object({id:z.string(),label:z.string(),status:z.string(),last_seen_at:z.string().nullable()})),audit:z.array(z.object({id:z.string(),event:z.string(),actor_id:z.string().nullable(),created_at:z.string()}))}).nullable()});
export type PlatformCompany=z.infer<typeof platformCompanySchema>;
export type PlatformSnapshot=z.infer<typeof platformSnapshotSchema>;
const minor=z.string().regex(/^\d+$/,'Informe um valor válido em reais.').refine(v=>BigInt(v)<=9223372036854775807n,'Valor acima do limite.');
const cost=z.number().int().min(0).max(2147483647);
const hourly=z.number().int().min(0).max(2147483647);
export const platformCommandSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('set_plan'),company_id:z.string().uuid(),plan:z.enum(['basic','professional','enterprise']),group_limit:z.number().int().min(1).max(10000)}),
 z.object({action:z.literal('set_limits'),company_id:z.string().uuid(),spend_limit_minor:minor.nullable(),ai_cost_minor:cost,image_cost_minor:cost,ai_hourly_limit:hourly,image_hourly_limit:hourly}),
 z.object({action:z.literal('set_access'),company_id:z.string().uuid(),access_status:z.enum(['active','paused']),reason:z.string().trim().min(1,'Informe o motivo.').max(500)}),
 z.object({action:z.literal('add_operator'),email:z.string().trim().email('Informe um e-mail válido.')}),
 z.object({action:z.literal('remove_operator'),user_id:z.string().uuid()})
]);
export type PlatformCommand=z.infer<typeof platformCommandSchema>;
export function reaisToCost(value:string){const parsed=parseMoney(value,'BRL');if(parsed===null)throw new Error('Informe o custo em reais.');const n=BigInt(parsed);if(n>2147483647n)throw new Error('Custo acima do limite.');return Number(n);}
