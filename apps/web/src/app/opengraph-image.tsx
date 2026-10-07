import { ImageResponse } from "next/og";

export const alt = "Nodus desanuda las deudas entre negocios";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The card that shows when a link to Nodus is shared. */
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "#f5f5f5",
        color: "#0c0a09",
        fontFamily: "serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 36 }}>
        <div style={{ width: 40, height: 40, borderRadius: 20, border: "3px solid #0c0a09" }} />
        Nodus
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontSize: 84, fontWeight: 300, lineHeight: 1.05, letterSpacing: -2 }}>Desanuda las deudas entre negocios.</div>
        <div style={{ fontSize: 34, color: "#4e4e4e", fontFamily: "sans-serif" }}>
          Encuentra los círculos de deuda, los cancela a la vez y mueve solo el saldo neto. Sobre Stellar.
        </div>
      </div>
    </div>,
    size,
  );
}
