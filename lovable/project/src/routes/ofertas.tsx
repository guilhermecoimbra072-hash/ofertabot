import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/ofertas")({
  head: () => ({
    meta: [
      { title: "Ofertas — OfertaBot" },
      { name: "description", content: "Revise, aprove e republique ofertas recebidas." },
      { property: "og:title", content: "Ofertas — OfertaBot" },
      { property: "og:description", content: "Revise, aprove e republique ofertas recebidas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/", search: { page: "offers" }, replace: true });
  },
});
