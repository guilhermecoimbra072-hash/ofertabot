import {useEffect,useState} from 'react';
import {Sun,Moon} from 'lucide-react';
import {Button} from './ui';
export type Theme='dark'|'light';
export function applyTheme(theme:Theme){document.documentElement.dataset['theme']=theme;try{localStorage.setItem('ofertabot-theme',theme);}catch{/* preferência local indisponível */}}
export function ThemeControl(){
 const [theme,setTheme]=useState<Theme>('dark');
 useEffect(()=>{let saved:Theme='dark';try{if(localStorage.getItem('ofertabot-theme')==='light')saved='light';}catch{/* padrão escuro */}setTheme(saved);applyTheme(saved);},[]);
 const choose=(value:Theme)=>{setTheme(value);applyTheme(value);};
 return <div className="theme-control" role="group" aria-label="Tema"><Button title="Tema claro" aria-label="Tema claro" aria-pressed={theme==='light'} className={theme==='light'?'':'secondary'} onClick={()=>choose('light')}><Sun size={17}/></Button><Button title="Tema escuro" aria-label="Tema escuro" aria-pressed={theme==='dark'} className={theme==='dark'?'':'secondary'} onClick={()=>choose('dark')}><Moon size={17}/></Button></div>;
}
