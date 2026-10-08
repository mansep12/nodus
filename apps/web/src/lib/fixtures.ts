/**
 * Made-up states of Nodus, to look at every screen without accounts or a
 * network: a business with a full network, the same one as it signs and
 * after, a business that just joined and one with more relations than fit in
 * a star. Going from one of the first three to the next plays what happens
 * in between, since the screens stay up.
 * They are shaped the way the API answers: only the business's own debts,
 * and the other parties of a circle without a name.
 */
import type {
  BusinessView,
  CircleView,
  ObligationStatus,
  ObligationView,
  PartyView,
  SettlementOption,
  SettlementView,
  StateView,
  TeamView,
} from "./types";

const UNIT = 10_000_000n;
const units = (amount: number) => (BigInt(amount) * UNIT).toString();
const LEDGER = 1_482_300;
const hash = (seed: string) => (seed + "c41d9e7a05b36f82").repeat(4).slice(0, 64);

/** An address that looks like a smart account's. */
function business(name: string): BusinessView {
  const letters = name
    .normalize("NFD")
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, "");
  return { name, address: `C${letters}${"QX7N4KD2TLA5WZ3RJB6MHE".repeat(3)}`.slice(0, 56) };
}

const me = business("Panadería Sur");
const molino = business("Molino Andes");
const fletes = business("Fletes Ruta 5");
const lacteos = business("Lácteos Ñuble");
const cafe = business("Café Cordillera");
const donTito = business("Minimarket Don Tito");
const imprenta = business("Imprenta Bellavista");
const frutos = business("Frutos del Maule");
const ferreteria = business("Ferretería El Roble");
const vina = business("Viña Los Boldos");
const austral = business("Distribuidora Austral");
const taller = business("Taller Lo Prado");
const aserradero = business("Aserradero Lonquimay");
const envases = business("Envases Biobío");
const agricola = business("Agrícola Santa Elena");

const CAST = [
  me,
  molino,
  fletes,
  lacteos,
  cafe,
  donTito,
  imprenta,
  frutos,
  ferreteria,
  vina,
  austral,
  taller,
  aserradero,
  envases,
  agricola,
];

interface DebtOptions {
  status?: ObligationStatus;
  due?: Date;
  reference?: boolean;
}

/** Builds the debts of a state, numbering them as the contract would. */
function ledgerBook() {
  const obligations: ObligationView[] = [];
  const owe = (debtor: BusinessView, creditor: BusinessView, amount: number, { status = "accepted", due, reference }: DebtOptions = {}) => {
    const obligation: ObligationView = {
      id: String(obligations.length + 1),
      debtor: debtor.address,
      creditor: creditor.address,
      amount: status === "settled" ? "0" : units(amount),
      originalAmount: units(amount),
      paid: "0",
      status,
      registeredAt: new Date(Date.UTC(2026, 8, 20 + (obligations.length % 14), 13, 30)).toISOString(),
      dueAt: due?.toISOString() ?? null,
      reference: reference ? hash(String(obligations.length)) : null,
      note: reference ? `Factura ${1_040 + obligations.length}` : null,
    };
    obligations.push(obligation);
    return obligation;
  };
  return { obligations, owe };
}

/** Everyone the viewer deals with in `links`: itself and the ones on either side. */
function neighbours(links: ObligationView[]): Set<string> {
  const known = new Set([me.address]);
  for (const link of links) {
    if (link.debtor === me.address) known.add(link.creditor);
    if (link.creditor === me.address) known.add(link.debtor);
  }
  return known;
}

/**
 * What settling the debts `links` means, each one owed by a party to the
 * next, seen by `me`: the parties it does not deal with are anonymous.
 * `cancel` is how much of every debt gets cancelled: all of it by default.
 */
function settle(links: ObligationView[], signed: string[], cancel?: number): SettlementOption {
  const known = neighbours(links);
  const aliases = new Map<string, string>();
  const shown = (address: string) => {
    if (known.has(address)) return address;
    let alias = aliases.get(address);
    if (!alias) aliases.set(address, (alias = `anon:${hash(address).slice(0, 12)}`));
    return alias;
  };
  const cleared = links.map((link) => (cancel === undefined ? BigInt(link.originalAmount) : BigInt(units(cancel))));
  const parties = links.map((link, index): PartyView => {
    const owesLess = cleared[index]!;
    const owedLess = cleared[(index + links.length - 1) % links.length]!;
    const isKnown = known.has(link.debtor);
    return {
      address: shown(link.debtor),
      known: isKnown,
      owesLess: isKnown ? owesLess.toString() : "0",
      owedLess: isKnown ? owedLess.toString() : "0",
      net: isKnown ? (owedLess - owesLess).toString() : "0",
      signed: signed.includes(link.debtor),
    };
  });
  const clearings = links.map((link, index) => ({ id: link.id, amount: cleared[index]!.toString() }));
  return {
    key: clearings.map((clearing) => `${clearing.id}:${clearing.amount}`).join(","),
    clearings,
    parties,
    edges: links.map((link, index) => ({
      from: shown(link.debtor),
      to: shown(link.creditor),
      amount: link.debtor === me.address || link.creditor === me.address ? cleared[index]!.toString() : null,
    })),
    cleared: cleared.reduce((sum, amount) => sum + amount, 0n).toString(),
    moved: links
      .reduce((sum, _, index) => {
        const net = cleared[(index + links.length - 1) % links.length]! - cleared[index]!;
        return net > 0n ? sum + net : sum;
      }, 0n)
      .toString(),
  };
}

const everyone = (links: ObligationView[]) => links.map((link) => link.debtor);

function settled(links: ObligationView[], txHash: string, minutesAgo: number, cancel?: number): SettlementView {
  return {
    txHash,
    closedAt: new Date(Date.UTC(2026, 9, 6, 15, 0) - minutesAgo * 60_000).toISOString(),
    circle: {
      ...settle(links, everyone(links), cancel),
      proposal: { id: txHash, status: "settled", expirationLedger: LEDGER, txHash },
    },
  };
}

const base = {
  contract: business("Nodus contrato").address,
  token: business("Token de prueba").address,
  ledger: LEDGER,
  syncedAt: new Date(Date.UTC(2026, 9, 6, 15, 0)).toISOString(),
  faucet: true,
  cutShort: false,
  push: null,
  network: { businesses: CAST.length, settlements: 41, cleared: units(128_430), moved: units(9_870) },
};

/** The viewer's own debts, which is all the API hands out. */
const onlyMine = (obligations: ObligationView[]) => obligations.filter((o) => o.debtor === me.address || o.creditor === me.address);

/** The businesses the viewer deals with, which is all the directory says. */
function dealtWith(obligations: ObligationView[], circles: CircleView[], settlements: SettlementView[]): BusinessView[] {
  const addresses = new Set([me.address]);
  for (const o of obligations) addresses.add(o.debtor === me.address ? o.creditor : o.debtor);
  for (const circle of [...circles, ...settlements.map((s) => s.circle)])
    for (const party of circle.parties) if (party.known) addresses.add(party.address);
  return CAST.filter((b) => addresses.has(b.address));
}

const inDays = (days: number) => new Date(Date.UTC(2026, 9, 6 + days, 12, 0));

/** Where the business is with the circle that waits for it: `before` signing, with the settlement `sent`, or `after` it. */
type Stage = "before" | "sent" | "after";

/**
 * A business in the middle of a busy network. Once it signs, the circle
 * that waited for it is sent and then settled, and the one nobody had
 * signed carries its signature.
 */
function full(stage: Stage): StateView {
  const signed = stage === "after";
  const { obligations, owe } = ledgerBook();
  const open: ObligationStatus = signed ? "settled" : "accepted";

  // What it is owed.
  owe(cafe, me, 400, { due: inDays(12), reference: true });
  owe(cafe, me, 220, { reference: true });
  const titoMe = owe(donTito, me, 340, { due: inDays(-3) });
  const fletesMe = owe(fletes, me, 90);
  const frutosMe = owe(frutos, me, 150, { status: open });
  owe(vina, me, 45, { status: "pending", due: inDays(30) });
  owe(taller, me, 28);
  // What it owes.
  const meMolino = owe(me, molino, 100, { due: inDays(5), reference: true });
  const meLacteos = owe(me, lacteos, 480, { due: inDays(20) });
  owe(me, imprenta, 75, { status: "pending", reference: true });
  const meFerreteria = owe(me, ferreteria, 210, { status: open });
  owe(me, austral, 130);
  // What others owe each other, where it closes a circle with the above.
  const molinoFletes = owe(molino, fletes, 80);
  const ferreteriaAserradero = owe(ferreteria, aserradero, 180, { status: open });
  const aserraderoEnvases = owe(aserradero, envases, 160, { status: open });
  const envasesFrutos = owe(envases, frutos, 170, { status: open });
  const lacteosAgricola = owe(lacteos, agricola, 300);
  const agricolaTito = owe(agricola, donTito, 320);
  // What was already untied, and what was paid directly.
  const past = [
    owe(me, vina, 80, { status: "settled" }),
    owe(vina, cafe, 80, { status: "settled" }),
    owe(cafe, me, 80, { status: "settled" }),
  ];
  const older = [
    owe(me, taller, 260, { status: "settled" }),
    owe(taller, envases, 200, { status: "settled" }),
    owe(envases, austral, 240, { status: "settled" }),
    owe(austral, me, 220, { status: "settled" }),
  ];
  const paid = owe(me, austral, 60, { status: "settled" });
  paid.paid = units(60);
  const rejected = owe(imprenta, me, 15, { status: "rejected" });
  void rejected;

  const long = [meFerreteria, ferreteriaAserradero, aserraderoEnvases, envasesFrutos, frutosMe];
  const waitingForMe: CircleView = {
    ...settle(
      long,
      everyone(long).filter((address) => address !== me.address),
    ),
    proposal: { id: "long", status: "open", expirationLedger: LEDGER + 9_400 },
  };
  const wide = [meLacteos, lacteosAgricola, agricolaTito, titoMe];
  const waitingForOthers: CircleView = {
    ...settle(wide, [me.address, lacteos.address]),
    proposal: { id: "wide", status: "open", expirationLedger: LEDGER + 15_100 },
  };
  const beingSent: CircleView = {
    ...settle(long, everyone(long)),
    proposal: { id: "long", status: "submitted", expirationLedger: LEDGER + 9_400 },
  };
  const short = [meMolino, molinoFletes, fletesMe];
  const found: CircleView = { ...settle(short, []), netOnly: settle(short, [], 80) };
  const startedByMe: CircleView = {
    ...settle(short, [me.address]),
    proposal: { id: "short", status: "open", expirationLedger: LEDGER + 17_000 },
  };
  const justSettled = settled(long, hash("7be2"), 1);

  const circles = {
    before: [waitingForMe, waitingForOthers, found],
    sent: [beingSent, waitingForOthers, startedByMe],
    after: [waitingForOthers, startedByMe, justSettled.circle],
  }[stage];
  const settlements = [
    ...(signed ? [justSettled] : []),
    settled(past, hash("a91f"), 60 * 26, 80),
    settled(older, hash("e5a7"), 60 * 24 * 6),
  ];
  const mine = onlyMine(obligations);
  return {
    ...base,
    me: { address: me.address, name: me.name, role: "owner" },
    businesses: dealtWith(mine, circles, settlements),
    obligations: mine,
    circles,
    settlements,
    settlementsTotal: settlements.length,
    balance: units(signed ? 940 : 1_000),
  };
}

/** A business that has just created its account. */
function empty(): StateView {
  return {
    ...base,
    me: { address: me.address, name: me.name, role: "owner" },
    businesses: [me],
    obligations: [],
    circles: [],
    settlements: [],
    settlementsTotal: 0,
    balance: "0",
  };
}

/** A business with more relations than a star can name. */
function crowded(): StateView {
  const { obligations, owe } = ledgerBook();
  const more = [
    "Botillería El Faro",
    "Carnes Pampa Sur",
    "Verdulería La Vega",
    "Pastas Nonna Rosa",
    "Hielos Antártica",
    "Aceites Huasco",
  ].map(business);
  const amounts = [820, 640, 415, 380, 260, 230, 190, 150, 120, 90, 60, 45, 30];
  [cafe, donTito, fletes, frutos, vina, taller, ...more, agricola].forEach((debtor, index) =>
    owe(debtor, me, amounts[index]!, { status: index === 9 ? "pending" : "accepted" }),
  );
  [molino, lacteos, imprenta, ferreteria, austral, aserradero, envases].forEach((creditor, index) =>
    owe(me, creditor, [540, 310, 75, 210, 130, 95, 48][index]!),
  );
  const mine = onlyMine(obligations);
  const everyoneHere = [...CAST, ...more];
  const addresses = new Set(mine.flatMap((o) => [o.debtor, o.creditor]));
  return {
    ...base,
    me: { address: me.address, name: me.name, role: "owner" },
    businesses: everyoneHere.filter((b) => addresses.has(b.address)),
    obligations: mine,
    circles: [],
    settlements: [],
    settlementsTotal: 0,
    balance: units(2_400),
  };
}

/** The same busy network, seen by someone who may only keep the books. */
function clerk(): StateView {
  const state = full("before");
  return { ...state, me: { ...state.me, role: "clerk" } };
}

export const SCENARIOS = {
  completa: { label: "Red completa", build: () => full("before") },
  liquidando: { label: "Liquidando", build: () => full("sent") },
  firmada: { label: "Después de firmar", build: () => full("after") },
  nueva: { label: "Negocio nuevo", build: empty },
  grande: { label: "Red grande", build: crowded },
  contador: { label: "Como contador", build: clerk },
};

export type Scenario = keyof typeof SCENARIOS;

/** The business every scenario is seen from. */
export const FOCUS = me;

/** The passkeys and invitations of the business, for the team screen. */
export const TEAM: TeamView = {
  credentials: [
    {
      credentialId: "cred-main",
      label: "Teléfono de Ana",
      contextRuleId: 0,
      role: "owner",
      isPrimary: true,
      createdAt: "2026-09-20T13:30:00.000Z",
      current: true,
    },
    {
      credentialId: "cred-backup",
      label: "Notebook del local",
      contextRuleId: 1,
      role: "owner",
      isPrimary: false,
      createdAt: "2026-09-28T10:00:00.000Z",
      current: false,
    },
    {
      credentialId: "cred-clerk",
      label: "María, contadora",
      contextRuleId: 2,
      role: "clerk",
      isPrimary: false,
      createdAt: "2026-10-01T16:45:00.000Z",
      current: false,
    },
  ],
  invitations: [
    {
      id: "inv-1",
      role: "clerk",
      label: "Pedro, contador",
      status: "registered",
      expiresAt: "2026-10-13T12:00:00.000Z",
      credentialId: "cred-pedro",
      publicKey: "04" + "ab".repeat(64),
    },
    { id: "inv-2", role: "owner", label: "Tablet de la caja", status: "pending", expiresAt: "2026-10-12T12:00:00.000Z" },
  ],
};
