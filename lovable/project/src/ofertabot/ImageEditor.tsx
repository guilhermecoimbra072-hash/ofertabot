import { useEffect, useRef, useState, type PointerEvent } from "react";
import { signed, upload, errorMessage } from "./api";
import type { Company } from "./model";
import { Button } from "./ui";
type Rect = { x: number; y: number; w: number; h: number };
export function PrivateImage({ path, alt = "Imagem da oferta" }: { path: string; alt?: string }) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setUrl("");
    setError("");
    const run = () =>
      signed(path)
        .then((u) => {
          if (live) {
            setUrl(u);
            setError("");
          }
        })
        .catch(() => {
          if (live) setError("Não foi possível carregar a imagem privada.");
        });
    void run();
    const t = setInterval(run, 90000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [path]);
  return url ? (
    <img
      src={url}
      alt={alt}
      className="offer-image"
      onError={() => {
        setUrl("");
        setError("Imagem privada indisponível.");
      }}
    />
  ) : (
    <span className="muted" role="status">
      {error || "Carregando imagem privada…"}
    </span>
  );
}
const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("Não foi possível abrir a imagem"));
    im.src = url;
  });
export function ImageEditor({
  company,
  path,
  onSave,
  onOriginal,
}: {
  company: Company;
  path: string | null;
  onSave: (path: string) => void;
  onOriginal: (path: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    base = useRef<HTMLImageElement | null>(null),
    logo = useRef<HTMLImageElement | null>(null),
    start = useRef<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null),
    [price, setPrice] = useState(""),
    [watermark, setWatermark] = useState(company.brand["watermark"] ?? ""),
    [contact, setContact] = useState(true),
    [showLogo, setShowLogo] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [ready, setReady] = useState(0),
    [color, setColor] = useState("#14583e"),
    [suggestions, setSuggestions] = useState<{ text: string; confidence: number; rect: Rect }[]>(
      [],
    );
  useEffect(() => {
    let active = true;
    base.current = null;
    setRect(null);
    setSuggestions([]);
    setError("");
    if (path)
      void signed(path)
        .then(loadImage)
        .then((im) => {
          if (active) {
            base.current = im;
            setReady((n) => n + 1);
          }
        })
        .catch((e) => {
          if (active) setError(errorMessage(e));
        });
    return () => {
      active = false;
    };
  }, [path]);
  useEffect(() => {
    let active = true;
    logo.current = null;
    if (company.brand["logo"])
      void signed(company.brand["logo"])
        .then(loadImage)
        .then((im) => {
          if (active) {
            logo.current = im;
            setReady((n) => n + 1);
          }
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [company.brand["logo"]]);
  function paint(selection = true) {
    const cv = canvas.current,
      im = base.current;
    if (!cv || !im) return;
    const scale = Math.min(1, 1600 / im.width);
    cv.width = Math.round(im.width * scale);
    cv.height = Math.round(im.height * scale);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const css = getComputedStyle(cv);
    const ink = css.getPropertyValue("--canvas-ink").trim(),
      outline = css.getPropertyValue("--canvas-outline").trim(),
      shadow = css.getPropertyValue("--canvas-shadow").trim(),
      band = css.getPropertyValue("--canvas-band").trim();
    ctx.drawImage(im, 0, 0, cv.width, cv.height);
    if (rect) {
      ctx.fillStyle = color;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.fillStyle = ink;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `bold ${Math.max(12, Math.min(rect.h * 0.6, (rect.w / Math.max(price.length, 1)) * 1.6))}px system-ui`;
      ctx.fillText(price, rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w * 0.94);
      if (selection) {
        ctx.strokeStyle = outline;
        ctx.lineWidth = 3;
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      }
    }
    if (showLogo && logo.current) {
      const l = logo.current,
        w = cv.width * 0.18;
      ctx.drawImage(l, cv.width - w - 20, 20, w, (w * l.height) / l.width);
    }
    if (watermark) {
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = ink;
      ctx.strokeStyle = shadow;
      ctx.lineWidth = 2;
      ctx.font = `bold ${cv.width * 0.055}px system-ui`;
      ctx.textAlign = "center";
      ctx.strokeText(watermark, cv.width / 2, cv.height * 0.55, cv.width * 0.9);
      ctx.fillText(watermark, cv.width / 2, cv.height * 0.55, cv.width * 0.9);
      ctx.restore();
    }
    if (contact) {
      const text = [company.brand["phone"], company.brand["instagram"]]
        .filter(Boolean)
        .join("  •  ");
      if (text) {
        ctx.fillStyle = band;
        ctx.fillRect(0, cv.height - 60, cv.width, 60);
        ctx.fillStyle = ink;
        ctx.font = `${Math.max(16, cv.width * 0.025)}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(text, cv.width / 2, cv.height - 24, cv.width * 0.95);
      }
    }
  }
  useEffect(() => paint(), [ready, rect, price, watermark, contact, showLogo, color]);
  const point = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(e.currentTarget.width, ((e.clientX - r.left) * e.currentTarget.width) / r.width),
      ),
      y: Math.max(
        0,
        Math.min(e.currentTarget.height, ((e.clientY - r.top) * e.currentTarget.height) / r.height),
      ),
    };
  };
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <h3>Imagem e identidade visual</h3>
      <p className="muted">
        O original é preservado. Arraste sobre o preço para cobri-lo com uma nova etiqueta.
      </p>
      <label className="file">
        Enviar imagem original
        <input
          aria-label="Enviar imagem original"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void run(async () => onOriginal(await upload(company.id, f)));
          }}
        />
      </label>
      {path && (
        <>
          <canvas
            ref={canvas}
            className="editor-canvas"
            aria-label="Selecione a área do novo preço"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              start.current = point(e);
            }}
            onPointerMove={(e) => {
              if (!start.current) return;
              const p = point(e),
                s = start.current;
              setRect({
                x: Math.min(s.x, p.x),
                y: Math.min(s.y, p.y),
                w: Math.abs(p.x - s.x),
                h: Math.abs(p.y - s.y),
              });
            }}
            onPointerUp={() => {
              start.current = null;
            }}
            onPointerCancel={() => {
              start.current = null;
            }}
          />
          <div className="form-grid">
            <label>
              Texto da etiqueta
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="R$ 129,90"
              />
            </label>
            <label>
              Cor da etiqueta
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </label>
            <label>
              Marca d’água
              <input value={watermark} onChange={(e) => setWatermark(e.target.value)} />
            </label>
          </div>
          <div className="actions">
            <label className="check">
              <input
                type="checkbox"
                checked={showLogo}
                onChange={(e) => setShowLogo(e.target.checked)}
              />
              Logo
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={contact}
                onChange={(e) => setContact(e.target.checked)}
              />
              Telefone e Instagram
            </label>
            <Button className="secondary" onClick={() => setRect(null)}>
              Limpar seleção
            </Button>
          </div>
          <div className="actions">
            <Button
              disabled={busy || !base.current}
              onClick={() =>
                void run(async () => {
                  const cv = canvas.current;
                  if (!cv) throw new Error("Imagem ainda não carregada.");
                  paint(false);
                  try {
                    const blob = await new Promise<Blob>((resolve, reject) =>
                      cv.toBlob(
                        (b) => (b ? resolve(b) : reject(new Error("Erro ao salvar"))),
                        "image/png",
                      ),
                    );
                    onSave(await upload(company.id, blob));
                  } finally {
                    paint();
                  }
                })
              }
            >
              Salvar imagem final
            </Button>
            <Button
              className="secondary"
              disabled={busy || !base.current}
              onClick={() =>
                void run(async () => {
                  const im = base.current,
                    cv = canvas.current;
                  if (!im || !cv) throw new Error("Imagem ainda não carregada.");
                  const { recognizePrices } = await import("./ocr");
                  const regions = await recognizePrices(im.src),
                    scale = cv.width / im.width;
                  setSuggestions(
                    regions.map((r) => ({
                      text: r.text,
                      confidence: r.confidence,
                      rect: {
                        x: r.box.x0 * scale,
                        y: r.box.y0 * scale,
                        w: (r.box.x1 - r.box.x0) * scale,
                        h: (r.box.y1 - r.box.y0) * scale,
                      },
                    })),
                  );
                  if (!regions.length)
                    setError("OCR não encontrou preços. A seleção manual continua disponível.");
                })
              }
            >
              Sugerir regiões com OCR
            </Button>
          </div>
          {!!suggestions.length && (
            <div className="notice">
              OCR é uma sugestão: revise texto e região antes de salvar.
              {suggestions.map((s, i) => (
                <Button
                  key={i}
                  className="secondary"
                  onClick={() => {
                    setPrice(s.text);
                    setRect(s.rect);
                  }}
                >
                  {s.text} · confiança {Math.round(s.confidence)}%
                </Button>
              ))}
            </div>
          )}
        </>
      )}
      {busy && <p role="status">Processando imagem…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
