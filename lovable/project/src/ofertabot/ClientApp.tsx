import {lazy,Suspense,useEffect,useState} from 'react';
const App=lazy(()=>import('./App'));
export function ClientApp(){const [mounted,setMounted]=useState(false);useEffect(()=>setMounted(true),[]);return mounted?<Suspense fallback={<div className="loading" role="status">Abrindo seu espaço de trabalho…</div>}><App/></Suspense>:<div className="loading" role="status">Abrindo OfertaBot…</div>;}
