// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseMoney, decimalMoney } from "@/ofertabot/money";
import { scheduledUtc, resolveEngineUrl } from "@/ofertabot/schedule";
import { online, destinationAvailable, snapshotSchema } from "@/ofertabot/model";
describe("Contrato do painel OfertaBot", () => {
  it("BRL converte 1.299,90 para 129990 sem arredondamento", () =>
    expect(parseMoney("1.299,90", "BRL")).toBe("129990"));
  it("bigint preserva precisão maior que Number seguro", () =>
    expect(decimalMoney(parseMoney("90071992547409,93", "BRL"), "BRL")).toBe("90071992547409,93"));
  it("PYG não aceita casas decimais", () => {
    expect(parseMoney("1.299", "PYG")).toBe("1299");
    expect(() => parseMoney("1.299,90", "PYG")).toThrow();
  });
  it("preço negativo não pode ser enviado", () =>
    expect(() => parseMoney("-1,00", "BRL")).toThrow());
  it("preço vazio permanece null", () => expect(parseMoney("", "BRL")).toBeNull());
  it("motor fica offline ao completar 90 segundos", () => {
    const c = {
      id: "id",
      label: "Notebook",
      status: "connected",
      last_seen_at: "2026-10-22T00:00:00Z",
      qr: null,
      qr_expires_at: null,
    };
    expect(online(c, Date.parse(c.last_seen_at) + 89999)).toBe(true);
    expect(online(c, Date.parse(c.last_seen_at) + 90000)).toBe(false);
  });
  it("destino revogado é excluído mesmo com flag legada", () =>
    expect(
      destinationAvailable(
        {
          id: "g",
          connection_id: "c",
          jid: "g@g.us",
          name: "g",
          is_source: false,
          is_destination: true,
        },
        [
          {
            id: "c",
            label: "",
            status: "revoked",
            last_seen_at: null,
            qr: null,
            qr_expires_at: null,
          },
        ],
      ),
    ).toBe(false));
  it("URL do motor usa domínio publicado e endpoint TanStack", () =>
    expect(resolveEngineUrl("https://ofertabot.example/qualquer", "http://localhost:8080")).toBe(
      "https://ofertabot.example/api/public/engine-api",
    ));
  it("prévia e HTTP não são URLs externas de motor", () => {
    expect(resolveEngineUrl(undefined, "https://id-preview--example.lovable.app")).toBe("");
    expect(resolveEngineUrl(undefined, "http://localhost:8080")).toBe("");
    expect(resolveEngineUrl("http://example.com", "https://example.com")).toBe("");
  });
  it("agendamento converte São Paulo para UTC", () =>
    expect(
      scheduledUtc("2026-10-23T10:00", "America/Sao_Paulo", Date.parse("2026-10-22T00:00:00Z")),
    ).toBe("2026-10-23T13:00:00.000Z"));
  it("horários inexistentes ou ambíguos são rejeitados", () => {
    expect(() => scheduledUtc("2026-03-08T02:30", "America/New_York", 0)).toThrow();
    expect(() => scheduledUtc("2026-11-01T01:30", "America/New_York", 0)).toThrow();
  });
  it("horário passado é rejeitado", () =>
    expect(() =>
      scheduledUtc("2026-10-22T10:00", "America/Sao_Paulo", Date.parse("2026-10-23T00:00:00Z")),
    ).toThrow());
  it("snapshot sem empresa retorna listas realmente vazias", () => {
    const data = snapshotSchema.parse({ companies: [] });
    expect(data.offers).toEqual([]);
    expect(data.publications).toEqual([]);
    expect(data.company).toBeUndefined();
  });
});
