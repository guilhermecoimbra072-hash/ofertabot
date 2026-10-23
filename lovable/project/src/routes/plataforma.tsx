import {createFileRoute,redirect} from '@tanstack/react-router';
export const Route=createFileRoute('/plataforma')({
 head:()=>({meta:[{title:'Plataforma — OfertaBot'},{name:'description',content:'Controle de empresas e operadores da plataforma OfertaBot.'},{property:'og:title',content:'Plataforma — OfertaBot'},{property:'og:description',content:'Gestão restrita da plataforma OfertaBot, com indicadores reais.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),
 beforeLoad:()=>{throw redirect({to:'/',search:{page:'platform'},replace:true});}
});
