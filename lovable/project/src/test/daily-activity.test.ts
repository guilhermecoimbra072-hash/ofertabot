import {describe,it,expect} from 'vitest';
import {DateTime} from 'luxon';
import {dailyActivity,dayDelta} from '../ofertabot/daily-activity';
const now=DateTime.fromISO('2026-10-22T15:00:00Z');
describe('Evolução diária real',()=>{
 it('preenche sete dias sem inventar atividade',()=>{
  const rows=dailyActivity(7,'America/Sao_Paulo',[],[],now);
  expect(rows).toHaveLength(7);
  expect(rows[0]?.date).toBe('2026-10-16');
  expect(rows[6]).toEqual({date:'2026-10-22',label:'22/10',received:0,sent:0});
  expect(rows.reduce((sum,row)=>sum+row.received+row.sent,0)).toBe(0);
 });
 it('conta datas no fuso da empresa, separa séries e exclui fora do período',()=>{
  const rows=dailyActivity(7,'America/Sao_Paulo',['2026-10-22T01:00:00Z','2026-10-22T15:00:00Z','2026-10-15T15:00:00Z'],['2026-10-22T15:30:00Z'],now);
  expect(rows[5]?.received).toBe(1);
  expect(rows[6]?.received).toBe(1);
  expect(rows[6]?.sent).toBe(1);
  expect(rows.reduce((sum,row)=>sum+row.received,0)).toBe(2);
 });
 it('mantém trinta dias reais no período ampliado',()=>{
  const rows=dailyActivity(30,'America/Sao_Paulo',['2026-09-23T12:00:00Z'],[],now);
  expect(rows).toHaveLength(30);
  expect(rows[0]).toEqual({date:'2026-09-23',label:'23/09',received:1,sent:0});
 });
});
describe('Comparação com ontem',()=>{
 it('não mostra variação quando ontem não teve registros',()=>{
  const rows=dailyActivity(2,'America/Sao_Paulo',['2026-10-22T15:00:00Z'],[],now);
  expect(dayDelta(rows,'received')).toEqual({today:1,yesterday:0,change:null});
 });
 it('calcula a variação real quando ontem teve registros',()=>{
  const rows=dailyActivity(2,'America/Sao_Paulo',['2026-10-21T12:00:00Z','2026-10-21T13:00:00Z','2026-10-22T12:00:00Z'],['2026-10-21T12:00:00Z'],now);
  expect(dayDelta(rows,'received')).toEqual({today:1,yesterday:2,change:-0.5});
  expect(dayDelta(rows,'sent')).toEqual({today:0,yesterday:1,change:-1});
 });
 it('devolve zero sem base quando não há dias',()=>{
  expect(dayDelta([],'received')).toEqual({today:0,yesterday:0,change:null});
 });
});
