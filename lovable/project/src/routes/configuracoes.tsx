import {createFileRoute,redirect} from "@tanstack/react-router";
export const Route=createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — OfertaBot" },
      { name: "description", content: "Preferências do painel e do bot." },
      { property: "og:title", content: "Configurações — OfertaBot" },
      { property: "og:description", content: "Preferências do painel e do bot." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad:()=>{throw redirect({to:"/",search:{page:"engine"},replace:true});},
});

