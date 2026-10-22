import { createFileRoute } from "@tanstack/react-router";
import { ClientApp } from "@/ofertabot/ClientApp";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { page?: string; recovery?: string } => ({
    ...(typeof search['page'] === 'string' ? { page: search['page'] } : {}),
    ...(typeof search['recovery'] === 'string' ? { recovery: search['recovery'] } : {}),
  }),
  head: () => ({
    meta: [
      { title: "OfertaBot — Revisão e publicação de ofertas" },
      { name: "description", content: "Seu espaço para revisar ofertas, personalizar imagens e controlar publicações por empresa." },
      { property: "og:title", content: "OfertaBot — Revisão e publicação de ofertas" },
      { property: "og:description", content: "Revise textos e imagens, aprove versões e acompanhe cada publicação." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  return <ClientApp />;
}

