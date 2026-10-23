import type {ButtonHTMLAttributes,ReactNode} from 'react';
import {Inbox} from 'lucide-react';
import {labels} from './model';
export function Button({className='',...props}:ButtonHTMLAttributes<HTMLButtonElement>){return <button type="button" className={className} {...props}/>;}
export function Empty({title,children}:{title:string;children:ReactNode}){return <div className="empty"><Inbox size={34}/><h3>{title}</h3><p>{children}</p></div>;}
export function Status({status}:{status:string}){return <span className={'badge '+status}>{labels[status]??status}</span>;}
export function Skeleton(){return <div className="loading" role="status" aria-label="Carregando dados"><div className="skeleton"/><div className="skeleton"/><div className="skeleton"/></div>;}
