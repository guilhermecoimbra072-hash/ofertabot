import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/historico")({
  head: () => ({
    meta: [
      { title: "Histórico — OfertaBot" },
      { name: "description", content: "Registro de ofertas publicadas e rejeitadas." },
      { property: "og:title", content: "Histórico — OfertaBot" },
      { property: "og:description", content: "Registro de ofertas publicadas e rejeitadas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/", search: { page: "history" }, replace: true });
  },
});
