"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { xdr } from "@stellar/stellar-sdk";
import { createCallContractContext, createDefaultContext, createWebAuthnSigner } from "smart-account-kit";
import { useContext, useEffect, useState } from "react";
import { explain } from "@/lib/actions";
import { del, get, patch, post } from "@/lib/api";
import { ALLOWLIST_POLICY, CLERK_FUNCTIONS, NODUS_CONTRACT } from "@/lib/config";
import { TEAM } from "@/lib/fixtures";
import { formatDate } from "@/lib/format";
import { RehearsalContext, useOrigin } from "@/lib/hooks";
import { getKit } from "@/lib/kit";
import { useNodus } from "@/lib/nodus";
import { disableNotices, enableNotices, noticesEnabled, noticesState } from "@/lib/push";
import { WEBAUTHN_VERIFIER } from "@nodus/stellar";
import type { InvitationView as Invitation, Role, TeamView as Team } from "@/lib/types";
import { CopyButton, Field } from "./fields";
import { Confirm, Sheet, useToast } from "./overlays";
import { Button, Card, Chip, Empty, Eyebrow, PageHeader, Problem } from "./ui";

const ROLES: Record<Role, { title: string; what: string }> = {
  owner: {
    title: "Dispositivo de respaldo",
    what: "Puede todo lo que puedes tú: firmar círculos, pagar, registrar. Es tu llave si pierdes este dispositivo.",
  },
  clerk: { title: "Contador", what: "Registra, acepta y rechaza deudas. Nunca firma liquidaciones, paga ni anula lo que te deben." },
};

/** The passkeys that sign for the business, and the invitations to add more. */
export function TeamView() {
  const { state, role } = useNodus();
  const queryClient = useQueryClient();
  const notify = useToast();
  const rehearsal = useContext(RehearsalContext);
  const fetched = useQuery({ queryKey: ["team"], queryFn: () => get<Team>("/api/team"), refetchInterval: 5_000, enabled: !rehearsal });
  const team = rehearsal ? { data: TEAM } : fetched;
  const [inviting, setInviting] = useState<Role | null>(null);
  const [label, setLabel] = useState("");
  const [removing, setRemoving] = useState<Team["credentials"][number] | null>(null);
  const origin = useOrigin();

  const invite = useMutation({
    mutationFn: () => post<Invitation>("/api/invitations", { role: inviting, label: label.trim() }),
    onSuccess: () => {
      setLabel("");
      setInviting(null);
      queryClient.invalidateQueries({ queryKey: ["team"] });
      notify("Invitación creada. Compártela con el enlace.");
    },
  });

  /** The owner adds the invitee's passkey to the account, under a rule fit for its role. */
  const add = useMutation({
    mutationFn: async (invitation: Invitation) => {
      if (!invitation.credentialId || !invitation.publicKey) throw new Error("La invitación todavía no tiene una passkey.");
      const kit = getKit();
      const signer = createWebAuthnSigner(
        WEBAUTHN_VERIFIER,
        Buffer.from(invitation.publicKey, "hex"),
        // The Buffer of the browser does not read base64url, only the plain alphabet.
        Buffer.from(invitation.credentialId.replaceAll("-", "+").replaceAll("_", "/"), "base64"),
      );
      const policies = new Map<string, unknown>();
      let context = createDefaultContext();
      if (invitation.role === "clerk") {
        if (!ALLOWLIST_POLICY) throw new Error("Esta instalación no tiene la política de contador.");
        context = createCallContractContext(NODUS_CONTRACT);
        policies.set(
          ALLOWLIST_POLICY,
          xdr.ScVal.scvMap([
            new xdr.ScMapEntry({
              key: xdr.ScVal.scvSymbol("functions"),
              val: xdr.ScVal.scvVec(CLERK_FUNCTIONS.map((name) => xdr.ScVal.scvSymbol(name))),
            }),
          ]),
        );
      }
      const transaction = await kit.rules.add(
        context,
        invitation.label.slice(0, 20) || ROLES[invitation.role].title.slice(0, 20),
        [signer],
        policies,
      );
      const result = await kit.signAndSubmitAdmin(transaction);
      if (!result.success) throw result.error;
      const rule = transaction.result;
      await patch(`/api/invitations/${invitation.id}`, { ruleId: rule.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      notify("Passkey agregada a la cuenta.");
    },
  });

  /** The owner takes a passkey out of the account, rule and all. */
  const remove = useMutation({
    mutationFn: async (credential: Team["credentials"][number]) => {
      const kit = getKit();
      const result = await kit.signAndSubmitAdmin(await kit.rules.remove(credential.contextRuleId));
      if (!result.success) throw result.error;
      await del("/api/team", { credentialId: credential.credentialId });
    },
    onSuccess: () => {
      setRemoving(null);
      queryClient.invalidateQueries({ queryKey: ["team"] });
      notify("Passkey quitada de la cuenta.");
    },
  });

  const withdraw = useMutation({
    mutationFn: (invitation: Invitation) => del(`/api/invitations/${invitation.id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team"] }),
  });

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Equipo"
        title={
          <>
            Quién firma por <em>{state.me.name ?? "tu negocio"}</em>.
          </>
        }
      >
        Cada passkey vive en un dispositivo. Una de respaldo te salva si pierdes el teléfono; la de un contador lleva los libros sin poder
        mover dinero. Todo queda escrito en tu cuenta en la red, no en Nodus.
      </PageHeader>

      <Notices publicKey={state.push} />

      <section className="flex flex-col gap-4">
        <h2 className="eyebrow text-muted">Passkeys de la cuenta</h2>
        <Card padding="none">
          <ul className="divide-y divide-hairline-soft">
            {(team.data?.credentials ?? []).map((credential) => (
              <li key={credential.credentialId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {credential.label || (credential.isPrimary ? "Passkey original" : "Passkey")}
                    {credential.current && <span className="ml-2 text-caption font-normal text-muted">esta sesión</span>}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-caption text-muted">
                    <Chip tone={credential.role === "owner" ? "neutral" : "credit"}>
                      {credential.role === "owner" ? "Dueño" : "Contador"}
                    </Chip>
                    <span>desde {formatDate(credential.createdAt)}</span>
                  </p>
                </div>
                {role === "owner" && !credential.isPrimary && !credential.current && (
                  <Button variant="quiet" onClick={() => setRemoving(credential)}>
                    Quitar
                  </Button>
                )}
              </li>
            ))}
            {team.data && team.data.credentials.length === 0 && (
              <li className="px-6 py-4 text-sm text-muted">
                Todavía no conocemos las passkeys de esta cuenta. Entra de nuevo para registrar la tuya.
              </li>
            )}
          </ul>
        </Card>
      </section>

      {role === "owner" && (
        <section className="flex flex-col gap-4">
          <h2 className="eyebrow text-muted">Agregar una passkey</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {(Object.keys(ROLES) as Role[]).map((kind) => (
              <Card key={kind} className="flex flex-col gap-3">
                <h3 className="display text-2xl">{ROLES[kind].title}</h3>
                <p className="text-body-sm text-body">{ROLES[kind].what}</p>
                <Button
                  variant="outline"
                  className="self-start"
                  onClick={() => setInviting(kind)}
                  disabled={kind === "clerk" && !ALLOWLIST_POLICY}
                >
                  {kind === "owner" ? "Invitar un dispositivo" : "Invitar un contador"}
                </Button>
              </Card>
            ))}
          </div>
          <p className="text-caption text-muted">
            Se crea un enlace. Quien lo abra en su dispositivo creará ahí su passkey; después la agregas a la cuenta con la tuya.
          </p>
        </section>
      )}

      {team.data && team.data.invitations.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="eyebrow text-muted">Invitaciones</h2>
          <Card padding="none">
            <ul className="divide-y divide-hairline-soft">
              {team.data.invitations.map((invitation) => (
                <li key={invitation.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {invitation.label} <span className="font-normal text-muted">· {ROLES[invitation.role].title.toLowerCase()}</span>
                    </p>
                    <p className="mt-1 text-caption text-muted">
                      {invitation.status === "pending" &&
                        `Esperando que abra el enlace y cree su passkey. Vence el ${formatDate(invitation.expiresAt)}.`}
                      {invitation.status === "registered" && "Ya creó su passkey. Falta que la agregues a la cuenta con la tuya."}
                      {invitation.status === "added" && "Agregada a la cuenta."}
                    </p>
                  </div>
                  {invitation.status === "pending" && origin && (
                    <CopyButton text={`${origin}/invitacion/${invitation.id}`} label="Copiar enlace" copied="Enlace copiado" />
                  )}
                  {invitation.status === "registered" && role === "owner" && (
                    <Button busy={add.isPending && add.variables?.id === invitation.id} onClick={() => add.mutate(invitation)}>
                      Agregar con passkey
                    </Button>
                  )}
                  {invitation.status !== "added" && role === "owner" && (
                    <Button
                      variant="quiet"
                      busy={withdraw.isPending && withdraw.variables?.id === invitation.id}
                      onClick={() => withdraw.mutate(invitation)}
                    >
                      Retirar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
          {add.error && <Problem>{explain(add.error)}</Problem>}
        </section>
      )}

      {team.data && team.data.credentials.length <= 1 && team.data.invitations.length === 0 && role === "owner" && (
        <Empty title="Una sola llave para todo">
          Si pierdes este dispositivo, pierdes la cuenta. Invita un dispositivo de respaldo ahora: toma un minuto.
        </Empty>
      )}

      <Sheet
        open={inviting !== null}
        onClose={() => setInviting(null)}
        title={inviting ? ROLES[inviting].title : ""}
        description={inviting ? ROLES[inviting].what : undefined}
      >
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            invite.mutate();
          }}
        >
          <Field
            label={inviting === "clerk" ? "Nombre de la persona" : "Nombre del dispositivo"}
            hint="Para reconocer la passkey en esta lista."
          >
            <input
              required
              minLength={2}
              maxLength={40}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              className="field"
              placeholder={inviting === "clerk" ? "María, contadora" : "Mi teléfono"}
            />
          </Field>
          <Problem>{invite.error?.message}</Problem>
          <Button type="submit" size="lg" busy={invite.isPending} className="self-start">
            Crear enlace de invitación
          </Button>
        </form>
      </Sheet>

      <Confirm
        open={removing !== null}
        title="¿Quitar esta passkey?"
        action="Quitar con passkey"
        busy={remove.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing)}
      >
        {removing?.label || "Esa passkey"} dejará de poder firmar por la cuenta. Quien la tenga tendrá que ser invitado de nuevo.
        {remove.error && <Problem>{explain(remove.error)}</Problem>}
      </Confirm>
    </div>
  );
}

/** Whether this browser gets told when something waits for the business. */
function Notices({ publicKey }: { publicKey: string | null }) {
  const notify = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const support = noticesState();
  useEffect(() => {
    noticesEnabled().then(setEnabled);
  }, []);
  const toggle = useMutation({
    mutationFn: async () => {
      if (enabled) {
        await disableNotices();
        return false;
      }
      if (!publicKey) throw new Error("Esta instalación no envía avisos.");
      return enableNotices(publicKey);
    },
    onSuccess: (now) => {
      setEnabled(now);
      notify(now ? "Te avisaremos cuando algo espere tu firma." : "Avisos apagados en este navegador.");
    },
  });
  if (!publicKey || support === "unsupported") return null;
  return (
    <Card className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
      <div>
        <Eyebrow>Avisos</Eyebrow>
        <p className="mt-1 text-body-sm text-body">
          {enabled
            ? "Este navegador avisa cuando una deuda o un círculo espera tu firma, aunque Nodus esté cerrado."
            : "Que este navegador avise cuando una deuda o un círculo espere tu firma, aunque Nodus esté cerrado."}
        </p>
        {support === "denied" && (
          <p className="mt-1 text-caption text-muted">
            El navegador tiene los avisos bloqueados para este sitio; permítelos en su configuración.
          </p>
        )}
      </div>
      <Button
        variant={enabled ? "outline" : "primary"}
        busy={toggle.isPending}
        disabled={support === "denied"}
        onClick={() => toggle.mutate()}
      >
        {enabled ? "Apagar avisos" : "Activar avisos"}
      </Button>
      {toggle.error && <Problem>{toggle.error.message}</Problem>}
    </Card>
  );
}
