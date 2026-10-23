import {useEffect,useState} from 'react';
import {FileText} from 'lucide-react';
import {signed} from './api';
import {PrivateImage} from './ImageEditor';
export type MediaType='image'|'video'|'audio'|'document';
/** Tipo de mídia pela extensão curta do arquivo preservado. */
export const mediaType=(path:string):MediaType=>{const ext=path.split('.').pop()?.toLowerCase()??'';return ['jpg','jpeg','png','webp'].includes(ext)?'image':ext==='mp4'?'video':['ogg','mp3','m4a'].includes(ext)?'audio':'document';};
export const APPROVABLE_KINDS=['text','image','video','audio','document'];
export function PrivateMedia({path}:{path:string}){
 const type=mediaType(path),[url,setUrl]=useState(''),[error,setError]=useState('');
 useEffect(()=>{if(type==='image')return;let live=true;setUrl('');void signed(path).then(u=>{if(live)setUrl(u);}).catch(()=>{if(live)setError('Mídia privada indisponível.');});return()=>{live=false;};},[path,type]);
 if(type==='image')return <PrivateImage path={path}/>;
 if(!url)return <span className="muted" role="status">{error||'Carregando mídia privada…'}</span>;
 if(type==='video')return <video className="offer-image" controls preload="metadata" src={url}/>;
 if(type==='audio')return <audio controls preload="metadata" src={url}/>;
 return <a className="secondary" href={url} target="_blank" rel="noreferrer"><FileText size={16}/> Abrir documento ({path.split('.').pop()?.toUpperCase()})</a>;
}
