import { notFound } from "next/navigation";

/** The screens with made-up data are for working on the design, not for the deployed app. */
export default function SampleLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
