"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { useMutation, useQuery } from "@tanstack/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { explain } from "@/lib/actions";
import { get, post } from "@/lib/api";
import { SOFTWARE_PASSKEYS } from "@/lib/config";
import { SessionProvider, useSession } from "@/lib/session";
import { softwareAuthenticator } from "@/lib/software-passkey";
import type { InvitationView as Invitation } from "@/lib/types";
import { Button, Chip, Knot, Logo, Problem } from "./ui";

const ROLE_WORDS = {
  owner: "firmar por él en todo, como dispositivo de respaldo",
  clerk: "llevar sus libros como contador: registrar, aceptar y rechazar deudas, sin firmar liquidaciones",
};

/** The page an invitation link opens: create a passkey here for someone else's business, then enter with it. */
export function InvitationView({ id }: { id: string }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <Screen id={id} />
      </SessionProvider>
    </QueryClientProvider>
  );
}

function Screen({ id }: { id: string }) {
  const router = useRouter();
  const session = useSession();
  const invitation = useQuery({
    queryKey: ["invitation", id],
    queryFn: () => get<Invitation & { business: string }>(`/api/invitations/${id}`),
    refetchInterval: (query) => (query.state.data?.status === "registered" ? 4_000 : false),
  });
  const [credentialId, setCredentialId] = useState<string | null>(null);

  /** Creates the passkey on this device and hands its public key to the invitation. */
  const register = useMutation({
    mutationFn: async () => {
      const { challenge, rpId } = await get<{ challenge: string; rpId: string }>("/api/session/challenge");
      const name = `${invitation.data?.business ?? "Nodus"} — ${invitation.data?.label ?? ""}`.trim();
      const registration = SOFTWARE_PASSKEYS
        ? await softwareAuthenticator.startRegistration({ optionsJSON: { challenge, user: { name } } })
        : await startRegistration({
            optionsJSON: {
              challenge,
              rp: { id: rpId, name: "Nodus" },
              user: { id: challenge, name, displayName: name },
              pubKeyCredParams: [{ alg: -7, type: "public-key" }],
              authenticatorSelection: { residentKey: "required", userVerification: "required" },
              attestation: "none",
              timeout: 60_000,
            },
          });
      await post(`/api/invitations/${id}`, {
        registration: {
          id: registration.id,
          response: { clientDataJSON: registration.response.clientDataJSON, publicKey: registration.response.publicKey },
        },
      });
      return registration.id;
    },
    onSuccess: (newId) => {
      setCredentialId(newId);
      invitation.refetch();
    },
  });

  const enter = useMutation({
    mutationFn: () => session.enter(credentialId ?? undefined),
    onSuccess: () => router.push("/"),
  });

  const data = invitation.data;
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-6 py-12">
      <Logo className="text-title" />
      {invitation.error ? (
        <Problem>{invitation.error.message}</Problem>
      ) : !data ? (
        <p className="flex items-center gap-3 text-muted">
          <Knot className="size-6 animate-pulse text-ink" strokeWidth={1.5} /> Leyendo la invitación…
        </p>
      ) : (
        <>
          <Chip>{data.role === "owner" ? "Dispositivo de respaldo" : "Contador"}</Chip>
          <h1 className="display text-4xl">
            <em>{data.business}</em> te invita a {ROLE_WORDS[data.role]}.
          </h1>
          <p className="text-body">
            La passkey se crea en este dispositivo y queda guardada aquí: firmas con tu huella o tu rostro. {data.business} la agregará a su
            cuenta con la suya; hasta entonces, no puedes entrar.
          </p>

          {data.status === "pending" && (
            <Button size="lg" className="self-start" busy={register.isPending} onClick={() => register.mutate()}>
              Crear mi passkey para {data.business}
            </Button>
          )}
          {data.status === "registered" && (
            <p className="rounded-2xl border border-hairline bg-card px-5 py-4 text-sm text-body">
              Tu passkey está lista. Falta que {data.business} la agregue a su cuenta; esta página se actualizará sola cuando lo haga.
            </p>
          )}
          {data.status === "added" && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-body">{data.business} ya agregó tu passkey. Entra con ella.</p>
              <Button size="lg" className="self-start" busy={enter.isPending} onClick={() => enter.mutate()}>
                Entrar con mi passkey
              </Button>
            </div>
          )}
          {data.status === "revoked" && <Problem>Esta invitación fue retirada.</Problem>}
          {register.error && <Problem>{explain(register.error)}</Problem>}
          {enter.error && <Problem>{explain(enter.error)}</Problem>}
        </>
      )}
    </main>
  );
}
