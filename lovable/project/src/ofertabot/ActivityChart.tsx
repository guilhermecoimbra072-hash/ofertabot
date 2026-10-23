import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {DateTime} from 'luxon';
import {Bar,BarChart,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {db} from './api';
import {activityPeriod,dailyActivity} from './daily-activity';
import {Button} from './ui';

async function activity(company:string,days:number,timezone:string) {
 const now=DateTime.now();
 const {start,end}=activityPeriod(days,timezone,now);
 const from=start.toISO(),to=end.toISO();
 if(!from||!to)throw new Error('Não foi possível consultar o período.');
 const received:string[]=[],sent:string[]=[];
 // Ler todas as páginas do período, não apenas as 100 linhas da caixa de entrada.
 for(let offset=0;;offset+=500){
  const {data,error}=await db.from('offers').select('id,received_at').eq('company_id',company).gte('received_at',from).lte('received_at',to).order('received_at').order('id').range(offset,offset+499);
  if(error)throw error;
  received.push(...(data??[]).map(row=>row.received_at));
  if(!data||data.length<500)break;
 }
 for(let offset=0;;offset+=500){
  const {data,error}=await db.from('publications').select('id,sent_at').eq('company_id',company).eq('status','sent').gte('sent_at',from).lte('sent_at',to).order('sent_at').order('id').range(offset,offset+499);
  if(error)throw error;
  for(const row of data??[])if(row.sent_at)sent.push(row.sent_at);
  if(!data||data.length<500)break;
 }
 return dailyActivity(days,timezone,received,sent,now);
}
export function useDailyActivity(company:string,timezone:string,days:number,enabled=true){
 return useQuery({queryKey:['ofertabot-activity',company,days,timezone],queryFn:()=>activity(company,days,timezone),refetchInterval:60000,enabled});
}
export function ActivityChart({company,timezone}:{company:string;timezone:string}){
 const [days,setDays]=useState(7);
 const query=useDailyActivity(company,timezone,days);
 const rows=query.data??[];
 const totalReceived=rows.reduce((sum,row)=>sum+row.received,0),totalSent=rows.reduce((sum,row)=>sum+row.sent,0);
 return <section className="card activity-panel" aria-label="Volume diário da operação">
  <div className="section-head"><div><h3>Volume da operação</h3><p className="fine">{rows.length?`${rows[0]?.label} a ${rows.at(-1)?.label} · `:''}{timezone}</p></div><div className="period-tabs" aria-label="Período do gráfico">{[7,30].map(value=><Button key={value} className={days===value?'':'secondary'} aria-pressed={days===value} onClick={()=>setDays(value)}>{value} dias</Button>)}</div></div>
  {query.isPending?<div className="activity-loading" role="status">Carregando evolução…</div>:query.isError?<div className="error" role="alert">Não foi possível carregar a evolução.<Button className="link" onClick={()=>void query.refetch()}>Tentar novamente</Button></div>:<>
   <div className="activity-legend"><span><i className="series-dot received"/>Ofertas recebidas <strong>{totalReceived}</strong></span><span><i className="series-dot sent"/>Publicações enviadas <strong>{totalSent}</strong></span></div>
   <div className="activity-plot"><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} margin={{top:18,right:12,left:-22,bottom:4}} barGap={3}>
    <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 6"/>
    <XAxis dataKey="label" stroke="var(--muted-foreground)" tickLine={false} axisLine={false} minTickGap={24} tick={{fontSize:11}}/>
    <YAxis allowDecimals={false} domain={[0,'auto']} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} tick={{fontSize:11}}/>
    <Tooltip cursor={{fill:'var(--accent)'}} content={({active,payload,label})=>active&&payload?.length?<div className="activity-tooltip"><strong>{label}</strong>{payload.map(item=><p key={String(item.dataKey)}>{item.name}: <strong>{item.value}</strong></p>)}</div>:null}/>
    <Bar name="Ofertas recebidas" dataKey="received" fill="var(--primary)" radius={[5,5,0,0]} maxBarSize={26} isAnimationActive={false}/>
    <Bar name="Publicações enviadas" dataKey="sent" fill="var(--chart-sent)" radius={[5,5,0,0]} maxBarSize={26} isAnimationActive={false}/>
   </BarChart></ResponsiveContainer></div>
   {!totalReceived&&!totalSent&&<p className="fine activity-empty">Nenhuma oferta recebida ou publicação enviada neste período.</p>}
  </>}
 </section>;
}
