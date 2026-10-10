#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["stable-ts>=2.19", "torch==2.9.1", "torchaudio==2.9.1", "numpy"]
#
# [[tool.uv.index]]
# name = "pytorch-cpu"
# url = "https://download.pytorch.org/whl/cpu"
# explicit = true
#
# [tool.uv.sources]
# torch = { index = "pytorch-cpu" }
# torchaudio = { index = "pytorch-cpu" }
# ///
"""
Las palabras de la voz, con el segundo en que empieza y termina cada una.

Lee la voz grabada (pitch/voz/voz.mp3), la transcribe en español con Whisper
(stable-ts, que afina las marcas de tiempo de cada palabra) y escribe
pitch/voz/palabras.json. Con --alinear no transcribe: alinea a la fuerza el
texto del guion (las citas de "Voz" de pitch/guion.md), que da tiempos más
finos si la voz dice el guion tal cual, y peores si se aparta de él.

    uv run pitch/voz/alinear.py                  # transcribe, modelo small
    uv run pitch/voz/alinear.py --modelo medium  # más lento, algo más fino
    uv run pitch/voz/alinear.py --alinear        # alinea el texto del guion

Torch y torchaudio se instalan en su versión para CPU. El audio se decodifica con ffmpeg:
el de $FFMPEG, el del PATH, o el del runtime de Flatpak org.freedesktop.Platform.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
PITCH = HERE.parent
RATE = 16_000
# Lo que Whisper no adivina solo: los nombres y las palabras prestadas del guion.
PROMPT = "Nodus, Stellar, pyme, pymes, factoring, passkey, Soroban, Molino Andes, Panadería Sur, Fletes Ruta 5, neteo."


def ffmpeg() -> list[str]:
    if os.environ.get("FFMPEG"):
        return shlex.split(os.environ["FFMPEG"])
    if shutil.which("ffmpeg"):
        return ["ffmpeg"]
    if shutil.which("flatpak"):
        return ["flatpak", "run", "--filesystem=host", "--command=ffmpeg", "org.freedesktop.Platform//25.08"]
    sys.exit("No encuentro ffmpeg: instálalo o di dónde está con FFMPEG=/ruta/ffmpeg.")


def audio(path: Path) -> np.ndarray:
    """La voz como Whisper la escucha: mono, 16 kHz, en flotantes entre -1 y 1."""
    # Por la entrada estándar, para que sirva también el ffmpeg de Flatpak, que no ve /tmp.
    command = [*ffmpeg(), "-v", "error", "-i", "pipe:0", "-f", "s16le", "-ac", "1", "-ar", str(RATE), "pipe:1"]
    pcm = subprocess.run(command, input=path.read_bytes(), check=True, capture_output=True).stdout
    return np.frombuffer(pcm, np.int16).astype(np.float32) / 32768.0


def script_text(guion: Path) -> str:
    """Lo que dice la voz según el guion: las citas de cada bloque y la columna Voz de la demo, sin las marcas de paso."""
    lines: list[str] = []
    for line in guion.read_text(encoding="utf-8").splitlines():
        if line.startswith("> "):
            lines.append(line[2:])
        elif re.match(r"^\|\s*\d+\s*\|", line):
            cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
            if len(cells) >= 3:
                lines.append(cells[2])
    text = " ".join(lines)
    return re.sub(r"\s+", " ", re.sub(r"\[[^\]]*\]", " ", text)).strip()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--voz", type=Path, default=HERE / "voz.mp3")
    parser.add_argument("--salida", type=Path, default=HERE / "palabras.json")
    parser.add_argument("--modelo", default="small", help="tiny, base, small, medium o large-v3")
    parser.add_argument("--alinear", action="store_true", help="alinear el texto del guion en vez de transcribir")
    parser.add_argument("--guion", type=Path, default=PITCH / "guion.md")
    args = parser.parse_args()

    if not args.voz.exists():
        sys.exit(f"No está la voz: {args.voz}. Ponla ahí (mp3 o wav) y vuelve a correr esto.")

    import stable_whisper
    import torch

    device = "cuda" if torch.cuda.is_available() else "cpu"
    samples = audio(args.voz)
    print(f"{args.voz.name}: {len(samples) / RATE:.1f} s · modelo {args.modelo} en {device}", file=sys.stderr)
    model = stable_whisper.load_model(args.modelo, device=device)
    if args.alinear:
        result = model.align(samples, script_text(args.guion), language="es")
        mode = "alineado con el guion"
    else:
        result = model.transcribe(samples, language="es", initial_prompt=PROMPT, regroup=True, verbose=None)
        mode = "transcrito"

    words = [
        {"word": word.word.strip(), "start": round(float(word.start), 3), "end": round(float(word.end), 3)}
        for segment in result.segments
        for word in (segment.words or [])
        if word.word.strip()
    ]
    out = {
        "voz": str(args.voz.relative_to(PITCH.parent) if args.voz.is_relative_to(PITCH.parent) else args.voz),
        "modelo": args.modelo,
        "modo": mode,
        "duracion": round(len(samples) / RATE, 3),
        "texto": result.text.strip(),
        "palabras": words,
    }
    args.salida.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(words)} palabras ({mode}) en {args.salida}", file=sys.stderr)


if __name__ == "__main__":
    main()
