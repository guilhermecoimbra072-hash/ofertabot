import {useQuery} from '@tanstack/react-query';
import {db} from './api';

type Slice={key:string;label:string;value:number;color:string};
const R=70,C=2*Math.PI*R;
async function statusCounts(company:string){
 const out={pending:0,approved:0,rejected:0};
 for(const status of ['pending','approved','rejected'] as const){
  const {count,error}=await db.from('offers').select('id',{count:'exact',head:true}).eq('company_id',company).eq('status',status);
  if(error)throw error;
  out[status]=count??0;
 }
 return out;
}
export function StatusDonut({company}:{company:string}){
 const query=useQuery({queryKey:['ofertabot-status-distribution',company],queryFn:()=>statusCounts(company),refetchInterval:60000});
 const counts=query.data??{pending:0,approved:0,rejected:0};
 const slices:Slice[]=[
  {key:'approved',label:'Aprovadas',value:counts.approved,color:'var(--primary)'},
  {key:'pending',label:'Pendentes',value:counts.pending,color:'var(--donut-pending)'},
  {key:'rejected',label:'Rejeitadas',value:counts.rejected,color:'var(--destructive)'},
 ];
 const total=counts.pending+counts.approved+counts.rejected;
 let offset=0;
 return <section className="card donut-card" aria-label="Distribuição das ofertas por status">
  <div className="section-head"><h3>Distribuição das ofertas</h3></div>
  {query.isPending?<div className="activity-loading" role="status">Carregando distribuição…</div>:query.isError?<p className="muted" role="alert">Não foi possível carregar a distribuição.</p>:<>
   <div className="donut-meter">
    <svg viewBox="0 0 200 200" role="img" aria-label={`Total de ${total} ofertas`}>
     <circle cx="100" cy="100" r={R} fill="none" stroke="var(--ring-track)" strokeWidth="26"/>
     {total>0&&slices.map(slice=>{
      const fraction=slice.value/total,length=fraction*C;
      const el=<circle key={slice.key} cx="100" cy="100" r={R} fill="none" stroke={slice.color} strokeWidth="26" strokeDasharray={`${Math.max(0,length-2)} ${C-length+2}`} strokeDashoffset={-offset} transform="rotate(-90 100 100)"/>;
      offset+=length;
      return el;
     })}
    </svg>
    <div className="donut-value"><strong>{total.toLocaleString('pt-BR')}</strong><span>total</span></div>
   </div>
   <ul className="donut-legend">{slices.map(slice=>{
    const percent=total>0?Math.round(slice.value/total*100):0;
    return <li key={slice.key}><span><i style={{background:slice.color}}/>{slice.label}</span><strong>{slice.value.toLocaleString('pt-BR')} · {percent}%</strong></li>;
   })}</ul>
  </>}
 </section>;
}
