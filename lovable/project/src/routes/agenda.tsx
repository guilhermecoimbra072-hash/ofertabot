import {createFileRoute,redirect} from "@tanstack/react-router";
export const Route=createFileRoute("/agenda")({
  head: () => ({
    meta: [
      { title: "Agenda — OfertaBot" },
      { name: "description", content: "Publicações programadas." },
      { property: "og:title", content: "Agenda — OfertaBot" },
      { property: "og:description", content: "Publicações programadas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad:()=>{throw redirect({to:"/",search:{page:"schedule"},replace:true});},
});

