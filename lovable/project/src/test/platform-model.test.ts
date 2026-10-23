import {describe,it,expect} from 'vitest';
import {platformCommandSchema,reaisToCost} from '@/ofertabot/platform-model';
const company_id='00000000-0000-4000-8000-000000000001';
describe('Valores de gestão da plataforma',()=>{
 it('converte reais para centavos sem arredondar custos',()=>{expect(reaisToCost('1,29')).toBe(129);expect(reaisToCost('0,00')).toBe(0);});
 it('enterprise só aceita limite entre 1 e 10000',()=>{for(const group_limit of [1,10000])expect(platformCommandSchema.safeParse({action:'set_plan',company_id,plan:'enterprise',group_limit}).success).toBe(true);for(const group_limit of [0,10001])expect(platformCommandSchema.safeParse({action:'set_plan',company_id,plan:'enterprise',group_limit}).success).toBe(false);});
 it('teto nulo e custo zero preservam ausência de cobrança',()=>{expect(platformCommandSchema.parse({action:'set_limits',company_id,spend_limit_minor:null,ai_cost_minor:0,image_cost_minor:0,ai_hourly_limit:30,image_hourly_limit:30})).toMatchObject({spend_limit_minor:null,ai_cost_minor:0,image_cost_minor:0});});
 it('pausa e retomada exigem motivo',()=>{for(const access_status of ['active','paused'])expect(platformCommandSchema.safeParse({action:'set_access',company_id,access_status,reason:''}).success).toBe(false);});
});
