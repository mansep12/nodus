/**
 * Made-up states of Nodus, to look at every screen without accounts or a
 * network: a business with a full network, the same one after signing, a
 * business that just joined and one with more relations than fit in a star.
 */
import type { BusinessView, CircleView, ObligationStatus, ObligationView, SettlementOption, SettlementView, StateView } from "./types";

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

/** Builds the debts of a state, numbering them as the contract would. */
function ledgerBook() {
  const obligations: ObligationView[] = [];
  const owe = (debtor: BusinessView, creditor: BusinessView, amount: number, status: ObligationStatus = "accepted"): ObligationView => {
    const obligation = {
      id: String(obligations.length + 1),
      debtor: debtor.address,
      creditor: creditor.address,
      amount: status === "settled" ? "0" : units(amount),
      originalAmount: units(amount),
      status,
      registeredAt: new Date(Date.UTC(2026, 8, 20 + (obligations.length % 14), 13, 30)).toISOString(),
    };
    obligations.push(obligation);
    return obligation;
  };
  return { obligations, owe };
}

/**
 * What settling the debts `links` means, each one owed by a party to the
 * next. `cancel` is how much of every debt gets cancelled: all of it by default.
 */
function settle(links: ObligationView[], signed: string[], cancel?: number): SettlementOption {
  const cleared = links.map((link) => (cancel === undefined ? BigInt(link.originalAmount) : BigInt(units(cancel))));
  const parties = links.map((link, index) => {
    const owesLess = cleared[index]!;
    const owedLess = cleared[(index + links.length - 1) % links.length]!;
    return {
      address: link.debtor,
      owesLess: owesLess.toString(),
      owedLess: owedLess.toString(),
      net: (owedLess - owesLess).toString(),
      signed: signed.includes(link.debtor),
    };
  });
  const clearings = links.map((link, index) => ({ id: link.id, amount: cleared[index]!.toString() }));
  return {
    key: clearings.map((clearing) => `${clearing.id}:${clearing.amount}`).join(","),
    clearings,
    parties,
    edges: links.map((link, index) => ({ from: link.debtor, to: link.creditor, amount: cleared[index]!.toString() })),
    cleared: cleared.reduce((sum, amount) => sum + amount, 0n).toString(),
    moved: parties.reduce((sum, party) => (BigInt(party.net) > 0n ? sum + BigInt(party.net) : sum), 0n).toString(),
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
  faucet: true,
};

/** A business in the middle of a busy network. Once `signed`, the circle that waited for it is settled. */
function full(signed: boolean): StateView {
  const { obligations, owe } = ledgerBook();
  const open = signed ? "settled" : "accepted";

  // What it is owed.
  owe(cafe, me, 400);
  owe(cafe, me, 220);
  const titoMe = owe(donTito, me, 340);
  const fletesMe = owe(fletes, me, 90);
  const frutosMe = owe(frutos, me, 150, open);
  owe(vina, me, 45, "pending");
  owe(taller, me, 28);
  // What it owes.
  const meMolino = owe(me, molino, 100);
  const meLacteos = owe(me, lacteos, 480);
  owe(me, imprenta, 75, "pending");
  const meFerreteria = owe(me, ferreteria, 210, open);
  owe(me, austral, 130);
  // What others owe each other, where it closes a circle with the above.
  const molinoFletes = owe(molino, fletes, 80);
  const ferreteriaAserradero = owe(ferreteria, aserradero, 180, open);
  const aserraderoEnvases = owe(aserradero, envases, 160, open);
  const envasesFrutos = owe(envases, frutos, 170, open);
  const lacteosAgricola = owe(lacteos, agricola, 300);
  const agricolaTito = owe(agricola, donTito, 320);
  // What was already untied.
  const past = [owe(me, vina, 80, "settled"), owe(vina, cafe, 80, "settled"), owe(cafe, me, 80, "settled")];
  const older = [
    owe(me, taller, 260, "settled"),
    owe(taller, envases, 200, "settled"),
    owe(envases, austral, 240, "settled"),
    owe(austral, me, 220, "settled"),
  ];
  const elsewhere = [
    owe(molino, agricola, 120, "settled"),
    owe(agricola, aserradero, 95, "settled"),
    owe(aserradero, molino, 110, "settled"),
  ];

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
  const short = [meMolino, molinoFletes, fletesMe];
  const found: CircleView = { ...settle(short, []), netOnly: settle(short, [], 80) };
  const justSettled = settled(long, hash("7be2"), 1);

  return {
    ...base,
    businesses: CAST,
    obligations,
    circles: signed ? [waitingForOthers, found, justSettled.circle] : [waitingForMe, waitingForOthers, found],
    settlements: [
      ...(signed ? [justSettled] : []),
      settled(past, hash("a91f"), 60 * 26, 80),
      settled(elsewhere, hash("03dc"), 60 * 51),
      settled(older, hash("e5a7"), 60 * 24 * 6),
    ],
    balance: units(signed ? 940 : 1_000),
  };
}

/** A business that has just created its account. */
function empty(): StateView {
  return { ...base, businesses: CAST, obligations: [], circles: [], settlements: [], balance: "0" };
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
    owe(debtor, me, amounts[index]!, index === 9 ? "pending" : "accepted"),
  );
  [molino, lacteos, imprenta, ferreteria, austral, aserradero, envases].forEach((creditor, index) =>
    owe(me, creditor, [540, 310, 75, 210, 130, 95, 48][index]!),
  );
  return { ...base, businesses: [...CAST, ...more], obligations, circles: [], settlements: [], balance: units(2_400) };
}

export const SCENARIOS = {
  completa: { label: "Red completa", build: () => full(false) },
  firmada: { label: "Después de firmar", build: () => full(true) },
  nueva: { label: "Negocio nuevo", build: empty },
  grande: { label: "Red grande", build: crowded },
};

export type Scenario = keyof typeof SCENARIOS;

/** The business every scenario is seen from. */
export const FOCUS = me;
