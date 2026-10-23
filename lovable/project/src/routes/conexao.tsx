import {createFileRoute,redirect} from "@tanstack/react-router";
export const Route=createFileRoute("/conexao")({
  head: () => ({
    meta: [
      { title: "Conexão — OfertaBot" },
      { name: "description", content: "Gerencie a conexão com o WhatsApp." },
      { property: "og:title", content: "Conexão — OfertaBot" },
      { property: "og:description", content: "Gerencie a conexão com o WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad:()=>{throw redirect({to:"/",search:{page:"whatsapp"},replace:true});},
});
