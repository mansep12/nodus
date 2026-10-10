#!/usr/bin/env python3
"""
El sonido del video: una cama y los efectos de cada animación, sintetizados.

Nada se graba ni se descarga: todo sale de ondas (numpy), así que no hay
licencias que revisar y cada efecto cae en el segundo exacto de su paso. Los
segundos salen de `pitch/voz/tiempos.json` (donde la voz dice cada línea) y de
lo que el código de las escenas espera tras el paso: los conteos de los días,
las firmas de los veinte (una cada 0,128 s), el nudo que aprieta 1,5 s y se
suelta en 1,1 s (`UNTYING` en `lib/motion.ts`).

Escribe, por parte, dos pistas de 48 kHz estéreo en `pitch/out/`:

    cama-A.wav, cama-B.wav        un colchón suave que el mezclador agacha bajo la voz
    efectos-A.wav, efectos-B.wav  los sonidos de las animaciones

    python3 pitch/sonido.py
    bun pitch/mezclar.ts --video pitch/out/pitch-A.mp4 --voz pitch/voz/A.mp3 \\
        --musica pitch/out/cama-A.wav --efectos pitch/out/efectos-A.wav --salida pitch/out/parte-A-sonido.mp4

Las pistas salen con un nivel de trabajo (cama a −20 dBFS de RMS, efectos con
picos en −6 dBFS); `mezclar.ts` las baja bajo la voz con `--musica-db` y
`--efectos-db`. Es determinista: corrido dos veces sale igual.
"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "pitch" / "out"
TIMES = json.loads((ROOT / "pitch" / "voz" / "tiempos.json").read_text())
END = TIMES["fin"]
#: Dónde empieza y termina cada parte en la línea de tiempo del video entero.
PARTS = {"A": (0.0, 104.491), "B": (156.491, END)}
#: La demo dura menos que su hueco (43 s de 52): su cama es el comienzo de ese tramo, y no lleva efectos.
DEMO = (104.491, 147.491)
#: El video entero: A (104,48 s) y B (36 s) a 1,1×, la demo de 43 s y dos fundidos de 0,4 s. El cierre («Esto es Nodus») entra a los 30 s de B.
FINAL = {"total": 104.48 / 1.1 + 43.0 + 36.0 / 1.1 - 0.8, "close": 104.48 / 1.1 + 43.0 - 0.8 + 30.0 / 1.1}

CUE = {(p["escena"], p["paso"]): p["t"] for p in TIMES["pasos"]}
rng = np.random.default_rng(7)

# ── notas ───────────────────────────────────────────────────────────────────
PENTATONIC = [0, 2, 4, 7, 9]  # re mayor: re mi fa# la si


def note(index: int, base: int = 62) -> float:
    """Frecuencia de la nota `index` de la pentatónica de re, desde el re central."""
    midi = base + 12 * (index // 5) + PENTATONIC[index % 5]
    return 440.0 * 2 ** ((midi - 69) / 12)


def midi(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


# ── materiales ──────────────────────────────────────────────────────────────
def t_of(seconds: float) -> np.ndarray:
    return np.arange(int(seconds * SR)) / SR


def decay(n: int, tau: float, attack: float = 0.004) -> np.ndarray:
    t = np.arange(n) / SR
    return (1 - np.exp(-t / attack)) * np.exp(-t / tau)


def lowpass(x, hz, order=2):
    return sosfilt(butter(order, hz, "low", fs=SR, output="sos"), x)


def highpass(x, hz, order=2):
    return sosfilt(butter(order, hz, "high", fs=SR, output="sos"), x)


def bandpass(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x)


def bell(freq, dur=1.4, amp=1.0, glass=1.0):
    """Una campana suave: el tono, su octava y una quinta que se apaga antes."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for ratio, level, tau in ((1, 1.0, dur * 0.35), (2.0, 0.28 * glass, dur * 0.18), (3.0, 0.1 * glass, dur * 0.09), (4.2, 0.05 * glass, dur * 0.05)):
        out += level * np.sin(2 * np.pi * freq * ratio * t) * decay(n, tau)
    return amp * out


def pluck(freq, dur=0.7, amp=1.0):
    """Una cuerda tocada: armónicos que se apagan más rápido cuanto más agudos."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, 7):
        out += (1 / k**1.2) * np.sin(2 * np.pi * freq * k * t) * decay(n, dur * 0.5 / k, 0.002)
    return amp * out


def pop(freq, amp=1.0):
    """Algo que aparece: un golpe redondo que cae de tono."""
    n = int(0.16 * SR)
    t = np.arange(n) / SR
    f = freq * (1 + 0.9 * np.exp(-t / 0.018))
    phase = 2 * np.pi * np.cumsum(f) / SR
    return amp * np.sin(phase) * decay(n, 0.045, 0.002)


def tick(freq, amp=1.0):
    """Un contador: un chasquido corto y claro."""
    n = int(0.06 * SR)
    t = np.arange(n) / SR
    click = highpass(rng.standard_normal(n), 3000) * decay(n, 0.004, 0.0005) * 0.35
    return amp * (np.sin(2 * np.pi * freq * t) * decay(n, 0.012, 0.0005) + click)


def thump(freq=70.0, amp=1.0):
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    phase = 2 * np.pi * np.cumsum(freq * (1 + 1.2 * np.exp(-t / 0.03))) / SR
    return amp * np.sin(phase) * decay(n, 0.09, 0.002)


def glide(f0, f1, dur, amp=1.0, tail=0.15):
    """Un tono que va de una nota a otra."""
    n = int((dur + tail) * SR)
    t = np.arange(n) / SR
    ramp = np.clip(t / dur, 0, 1)
    f = f0 * (f1 / f0) ** (ramp * ramp * (3 - 2 * ramp))
    phase = 2 * np.pi * np.cumsum(f) / SR
    env = np.minimum(1, t / 0.05) * np.where(t < dur, 1, np.exp(-(t - dur) / (tail / 3)))
    return amp * (np.sin(phase) + 0.25 * np.sin(2 * phase)) * env


def whoosh(dur, amp=1.0):
    """El aire de la cámara al viajar: ruido que se abre y se cierra."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    for center, width, at in ((380, 260, 0.38), (900, 600, 0.5), (2200, 1400, 0.62)):
        band = bandpass(noise, max(60, center - width), center + width)
        out += band * np.exp(-0.5 * ((t / dur - at) / 0.22) ** 2) * (center / 900) ** -0.3
    return amp * lowpass(out, 5000) * np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.5


def swell(freqs, dur, amp=1.0, tail=0.4):
    """Un acorde que sube y se queda: lo que se enciende."""
    n = int((dur + tail) * SR)
    t = np.arange(n) / SR
    out = sum(np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t) for f in freqs) / len(freqs)
    rise = np.clip(t / dur, 0, 1) ** 2
    return amp * out * rise * np.where(t < dur, 1, np.exp(-(t - dur) / (tail / 3)))


def tension(freq, dur, amp=1.0):
    """Algo que se pasó: dos tonos graves que no terminan de afinar."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.sin(2 * np.pi * freq * t) + np.sin(2 * np.pi * freq * 1.0595 * t) * 0.8 + 0.3 * np.sin(2 * np.pi * freq * 2 * t)
    return amp * lowpass(out, 900) * decay(n, dur * 0.5, 0.06) * 0.6


def knot(amp=1.0):
    """El nudo: aprieta durante 1,5 s (tono y vibración que suben) y se suelta (1,1 s)."""
    tight, loose = 1.5, 1.1
    n = int((tight + loose + 0.9) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    m = t < tight
    rise = (t[m] / tight) ** 1.6
    phase = 2 * np.pi * np.cumsum(180 * (1 + 0.9 * rise)) / SR
    trem = 0.6 + 0.4 * np.sin(2 * np.pi * (4 + 18 * rise) * t[m])
    out[m] += 0.5 * (np.sin(phase[: m.sum()]) + 0.3 * np.sin(2 * phase[: m.sum()])) * rise * trem
    out[m] += 0.5 * lowpass(rng.standard_normal(m.sum()), 2500) * rise**2 * 0.5
    at = int(tight * SR)
    # El soltar: un chasquido, la caída del tono y el brillo de lo que queda en paz.
    out[at : at + int(0.02 * SR)] += highpass(rng.standard_normal(int(0.02 * SR)), 2000) * 0.5
    fall = glide(520, 260, loose * 0.8, 0.5)
    out[at : at + len(fall)] += fall[: n - at]
    for i, delay in enumerate((0.08, 0.2, 0.34)):
        chime = bell(note(5 + 2 * i, 62), 1.2, 0.34, 0.8)
        s = at + int(delay * SR)
        out[s : s + len(chime)] += chime[: n - s]
    return amp * out


def sparkle(dur, amp=1.0):
    """Un puñado de campanitas agudas: lo que se descubre."""
    n = int(dur * SR)
    out = np.zeros(n)
    for _ in range(max(3, int(dur * 9))):
        s = int(rng.uniform(0, dur * 0.8) * SR)
        chime = bell(note(int(rng.integers(10, 15)), 62), 0.7, rng.uniform(0.15, 0.4), 0.6)
        out[s : s + len(chime)] += chime[: n - s]
    return amp * out


# ── el reverb, para que todo comparta un mismo cuarto ───────────────────────
def impulse(rt, wet_lp=5000):
    n = int(rt * SR)
    t = np.arange(n) / SR
    ir = lowpass(rng.standard_normal(n), wet_lp) * np.exp(-t * 6.9 / rt)
    ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
    return ir / np.sqrt(np.sum(ir**2))


def reverb(stereo, rt, wet):
    left = fftconvolve(stereo[:, 0], impulse(rt))[: len(stereo)]
    right = fftconvolve(stereo[:, 1], impulse(rt))[: len(stereo)]
    return stereo * (1 - wet) + np.stack([left, right], axis=1) * wet


# ── los efectos, uno por cosa que se ve ─────────────────────────────────────
class Track:
    def __init__(self, seconds):
        self.data = np.zeros((int(seconds * SR) + SR * 6, 2))

    def add(self, t, mono, gain=1.0, pan=0.0):
        """Pone un sonido en el segundo `t`; `pan` de −1 (izquierda) a 1 (derecha)."""
        if t < 0:
            return
        start = int(t * SR)
        angle = (pan + 1) * np.pi / 4
        end = min(len(self.data), start + len(mono))
        mono = mono[: end - start] * gain
        self.data[start:end, 0] += mono * np.cos(angle)
        self.data[start:end, 1] += mono * np.sin(angle)


def cue(scene, step):
    return CUE[(scene, step)]


def effects() -> Track:
    fx = Track(END)
    add = fx.add

    def counting(t0, t1, count, first, last, gain=0.5, pan=0.0):
        """Los números que corren: un tick por cifra, cada vez más agudo."""
        for i in range(count):
            f = first * (last / first) ** (i / max(1, count - 1))
            add(t0 + (t1 - t0) * i / max(1, count - 1), tick(f), gain * (0.7 + 0.3 * i / count), pan)

    def travel(t, dur, gain=0.55, pan=0.0):
        """La cámara sale 0,3 s antes que la voz (`LEAD` en stage.tsx)."""
        add(t - 0.3, whoosh(dur), gain, pan)

    # ── el problema ────────────────────────────────────────────────────────
    add(0.12, bell(note(5), 3.2, 0.5), 1.0)  # la portada: Nodus
    add(0.12, bell(note(7), 3.2, 0.3), 0.7)
    t = cue("problema", 1)
    add(t + 0.2, pop(note(7)), 0.7)  # 6 de cada 10
    t = cue("problema", 2)
    travel(t, 2.4)  # baja a los días
    counting(t + 0.7, t + 1.2, 5, 1200, 2200, 0.28)  # entra la tarjeta
    t = cue("problema", 3)
    add(t + 0.5, bell(note(9), 1.4, 0.55), 0.8)  # la ley: 30 días
    t = cue("problema", 4)
    add(t + 0.55, tension(110, 1.8), 0.7)  # pasa de la ley
    counting(t + 0.6, t + 1.18, 14, 700, 1700, 0.45)  # 30 → 44
    t = cue("problema", 5)
    add(t + 0.3, pop(note(2)), 0.7)  # la segunda barra
    t = cue("problema", 6)
    add(t + 0.55, tension(92, 2.2), 0.8)
    counting(t + 0.6, t + 1.33, 23, 700, 1900, 0.45)  # 30 → 53
    t = cue("problema", 7)
    travel(t, 2.4)  # la cadena
    for i, delay in enumerate((0.5, 1.2, 1.9, 2.6)):
        add(t + delay, pop(note(2 + i)), 0.65, -0.5 + 0.33 * i)
    t = cue("problema", 8)
    for i, delay in enumerate((0.5, 1.3, 2.1)):  # quien te debe también espera
        add(t + delay, glide(note(2), note(2) * 1.12, 0.35, 0.5), 0.6, 0.3 * i - 0.3)

    # ── el nudo ────────────────────────────────────────────────────────────
    t = cue("nudo", 0)
    travel(t, 2.2)
    add(t + 0.7, swell([note(5), note(7)], 1.6, 0.18), 0.8)  # el círculo se dibuja vacío
    t = cue("nudo", 1)
    add(t + 0.3, pop(note(3)), 0.7, -0.4)
    add(t + 0.7, pop(note(5)), 0.7, 0.4)
    add(t + 1.0, pluck(note(2)), 0.6, 0.0)  # la deuda: 100
    counting(t + 1.05, t + 1.9, 6, 900, 1500, 0.3)
    t = cue("nudo", 2)
    add(t + 0.3, pop(note(4)), 0.7, 0.0)
    add(t + 0.7, pluck(note(3)), 0.6, 0.2)  # 80
    t = cue("nudo", 3)
    add(t + 0.5, pluck(note(1)), 0.6, -0.2)  # 90
    add(t + 1.2, bell(note(5), 1.4, 0.45), 0.7)  # se cierra el círculo
    counting(t + 1.5, t + 2.9, 16, 600, 1500, 0.4)  # el centro cuenta hasta 270
    t = cue("nudo", 4)
    add(t + 0.4, tension(130, 3.0), 0.55)  # nadie alcanza a pagar

    # ── la idea ────────────────────────────────────────────────────────────
    t = cue("idea", 0)
    travel(t, 2.2, 0.4)
    t = cue("idea", 1)
    for i, f in enumerate((note(5), note(7), note(9))):  # las tres se encienden
        add(t + 0.2 + 0.12 * i, bell(f, 1.8, 0.5), 0.8, -0.4 + 0.4 * i)
    t = cue("idea", 2)
    add(t + 0.35, swell([note(0), note(4), note(7)], 0.9, 0.3, 1.2), 0.9)  # Nodus
    add(t + 1.0, bell(note(10), 2.4, 0.5), 0.9)
    t = cue("idea", 3)
    add(t + 0.5, tick(1500), 0.5)
    add(t + 0.62, tick(1900), 0.5)
    t = cue("idea", 4)
    add(t, whoosh(1.2), 0.3)  # el nombre se va
    t = cue("idea", 5)
    add(t + 0.2, glide(note(8), note(2), 1.3, 0.4), 0.7)  # 270 baja a 20
    counting(t + 0.3, t + 1.7, 18, 1700, 650, 0.38)
    t = cue("idea", 6)
    add(t + 0.3, pluck(note(4)), 0.55, -0.5)
    add(t + 0.65, pluck(note(6)), 0.55, 0.5)
    t = cue("idea", 7)
    add(t + 0.3, thump(80), 0.9)
    add(t + 0.35, bell(note(5), 1.6, 0.55), 0.8)  # el molino recibe y late
    t = cue("idea", 8)
    add(t, knot(), 0.9)

    # ── sin usar caja ──────────────────────────────────────────────────────
    t = cue("caja", 0)
    for i in range(3):
        add(t + 0.3 + 0.22 * i, pluck(note(2 + i)), 0.5, -0.4 + 0.4 * i)
    t = cue("caja", 1)
    for i in range(3):
        add(t + 0.3 + 0.25 * i, pop(note(4 + i)), 0.55, -0.4 + 0.4 * i)
    t = cue("caja", 2)
    add(t + 0.2, glide(note(6), note(1), 1.0, 0.4), 0.7)  # las cuerdas se reducen
    counting(t + 0.3, t + 1.3, 10, 1600, 700, 0.32)
    add(t + 1.1, whoosh(0.9), 0.3)  # desaparece la deuda del molino
    t = cue("caja", 3)
    add(t + 0.4, pop(note(3)), 0.7, -0.3)
    t = cue("caja", 4)
    add(t + 0.4, pop(note(5)), 0.7, 0.3)
    t = cue("caja", 5)
    add(t, whoosh(1.4), 0.3)
    t = cue("caja", 6)
    counting(t + 0.2, t + 1.2, 10, 1700, 800, 0.32)
    add(t + 1.3, bell(note(7), 2.0, 0.5), 0.8)  # de 270 quedan 30

    # ── la red ─────────────────────────────────────────────────────────────
    t = cue("red", 0)
    travel(t, 2.0, 0.5)
    for step, count, spread in ((1, 2, 0.8), (2, 2, 0.8), (3, 5, 1.3), (4, 6, 1.5)):
        t = cue("red", step)
        for i in range(count):  # una ola de negocios nuevos
            add(t + 0.25 + spread * i / count, pop(note(int(rng.integers(1, 9)))), 0.45, float(rng.uniform(-0.7, 0.7)))
        if step >= 3:
            add(t, whoosh(2.4), 0.35)
    t = cue("red", 5)
    travel(t, 3.2, 0.6)
    for i in range(14):  # la última vuelta, y los cruces
        add(t + 0.3 + 2.2 * i / 14, pop(note(int(rng.integers(3, 11)))), 0.32, float(rng.uniform(-0.8, 0.8)))
    t = cue("red", 6)
    add(t, glide(note(10), note(0), 1.6, 0.4), 0.6)  # todo se apaga menos lo de la panadería
    t = cue("red", 7)
    add(t + 0.1, swell([note(0), note(4), note(7), note(10)], 1.8, 0.4, 1.5), 0.8)  # la red entera
    t = cue("red", 8)
    for i in range(4):  # los círculos que hay en ella
        add(t + 0.35 + 0.38 * i, pluck(note(4 + 2 * i), 0.9), 0.5, -0.6 + 0.4 * i)
    t = cue("red", 9)
    for i in range(4):  # Nodus los encuentra
        add(t + 0.3 + 0.32 * i, bell(note(7 + 2 * i), 1.6, 0.5), 0.75, -0.6 + 0.4 * i)
    add(t + 1.8, sparkle(2.0, 0.5), 0.6)

    # ── veinte en una transacción ──────────────────────────────────────────
    t = cue("veinte", 0)
    travel(t, 1.5)
    for i in range(20):  # el anillo de veinte negocios, sin firmas
        add(t + 0.6 + 0.045 * i, pop(note(3 + i % 5, 62) * (1 + (i // 5) * 0.5)), 0.28, np.sin(2 * np.pi * i / 20) * 0.6)
    t = cue("veinte", 1)
    nxt = cue("veinte", 2)
    pace = min(0.3, max(0.05, (nxt - t - 0.1 - 0.25) / 19))  # el ritmo de las firmas, como en stellar.tsx
    for i in range(20):  # veinte firmas, cada vez más agudas
        add(t + 0.1 + pace * i, bell(note(5 + int(i * 0.6)), 0.9, 0.5, 0.7), 0.55 + 0.3 * (i == 19), np.sin(2 * np.pi * i / 20) * 0.6)
    t = cue("veinte", 2)
    add(t, knot(), 0.9)  # con la última firma, el círculo se anuda y se suelta
    t = cue("veinte", 3)
    add(t + 0.5, thump(60), 1.0)  # el recibo
    add(t + 0.52, tick(2400), 0.7)
    for i in range(4):
        add(t + 1.0 + 0.4 * i, tick(1500 + 220 * i), 0.5)

    # ── por qué Stellar ────────────────────────────────────────────────────
    t = cue("stellar", 0)
    travel(t, 2.6)
    add(t + 0.9, pop(note(4)), 0.65)
    t = cue("stellar", 1)
    add(t + 0.5, tick(1500), 0.6, -0.6)  # entra el 100
    add(t + 1.6, thump(90), 0.7, -0.4)  # el intermediario se queda con una parte
    add(t + 1.6, tension(150, 1.6), 0.45, -0.4)
    add(t + 2.6, glide(note(5), note(3), 0.5, 0.45), 0.6, -0.5)  # y llegan 96
    counting(t + 2.7, t + 3.0, 5, 1300, 1000, 0.3, -0.6)
    t = cue("stellar", 2)
    add(t + 0.5, bell(note(7), 1.8, 0.55), 0.85, 0.5)  # el smart contract ocupa el lugar
    t = cue("stellar", 3)
    add(t + 0.4, pluck(note(8), 0.8), 0.55, 0.3)  # cada uno firma con su huella
    add(t + 0.5, tick(2600), 0.4, 0.3)
    t = cue("stellar", 4)
    add(t + 0.4, thump(75), 0.8, 0.3)  # todo o nada
    add(t + 0.45, bell(note(5), 1.4, 0.4), 0.6, 0.3)
    t = cue("stellar", 5)
    add(t + 0.45, bell(note(7), 1.4, 0.5), 0.7, 0.4)  # entra 20
    add(t + 1.1, bell(note(7), 1.4, 0.5), 0.7, 0.6)  # sale 20
    t = cue("stellar", 6)
    add(t + 0.45, swell([note(0), note(4), note(7)], 1.1, 0.3, 1.0), 0.8)  # el recibo es público
    add(t + 1.3, bell(note(10), 2.0, 0.45), 0.7)

    # ── cierre ─────────────────────────────────────────────────────────────
    t = cue("cierre", 0)
    travel(t, 2.2, 0.4)
    for i, f in enumerate((note(0), note(2), note(4), note(7), note(10))):  # Nodus: el acorde que resuelve
        add(t + 0.5 + 0.1 * i, bell(f, 5.0, 0.55), 0.45, -0.4 + 0.2 * i)
    t = cue("cierre", 1)
    add(t + 0.15, tick(2000), 0.4)  # la dirección del repositorio
    return fx


# ── la cama ─────────────────────────────────────────────────────────────────
#: Los acordes del colchón, cada 16 s, en re mayor; en el cierre vuelven a la tónica.
CHORDS = [
    [50, 57, 64, 66, 69],  # re mayor con novena
    [47, 54, 57, 62, 66],  # si menor séptima
    [43, 50, 54, 59, 62],  # sol mayor séptima
    [45, 52, 57, 61, 64],  # la (sol# deja ver el re)
]


def pad_segment(notes, seconds):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for m in notes:
        f = midi(m)
        for cents in (-5, 0, 5):
            g = f * 2 ** (cents / 1200)
            phase = rng.uniform(0, 2 * np.pi)
            out += np.sin(2 * np.pi * g * t + phase) + 0.35 * np.sin(4 * np.pi * g * t + phase) + 0.12 * np.sin(6 * np.pi * g * t + phase)
    out *= 0.85 + 0.15 * np.sin(2 * np.pi * 0.11 * t + rng.uniform(0, 6))
    return lowpass(out, 2200)


def bed(total: float = END + 6, close: float = 186.0) -> np.ndarray:
    """La cama de `total` segundos: un acorde cada 16 s, y el último entra en `close`, justo al cierre."""
    out = np.zeros((int(total * SR), 2))
    fade = 4.0
    bounds = [float(b) for b in range(0, int(close) - 8, 16)] + [close, total]
    for i, (start, stop) in enumerate(zip(bounds[:-1], bounds[1:])):
        chord = CHORDS[0] if stop == total else CHORDS[i % 4]
        a, b = max(0.0, start - fade), min(total, stop + fade)
        seg = pad_segment(chord, b - a)
        t = np.arange(len(seg)) / SR
        env = np.clip((b - a - t) / (2 * fade), 0, 1)
        if start > 0:
            env *= np.clip(t / (2 * fade), 0, 1)
        s0 = int(a * SR)
        out[s0 : s0 + len(seg), 0] += seg * env * 0.9
        out[s0 : s0 + len(seg), 1] += np.roll(seg, 37) * env * 0.9
    # El aire: ruido muy bajo que respira, para que nunca haya silencio digital.
    air = bandpass(rng.standard_normal(len(out)), 1500, 5000)
    breath = 0.5 + 0.5 * np.sin(2 * np.pi * 0.07 * np.arange(len(out)) / SR)
    out += np.stack([air, np.roll(air, 211)], axis=1) * (breath[:, None] * 0.05)
    return reverb(out, 2.6, 0.3)


def rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(x**2)) + 1e-9)


def write(path: Path, data: np.ndarray):
    wavfile.write(str(path), SR, np.clip(data, -1, 1).astype(np.float32))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    fx = effects()
    wet = reverb(fx.data, 1.4, 0.22)
    peak = np.max(np.abs(wet))
    wet *= 0.5 / peak  # picos en −6 dBFS
    pad = bed()
    pad *= 10 ** (-20 / 20) / np.sqrt(np.mean(pad**2))  # RMS en −20 dBFS
    for name, (start, end) in PARTS.items():
        a, b = int(start * SR), int(end * SR)
        effects_part = wet[a:b].copy()
        bed_part = pad[a:b].copy()
        n = len(bed_part)
        t = np.arange(n) / SR
        # Entra y sale con suavidad; en A la cama se retira al final para dejar paso a la demo.
        bed_part *= np.clip(t / 2.5, 0, 1)[:, None] ** 2
        tail = 1.5 if name == "A" else 3.0
        bed_part *= np.clip((n / SR - t) / tail, 0, 1)[:, None] ** 2
        write(OUT / f"efectos-{name}.wav", effects_part)
        write(OUT / f"cama-{name}.wav", bed_part)
        print(f"{name}: {end - start:6.1f} s  cama {rms_db(bed_part):6.1f} dBFS RMS  efectos pico {20 * np.log10(np.max(np.abs(effects_part))):6.1f} dBFS")
    demo = pad[int(DEMO[0] * SR) : int(DEMO[1] * SR)].copy()
    t = np.arange(len(demo)) / SR
    demo *= (np.clip(t / 2.5, 0, 1) * np.clip((len(demo) / SR - t) / 1.5, 0, 1))[:, None] ** 2
    write(OUT / "cama-demo.wav", demo)
    print(f"demo: {DEMO[1] - DEMO[0]:4.1f} s  cama {rms_db(demo):6.1f} dBFS RMS")
    # El video entero (A y B a 1,1× y la demo entre las dos, `pitch/final.ts`): una sola cama, sin cortes entre las piezas.
    whole = bed(FINAL["total"] + 6, FINAL["close"])[: int(FINAL["total"] * SR)]
    whole *= 10 ** (-20 / 20) / np.sqrt(np.mean(whole**2))
    t = np.arange(len(whole)) / SR
    whole *= (np.clip(t / 2.5, 0, 1) * np.clip((len(whole) / SR - t) / 3.0, 0, 1))[:, None] ** 2
    write(OUT / "cama-final.wav", whole)
    print(f"final: {FINAL['total']:5.1f} s  cama {rms_db(whole):6.1f} dBFS RMS")


if __name__ == "__main__":
    sys.exit(main())
