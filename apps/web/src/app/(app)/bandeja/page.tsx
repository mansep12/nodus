import type { Metadata } from "next";
import { InboxView } from "@/components/inbox-view";

export const metadata: Metadata = { title: "Bandeja" };

export default function Inbox() {
  return <InboxView />;
}
