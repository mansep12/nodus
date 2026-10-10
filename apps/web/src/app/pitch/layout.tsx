import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Escenas del video", robots: { index: false } };

/** The scenes of the pitch video are for recording in development, not for the deployed app. */
export default function PitchLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
