import { z } from "zod";
export const companySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  role: z.string(),
  plan: z.string(),
  group_limit: z.number(),
  timezone: z.string(),
  brand: z.record(z.string()).default({}),
  settings: z.object({
    send_enabled: z.boolean(),
    min_interval_seconds: z.number(),
    late_after_seconds: z.number(),
    max_attempts: z.number(),
    ai_prompt: z
      .string()
      .nullable()
      .transform((v) => v ?? ""),
  }),
});
export const connectionSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  status: z.string(),
  last_seen_at: z.string().nullable(),
  qr: z.string().nullable(),
  qr_expires_at: z.string().nullable(),
});
export const groupSchema = z.object({
  id: z.string().uuid(),
  connection_id: z.string().uuid(),
  jid: z.string(),
  name: z.string(),
  is_source: z.boolean(),
  is_destination: z.boolean(),
});
export const offerSchema = z.object({
  id: z.string().uuid(),
  group_id: z.string().uuid(),
  connection_id: z.string().uuid(),
  message_id: z.string(),
  received_at: z.string(),
  original_text: z.string(),
  original_images: z.array(z.string()),
  edited_text: z.string(),
  edited_image: z.string().nullable(),
  price_minor: z.string().nullable(),
  currency: z.string(),
  status: z.string(),
  version: z.number(),
  media_kind: z.string(),
  media_status: z.string(),
});
export const publicationSchema = z.object({
  id: z.string().uuid(),
  offer_id: z.string().uuid(),
  group_id: z.string().uuid(),
  text: z.string(),
  image: z.string().nullable(),
  status: z.string(),
  scheduled_at: z.string(),
  timezone: z.string(),
  attempts: z.number(),
  error_code: z.string().nullable(),
  transport_id: z.string().nullable(),
  created_at: z.string(),
  on_hold: z.boolean(),
  send_started_at: z.string().nullable(),
});
export const snapshotSchema = z.object({
  companies: z.array(companySchema),
  company: companySchema.optional(),
  connections: z.array(connectionSchema).default([]),
  groups: z.array(groupSchema).default([]),
  offers: z.array(offerSchema).default([]),
  publications: z.array(publicationSchema).default([]),
  audit: z
    .array(
      z.object({
        id: z.string(),
        event: z.string(),
        entity_id: z.string().nullable(),
        created_at: z.string(),
        actor_id: z.string().nullable(),
      }),
    )
    .default([]),
  templates: z.array(z.object({ id: z.string(), name: z.string(), body: z.string() })).default([]),
  members: z
    .array(z.object({ user_id: z.string(), email: z.string().nullable(), role: z.string() }))
    .default([]),
  stats: z.record(z.number()).optional(),
});
export type Company = z.infer<typeof companySchema>;
export type Connection = z.infer<typeof connectionSchema>;
export type Group = z.infer<typeof groupSchema>;
export type Offer = z.infer<typeof offerSchema>;
export type Publication = z.infer<typeof publicationSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export const empty: Snapshot = {
  companies: [],
  connections: [],
  groups: [],
  offers: [],
  publications: [],
  audit: [],
  templates: [],
  members: [],
};
export const labels: Record<string, string> = {
  pending: "Pendente",
  approved: "Aprovada",
  rejected: "Rejeitada",
  queued: "Na fila",
  scheduled: "Agendada",
  processing: "Em processamento",
  sent: "Enviada",
  failed: "Com falha",
  uncertain: "Resultado incerto",
  cancelled: "Cancelada",
  connected: "Conectado",
  disconnected: "Desconectado",
  awaiting_qr: "Aguardando vinculação",
  revoked: "Revogado",
  owner: "Proprietário",
  admin: "Administrador",
  editor: "Editor",
  viewer: "Leitor",
  basic: "Básico",
  professional: "Profissional",
  enterprise: "Empresarial",
};
export const online = (c: Connection, now = Date.now()) =>
  !!c.last_seen_at && now - Date.parse(c.last_seen_at) < 90000 && c.status !== "revoked";
export const destinationAvailable = (g: Group, connections: Connection[]) =>
  g.is_destination &&
  !g.is_source &&
  connections.some((c) => c.id === g.connection_id && c.status !== "revoked");
export const editable = (c: Company) => ["owner", "admin", "editor"].includes(c.role);
export const administrator = (c: Company) => ["owner", "admin"].includes(c.role);
