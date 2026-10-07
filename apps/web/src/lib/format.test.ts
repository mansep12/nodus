import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  agoInWords,
  clip,
  dateInput,
  daysUntil,
  dueInWords,
  endOfDay,
  formatAmount,
  formatDate,
  hex,
  initials,
  parseAmount,
  percent,
  referenceHash,
} from "./format";

/** `amount` USDC in the token's smallest units. */
const usdc = (amount: string) => {
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole! + fraction.padEnd(7, "0"));
};

describe("formatAmount", () => {
  test("groups thousands with dots", () => {
    expect(formatAmount(usdc("0"))).toBe("0");
    expect(formatAmount(usdc("999"))).toBe("999");
    expect(formatAmount(usdc("1000"))).toBe("1.000");
    expect(formatAmount(usdc("1234567"))).toBe("1.234.567");
  });

  test("writes cents after a comma, without a trailing zero", () => {
    expect(formatAmount(usdc("1234.56"))).toBe("1.234,56");
    expect(formatAmount(usdc("1.5"))).toBe("1,5");
    expect(formatAmount(usdc("1.05"))).toBe("1,05");
    expect(formatAmount(usdc("0.01"))).toBe("0,01");
    // Nothing smaller than a cent is shown.
    expect(formatAmount(usdc("1.2345"))).toBe("1,23");
  });

  test("marks negative amounts with a minus sign", () => {
    expect(formatAmount(-usdc("1234.5"))).toBe("−1.234,5");
    expect(formatAmount(-usdc("0.5"))).toBe("−0,5");
  });

  test("takes the amount as a decimal string too", () => {
    expect(formatAmount("12345000000")).toBe("1.234,5");
  });
});

describe("parseAmount", () => {
  test("reads dots as thousands and a comma as the decimal point", () => {
    expect(parseAmount("1.234,5")).toBe(usdc("1234.5"));
    expect(parseAmount("10")).toBe(usdc("10"));
    expect(parseAmount("0,05")).toBe(usdc("0.05"));
    expect(parseAmount(" 1.000 ")).toBe(usdc("1000"));
  });

  test("refuses what is not a positive amount", () => {
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("0,00")).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
  });

  test("refuses more than two decimals", () => {
    expect(parseAmount("1,234")).toBeNull();
    expect(parseAmount("0,001")).toBeNull();
  });

  // Dots are dropped wherever they are, so "1.5" reads as 15 instead of being refused.
  test("refuses a dot used as the decimal point", () => {
    expect(parseAmount("1.5")).toBeNull();
  });
});

describe("initials", () => {
  test("takes the first letter of the first two words, in capitals", () => {
    expect(initials("Panadería Sur")).toBe("PS");
    expect(initials("fletes ruta 5")).toBe("FR");
    expect(initials("Molino")).toBe("M");
    expect(initials("")).toBe("");
  });
});

describe("clip", () => {
  test("leaves a name that fits as it is", () => {
    expect(clip("Panadería Sur", 13)).toBe("Panadería Sur");
  });

  test("cuts a long name to the given length, ending in an ellipsis", () => {
    expect(clip("Panadería Sur", 10)).toBe("Panadería…");
    // No space is left before the ellipsis.
    expect(clip("Molino Andes", 8)).toBe("Molino…");
  });
});

describe("percent", () => {
  test("rounds to a whole percentage", () => {
    expect(percent(1n, 3n)).toBe(33);
    expect(percent(2n, 3n)).toBe(67);
    expect(percent(1n, 8n)).toBe(13);
    expect(percent(5n, 5n)).toBe(100);
  });

  test("is zero of nothing", () => {
    expect(percent(0n, 0n)).toBe(0);
    expect(percent(5n, 0n)).toBe(0);
  });
});

describe("dates in words", () => {
  // Late in the day, to show that only calendar days count.
  const now = new Date(2026, 9, 7, 23, 30);
  const day = (date: number, month = 9) => new Date(2026, month, date, 0, 15);

  test("counts whole calendar days from now", () => {
    expect(daysUntil(day(7), now)).toBe(0);
    expect(daysUntil(day(8), now)).toBe(1);
    expect(daysUntil(day(5), now)).toBe(-2);
    expect(daysUntil(day(7, 10), now)).toBe(31);
  });

  test("says when a debt falls due", () => {
    expect(dueInWords(day(7), now)).toBe("vence hoy");
    expect(dueInWords(day(8), now)).toBe("vence mañana");
    expect(dueInWords(day(10), now)).toBe("vence en 3 días");
    expect(dueInWords(day(6), now)).toBe("venció ayer");
    expect(dueInWords(day(5), now)).toBe("venció hace 2 días");
  });

  test("says how long ago something happened, or its date when it was over a month ago", () => {
    expect(agoInWords(day(7), now)).toBe("hoy");
    expect(agoInWords(day(9), now)).toBe("hoy");
    expect(agoInWords(day(6), now)).toBe("ayer");
    expect(agoInWords(day(2), now)).toBe("hace 5 días");
    expect(agoInWords(day(7, 8), now)).toBe("hace 30 días");
    expect(agoInWords(day(6, 8), now)).toBe(formatDate(day(6, 8)));
  });
});

describe("date fields", () => {
  test("read a typed date as the last second of that day", () => {
    expect(endOfDay("2026-10-12")).toEqual(new Date(2026, 9, 12, 23, 59, 59));
    expect(endOfDay("2026-01-01")).toEqual(new Date(2026, 0, 1, 23, 59, 59));
  });

  test("ignore what is not a full date", () => {
    expect(endOfDay("")).toBeUndefined();
    expect(endOfDay("12-10-2026")).toBeUndefined();
    expect(endOfDay("2026-10-1")).toBeUndefined();
  });

  test("show a date as YYYY-MM-DD in the viewer's time zone", () => {
    expect(dateInput(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(dateInput(new Date(2026, 11, 31, 0, 0))).toBe("2026-12-31");
    expect(dateInput(endOfDay("2026-10-12")!)).toBe("2026-10-12");
  });
});

describe("referenceHash", () => {
  test("is the SHA-256 of the trimmed text", async () => {
    const expected = createHash("sha256").update("Factura 123").digest();

    expect(Buffer.from(await referenceHash("Factura 123"))).toEqual(expected);
    expect(Buffer.from(await referenceHash("  Factura 123\n"))).toEqual(expected);
  });

  test("reads as the hex the contract's reference is shown in", async () => {
    expect(hex(await referenceHash("Factura 123"))).toBe(createHash("sha256").update("Factura 123").digest("hex"));
  });
});

describe("hex", () => {
  test("writes each byte as two lowercase digits", () => {
    expect(hex(new Uint8Array([0, 15, 16, 171, 255]))).toBe("000f10abff");
    expect(hex(new Uint8Array())).toBe("");
  });
});
