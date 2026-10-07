import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nodus",
    short_name: "Nodus",
    description: "Desanuda las deudas entre negocios: cancela círculos de deuda y paga solo el saldo neto.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f5f5",
    theme_color: "#f5f5f5",
    lang: "es",
    icons: [{ src: "/icon.svg", type: "image/svg+xml", sizes: "any" }],
  };
}
