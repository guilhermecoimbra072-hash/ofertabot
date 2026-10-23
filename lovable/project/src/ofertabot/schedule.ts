import { DateTime } from "luxon";
export function scheduledUtc(value: string, zone: string, now = Date.now()): string | null {
  if (!DateTime.now().setZone(zone).isValid) throw new Error("Fuso horário inválido.");
  if (!value) return null;
  const d = DateTime.fromISO(value, { zone });
  if (!d.isValid || d.toFormat("yyyy-MM-dd'T'HH:mm") !== value || d.getPossibleOffsets().length > 1)
    throw new Error("Horário inexistente ou ambíguo neste fuso. Escolha outro horário.");
  if (d.toMillis() <= now) throw new Error("Escolha um horário futuro");
  return d.toUTC().toISO();
}
export function resolveEngineUrl(canonical: string | undefined, origin: string): string {
  if (canonical) {
    try {
      const url = new URL(canonical);
      if (url.protocol !== "https:") return "";
      return url.origin + "/api/public/engine-api";
    } catch {
      return "";
    }
  }
  const url = new URL(origin);
  if (
    url.protocol !== "https:" ||
    url.hostname.includes("preview") ||
    url.hostname.includes("-dev.") ||
    url.hostname.startsWith("id-")
  )
    return "";
  return url.origin + "/api/public/engine-api";
}
