import { EXPLORER_URL } from "@nodus/stellar";
import { partyOf } from "@/lib/books";
import { TOKEN_SYMBOL } from "@/lib/config";
import { formatAmount, formatDateTime } from "@/lib/format";
import type { SettlementView } from "@/lib/types";

/** The receipt of a settlement for the books: what it meant for the business, with the transaction that proves it. */
export function receipt(settlement: SettlementView, me: string, nameOf: (address: string) => string): string {
  const { circle, txHash, closedAt } = settlement;
  const mine = partyOf(circle, me);
  const rows: string[][] = [
    ["Comprobante de compensación Nodus", ""],
    ["Fecha", formatDateTime(closedAt)],
    ["Transacción", txHash],
    ["Verificar en", `${EXPLORER_URL}/tx/${txHash}`],
    ["Negocios en el círculo", String(circle.parties.length)],
    ["Deuda cancelada en el círculo", `${formatAmount(circle.cleared)} ${TOKEN_SYMBOL}`],
    ["Dinero movido en el círculo", `${formatAmount(circle.moved)} ${TOKEN_SYMBOL}`],
    [],
    ["Mi negocio", nameOf(me)],
    ["Dejé de deber", `${formatAmount(mine?.owesLess ?? "0")} ${TOKEN_SYMBOL}`],
    ["Dejaron de deberme", `${formatAmount(mine?.owedLess ?? "0")} ${TOKEN_SYMBOL}`],
    [
      BigInt(mine?.net ?? "0") >= 0n ? "Recibí" : "Pagué",
      `${formatAmount(BigInt(mine?.net ?? "0") < 0n ? -BigInt(mine!.net) : (mine?.net ?? "0"))} ${TOKEN_SYMBOL}`,
    ],
    [],
    ["Deuda", "Monto cancelado"],
    ...circle.clearings.map((clearing) => [`N.º ${clearing.id}`, `${formatAmount(clearing.amount)} ${TOKEN_SYMBOL}`]),
    [],
    ["Con quién", "Deuda cancelada"],
    ...circle.edges
      .filter((edge) => edge.amount !== null)
      .map((edge) => [
        edge.from === me ? `Yo le debía a ${nameOf(edge.to)}` : `${nameOf(edge.from)} me debía`,
        `${formatAmount(edge.amount!)} ${TOKEN_SYMBOL}`,
      ]),
  ];
  const cell = (value: string) => `"${value.replaceAll('"', '""')}"`;
  return `﻿${rows.map((row) => row.map(cell).join(";")).join("\r\n")}\r\n`;
}

/** Hands the receipt of a settlement over as a file for a spreadsheet. */
export function downloadReceipt(settlement: SettlementView, me: string, nameOf: (address: string) => string) {
  const blob = new Blob([receipt(settlement, me, nameOf)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `nodus-compensacion-${settlement.txHash.slice(0, 8)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
