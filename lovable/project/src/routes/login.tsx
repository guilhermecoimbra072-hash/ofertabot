import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — OfertaBot" },
      { name: "description", content: "Acesse o painel OfertaBot." },
      { property: "og:title", content: "Entrar — OfertaBot" },
      { property: "og:description", content: "Acesse o painel OfertaBot." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/", search: { page: "dashboard" }, replace: true });
  },
});
