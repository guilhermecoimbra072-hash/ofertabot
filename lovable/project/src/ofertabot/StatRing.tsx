import type {LucideIcon} from 'lucide-react';

export function StatRing({label,value,icon:Icon}:{label:string;value:number;icon:LucideIcon}) {
 return <div className="stat stat-ring">
  <div className={'ring-meter '+(value>0?'has-value':'is-zero')}>
   <svg viewBox="0 0 200 200" aria-hidden="true">
    <circle className="ring-outer" cx="100" cy="100" r="86"/>
    <circle className="ring-ticks" cx="100" cy="100" r="80"/>
    <circle className="ring-track" cx="100" cy="100" r="68"/>
    <circle className="ring-light" cx="100" cy="100" r="68"/>
    <circle className="ring-inner" cx="100" cy="100" r="54"/>
   </svg>
   <div className="ring-value"><Icon size={18}/><strong>{value.toLocaleString('pt-BR')}</strong></div>
  </div>
  <h3>{label}</h3>
 </div>;
}
