import type { Metadata } from "next";
import { TeamView } from "@/components/team-view";

export const metadata: Metadata = { title: "Equipo" };

export default function Team() {
  return <TeamView />;
}
