import type { Metadata } from "next";
import { InvitationView } from "@/components/invitation-view";

export const metadata: Metadata = { title: "Invitación" };

export default async function Invitation({ params }: PageProps<"/invitacion/[id]">) {
  const { id } = await params;
  return <InvitationView id={id} />;
}
