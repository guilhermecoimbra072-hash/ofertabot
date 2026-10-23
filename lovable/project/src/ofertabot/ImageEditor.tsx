import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {signed,upload,errorMessage,enhancedImage} from './api';
import type {Company} from './model';
import {DEFAULT_LABEL_COLOR,pickOcrRegion,priceLabelRegion,type Rect} from './imagegen';
export function PrivateImage({path,alt='Imagem da oferta'}:{path:string;alt?:string}){
 const [url,setUrl]=useState(''),[error,setError]=useState('');useEffect(()=>{let live=true;setUrl('');setError('');const run=()=>signed(path).then(u=>{if(live){setUrl(u);setError('');}}).catch(()=>{if(live)setError('Não foi possível carregar a imagem privada.');});void run();const t=setInterval(run,90000);return()=>{live=false;clearInterval(t);};},[path]);
 return url?<img src={url} alt={alt} className="offer-image" onError={()=>{setUrl('');setError('Imagem privada indisponível.');}}/>:<span className="muted" role="status">{error||'Carregando imagem privada…'}</span>;
}
const loadImage=(url:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const im=new Image();im.crossOrigin='anonymous';im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('Não foi possível abrir a imagem'));im.src=url;});
export type ImageGenerator={generate:(price?:string)=>Promise<Blob|null>;waitForEnhancement:()=>Promise<boolean>};
/** Prévia automática da imagem final: o operador informa só o preço; etiqueta, logo, contatos e marca d’água são aplicados sozinhos. Em segundo plano, a foto do fornecedor passa uma única vez por IA de melhoria (cache privado por imagem original); se a IA falhar, a arte apenas com código é usada sem bloquear nada. */
export const ImageEditor=forwardRef<ImageGenerator,{company:Company;offerId:string;path:string|null;priceText:string;onOriginal:(path:string)=>void;onEnhanced?:()=>void;disabled?:boolean}>(function ImageEditor({company,offerId,path,priceText,onOriginal,onEnhanced,disabled=false},ref){
 const canvas=useRef<HTMLCanvasElement>(null),base=useRef<HTMLImageElement|null>(null),logo=useRef<HTMLImageElement|null>(null),region=useRef<Rect|null>(null);
 const enhancement=useRef<{promise:Promise<boolean>;finish:(enhanced:boolean)=>void;accept:boolean;done:boolean}|null>(null);
 const onEnhancedRef=useRef(onEnhanced);onEnhancedRef.current=onEnhanced;
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[ready,setReady]=useState(0),[ocrDone,setOcrDone]=useState(false);
 useEffect(()=>{let active=true,improved=false;base.current=null;region.current=null;setOcrDone(false);setError('');
  let finish:(enhanced:boolean)=>void=()=>{};
  const promise=new Promise<boolean>(resolve=>{finish=resolve;});
  const job={promise,finish:(enhanced:boolean)=>{job.done=true;finish(enhanced);},accept:true,done:false};enhancement.current=job;
  if(!path)job.finish(false);
  if(path)void signed(path).then(loadImage).then(im=>{if(!active)return;base.current=im;setReady(n=>n+1);
   void import('./ocr').then(({recognizePrices})=>recognizePrices(im.src)).then(regions=>{if(!active||improved)return;const cv=canvas.current,im2=base.current;if(cv&&im2)region.current=pickOcrRegion(regions,cv.width/im2.width);setReady(n=>n+1);}).catch(()=>{}).finally(()=>{if(active)setOcrDone(true);});
   // Melhoria por IA em segundo plano, uma vez por imagem original: falha cai silenciosamente na arte apenas com código.
   void enhancedImage(company.id,offerId,path).then(async blob=>{if(!blob)return null;const url=URL.createObjectURL(blob);try{return await loadImage(url);}finally{URL.revokeObjectURL(url);}}).then(im=>{if(active&&job.accept&&im){improved=true;base.current=im;region.current=null;setReady(n=>n+1);onEnhancedRef.current?.();job.finish(true);}}).catch(()=>{}).finally(()=>{if(!job.done)job.finish(false);});
  }).catch(e=>{if(active)setError(errorMessage(e));job.finish(false);});
  return()=>{active=false;job.accept=false;job.finish(false);};},[path,offerId,company.id]);
 useEffect(()=>{let active=true;logo.current=null;if(company.brand['logo'])void signed(company.brand['logo']).then(loadImage).then(im=>{if(active){logo.current=im;setReady(n=>n+1);}}).catch(()=>{});return()=>{active=false;};},[company.brand['logo']]);
 function paint(finalPrice=priceText){
  const cv=canvas.current,im=base.current;if(!cv||!im)return;const scale=Math.min(1,1600/im.width);cv.width=Math.round(im.width*scale);cv.height=Math.round(im.height*scale);const ctx=cv.getContext('2d');if(!ctx)return;
  const css=getComputedStyle(cv);const ink=css.getPropertyValue('--canvas-ink').trim()||'#fff',shadow=css.getPropertyValue('--canvas-shadow').trim()||'#333',band=css.getPropertyValue('--canvas-band').trim()||'#102e26';
  ctx.drawImage(im,0,0,cv.width,cv.height);
  const contact=[company.brand['phone'],company.brand['instagram']].filter(Boolean).join('  •  ');
  const bandH=contact?60:0;
  if(finalPrice){const r=priceLabelRegion(region.current,cv.width,cv.height,bandH);ctx.fillStyle=company.brand['color']||DEFAULT_LABEL_COLOR;ctx.fillRect(r.x,r.y,r.w,r.h);ctx.fillStyle=ink;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`bold ${Math.max(14,Math.min(r.h*.62,r.w/Math.max(finalPrice.length,1)*1.7))}px system-ui`;ctx.fillText(finalPrice,r.x+r.w/2,r.y+r.h/2,r.w*.94);}
  if(logo.current){const l=logo.current,w=cv.width*.18;ctx.drawImage(l,cv.width-w-20,20,w,w*l.height/l.width);}
  const watermark=company.brand['watermark']??'';
  if(watermark){ctx.save();ctx.globalAlpha=.32;ctx.fillStyle=ink;ctx.strokeStyle=shadow;ctx.lineWidth=2;ctx.font=`bold ${cv.width*.055}px system-ui`;ctx.textAlign='center';ctx.strokeText(watermark,cv.width/2,cv.height*.55,cv.width*.9);ctx.fillText(watermark,cv.width/2,cv.height*.55,cv.width*.9);ctx.restore();}
  if(contact){ctx.fillStyle=band;ctx.fillRect(0,cv.height-60,cv.width,60);ctx.fillStyle=ink;ctx.font=`${Math.max(16,cv.width*.025)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillText(contact,cv.width/2,cv.height-24,cv.width*.95);}
 }
 useEffect(()=>paint(),[ready,priceText]);
 useImperativeHandle(ref,()=>({waitForEnhancement:async()=>{const job=enhancement.current;if(!job)return false;if(job.done)return job.promise;
  // Limita apenas a espera do salvamento. Não aborta a chamada nem o cache da IA.
  const timer=setTimeout(()=>{job.accept=false;job.finish(false);},45000);
  try{return await job.promise;}finally{clearTimeout(timer);}
 },generate:async price=>{const cv=canvas.current;if(!cv||!base.current)return null;paint(price);return new Promise<Blob|null>(resolve=>cv.toBlob(b=>resolve(b),'image/png'));}}));
 async function run(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 return <section className="card"><h3>Imagem gerada automaticamente</h3><p className="muted">O original é preservado. A etiqueta de preço, o logo, os contatos e a marca d’água das configurações da loja são aplicados sozinhos; a imagem final é salva junto com as alterações.</p>
 <label className="file">Enviar imagem original<input aria-label="Enviar imagem original" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy||disabled} onChange={e=>{const f=e.target.files?.[0];if(f)void run(async()=>onOriginal(await upload(company.id,f)));}}/></label>
 {path&&<><canvas ref={canvas} className="editor-canvas" aria-label="Prévia da imagem final" aria-readonly="true"/>
 {!ocrDone&&<p className="muted" role="status">Procurando o preço na imagem para posicionar a etiqueta…</p>}</>}
 {busy&&<p role="status">Enviando imagem…</p>}{error&&<p className="error" role="alert">{error}</p>}</section>;
});
