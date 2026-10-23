import {createFileRoute,redirect} from "@tanstack/react-router";
export const Route=createFileRoute("/grupos")({
  head: () => ({
    meta: [
      { title: "Grupos — OfertaBot" },
      { name: "description", content: "Grupos monitorados e grupos de destino." },
      { property: "og:title", content: "Grupos — OfertaBot" },
      { property: "og:description", content: "Grupos monitorados e grupos de destino." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad:()=>{throw redirect({to:"/",search:{page:"groups"},replace:true});},
});
