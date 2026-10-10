"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { configureSigner } from "./actions";
import { del, fetchSession, get, post } from "./api";
import { describeCredential, getKit, seedCredentials } from "./kit";
import {
  chooseSoftwarePasskey,
  examplePasskey,
  forgetExamplePasskey,
  isSoftwarePasskey,
  keepExamplePasskey,
  softwareAuthenticator,
} from "./software-passkey";
import type { ExampleEntry, KitCredential, Role, SessionView } from "./types";

export interface Session {
  /** The smart account of the business. */
  address: string;
  /** The passkey the browser entered with. */
  credentialId: string;
  role: Role;
  name: string | null;
  /** An example business, handed out to try the app: its neighbours answer by themselves. */
  example: boolean;
}

interface SessionContextValue {
  /** False until we know whether this device already has a session. */
  ready: boolean;
  session: Session | null;
  /**
   * The browser still holds the account's passkey but the API session ended:
   * one touch of the passkey opens it again, without going through the welcome.
   */
  confirming: { credentialId: string; address: string } | null;
  /** Creates a passkey and the smart account it controls. */
  create: (name: string) => Promise<void>;
  /** Enters with a passkey this device already has, or any passkey of a known account. */
  enter: (credentialId?: string) => Promise<void>;
  /** Enters an example business: the one this browser was handed before, or a new one. */
  tryExample: () => Promise<void>;
  /** Opens the API session again with the passkey the kit already trusts. */
  confirm: () => Promise<void>;
  /** The API no longer honours the session: ask for the passkey again. */
  expire: () => void;
  leave: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** A fresh assertion by the passkey over a challenge from our API. */
async function assert(challenge: string, rpId: string, credentialId?: string) {
  if (isSoftwarePasskey(credentialId)) {
    if (credentialId) chooseSoftwarePasskey(credentialId);
    return softwareAuthenticator.startAuthentication({
      optionsJSON: { challenge, allowCredentials: credentialId ? [{ id: credentialId }] : undefined },
    });
  }
  return startAuthentication({
    optionsJSON: {
      challenge,
      rpId,
      userVerification: "required",
      timeout: 60_000,
      allowCredentials: credentialId ? [{ id: credentialId, type: "public-key" }] : undefined,
    },
  });
}

/** Opens the API session with a passkey and gives the kit what it needs to use the account here. */
async function openSession(credentialId?: string): Promise<SessionView> {
  const { challenge, rpId } = await get<{ challenge: string; rpId: string }>("/api/session/challenge");
  const assertion = await assert(challenge, rpId, credentialId);
  const view = await post<SessionView>("/api/session", { assertion });
  await seedCredentials(view.credentials);
  await getKit().connectWallet({ credentialId: view.credentialId, contractId: view.address });
  return view;
}

/** Tells the API about a passkey this browser holds, so that it can be used from another one. */
async function publishCredential(credentialId: string, label: string) {
  const record = await describeCredential(credentialId);
  if (!record) return;
  await post("/api/credentials", {
    address: record.contractId,
    credentialId: record.credentialId,
    publicKey: record.publicKey,
    contextRuleId: record.contextRuleId,
    isPrimary: record.isPrimary,
    label: record.label || label,
    birth:
      record.birthWasmHash && record.creationTransactionHash && record.creationLedger && record.birthConstructorArgsHash
        ? {
            wasmHash: record.birthWasmHash,
            transactionHash: record.creationTransactionHash,
            ledger: record.creationLedger,
            constructorArgsHash: record.birthConstructorArgsHash,
          }
        : undefined,
  }).catch(() => undefined);
}

const toSession = (view: Pick<SessionView, "address" | "credentialId" | "role" | "name" | "example">): Session => ({
  address: view.address,
  credentialId: view.credentialId,
  role: view.role,
  name: view.name,
  example: view.example,
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [confirming, setConfirming] = useState<{ credentialId: string; address: string } | null>(null);

  useEffect(() => {
    (async () => {
      const [kit, api] = await Promise.all([
        getKit()
          .connectWallet()
          .catch(() => null),
        fetchSession().catch(() => ({ session: null })),
      ]);
      if (api.session?.example && !isSoftwarePasskey(api.session.credentialId)) {
        // An example business whose key this browser no longer keeps cannot sign anything: back to the welcome.
        await Promise.all([getKit().disconnect(), del("/api/session").catch(() => undefined)]);
      } else if (api.session && kit && api.session.address === kit.contractId) {
        setSession(toSession(api.session));
        void publishCredential(kit.credentialId, "Este dispositivo");
      } else if (api.session) {
        // The API knows the browser but the kit does not: give it the account's passkeys.
        try {
          await seedCredentials(await get<KitCredential[]>("/api/credentials"));
          await getKit().connectWallet({ credentialId: api.session.credentialId, contractId: api.session.address });
          setSession(toSession(api.session));
        } catch {
          await del("/api/session").catch(() => undefined);
        }
      } else if (kit) {
        void publishCredential(kit.credentialId, "Este dispositivo");
        setConfirming({ credentialId: kit.credentialId, address: kit.contractId });
      }
    })()
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    configureSigner({ ruleId: 0 });
    if (session)
      void getKit()
        .connectWallet()
        .then((kit) => kit?.credential?.contextRuleId !== undefined && configureSigner({ ruleId: kit.credential.contextRuleId }));
  }, [session]);

  const enter = useCallback(async (credentialId?: string) => {
    const view = await openSession(credentialId);
    setConfirming(null);
    setSession(toSession(view));
  }, []);

  const tryExample = useCallback(async () => {
    const claim = async () => {
      const entry = await post<ExampleEntry>("/api/example", {});
      keepExamplePasskey(entry);
      return entry.credentialId;
    };
    const kept = examplePasskey();
    try {
      await enter(kept?.credentialId ?? (await claim()));
    } catch (error) {
      if (!kept) throw error;
      // The one it had may be gone with the installation's data: a new one takes its place.
      forgetExamplePasskey();
      await enter(await claim());
    }
  }, [enter]);

  const create = useCallback(
    async (name: string) => {
      const wallet = await getKit().createWallet("Nodus", name, { autoSubmit: true });
      if (!wallet.submitResult?.success) throw wallet.submitResult?.error ?? new Error("No se pudo crear la cuenta.");
      await publishCredential(wallet.credentialId, "Este dispositivo");
      await enter(wallet.credentialId);
      const named = await post<{ name: string }>("/api/businesses", { name });
      setSession((current) => (current ? { ...current, name: named.name } : current));
    },
    [enter],
  );

  const confirm = useCallback(async () => {
    if (confirming) await enter(confirming.credentialId);
  }, [confirming, enter]);

  const expire = useCallback(() => {
    setSession((current) => {
      if (current) setConfirming({ credentialId: current.credentialId, address: current.address });
      return null;
    });
  }, []);

  const leave = useCallback(async () => {
    await Promise.all([getKit().disconnect(), del("/api/session").catch(() => undefined)]);
    setConfirming(null);
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ ready, session, confirming, create, enter, tryExample, confirm, expire, leave }),
    [ready, session, confirming, create, enter, tryExample, confirm, expire, leave],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession needs a SessionProvider");
  return value;
}
