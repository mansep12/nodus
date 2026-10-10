#!/usr/bin/env bash
# La app de la demo: una copia local, compilada en modo producción, con su propia base de datos
# (apps/web/.data-demo) y escuchando solo en 127.0.0.1:3002. Cada intento de grabación parte de una
# base limpia (o, con la cuenta permanente, con vecinos que no se repiten), porque el selector de deudas busca en un directorio global y cada intento crea vecinos
# nuevos con el mismo nombre: sin reiniciar, saldrían varios "Fletes Ruta 5".
#
#   bash pitch/demo.sh construir        # compila la app (una vez, o si cambia el código)
#   bash pitch/demo.sh reiniciar        # borra TODO (base y vecinos guardados): la cuenta se crea de nuevo
#   bash pitch/demo.sh iniciar          # levanta la app con la base que haya
#   bash pitch/demo.sh llave [enlace]   # una vez: le da a los scripts una passkey de la panadería (antes, «Equipo» → «Invitar un dispositivo»)
#   bash pitch/demo.sh vecinos [nombre] # los vecinos y, con la llave, la red completa: deja todo listo para un intento
#   bash pitch/demo.sh inserto [nombre] # toma 3 aparte: "Panadería Sur" le registra 90 a "Fletes Ruta 5"
#   bash pitch/demo.sh cuenta [nombre]  # qué tiene la cuenta: deudas, círculos, passkeys (reinicia la app)
#   bash pitch/demo.sh limites          # pone en cero los límites de uso (reinicia la app)
#   bash pitch/demo.sh detener          # apaga la app y los vecinos
#   bash pitch/demo.sh estado
#
# Se abre en http://localhost:3002 (no en 127.0.0.1: una passkey no puede ser de una IP).
#
# Otra copia, aparte de esta: DEMO_PUERTO=3004 DEMO_DATOS=.data-auto bash pitch/demo.sh … (es la que usa pitch/grabar.ts,
# con una panadería que crean los scripts: CREAR=1 en `vecinos`).
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="$RAIZ/apps/web"
SALIDA="$RAIZ/pitch/out/demo"
PUERTO="${DEMO_PUERTO:-3002}"
DATOS="${DEMO_DATOS:-.data-demo}"
URL="http://localhost:$PUERTO"
# Los registros y los pid de otra copia van en su carpeta; los vecinos guardados de todas, en el mismo vecinos.json.
REGISTROS="$SALIDA${DEMO_PUERTO:+/$DEMO_PUERTO}"
mkdir -p "$REGISTROS"

# El node de verdad: el que hay en ~/.nvm, no el shim de Bun que está en el PATH.
NODE_BIN="$(ls -d "$HOME"/.nvm/versions/node/v24*/bin 2>/dev/null | tail -1 || true)"
[ -n "$NODE_BIN" ] || { echo "No encuentro Node 24 en ~/.nvm (el node del PATH es el shim de Bun)." >&2; exit 1; }
export PATH="$NODE_BIN:$HOME/.bun/bin:$PATH"

pids_en_puerto() { ss -ltnpH "sport = :${1:-$PUERTO}" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true; }

esperar_app() {
  for _ in $(seq 1 60); do
    curl -fs -m 2 "http://127.0.0.1:$PUERTO/api/health" >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "La app no respondió en 60 s: mira $REGISTROS/servidor-$PUERTO.log" >&2
  return 1
}

detener_app() {
  local pid puerto="${1:-$PUERTO}"
  for pid in $(pids_en_puerto "$puerto"); do kill "$pid" 2>/dev/null || true; done
  for _ in $(seq 1 10); do [ -z "$(pids_en_puerto "$puerto")" ] && return 0; sleep 0.5; done
  for pid in $(pids_en_puerto "$puerto"); do kill -9 "$pid" 2>/dev/null || true; done
}

detener_vecinos() {
  local archivo pid
  for archivo in "$REGISTROS/vecinos.pid" "$REGISTROS/inserto.pid"; do
    [ -f "$archivo" ] || continue
    pid="$(cat "$archivo")"
    # Cada uno corre en su propio grupo de procesos (setsid): se apaga el grupo entero.
    kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    rm -f "$archivo"
  done
  # Solo los procesos que empiezan así: sin el ancla, `pkill -f` también mataría a quien lo invoca si su línea de comandos nombra el archivo.
  pkill -f "^bun run src/(neighbors|inserto)\.ts .*localhost:($PUERTO|3003)" 2>/dev/null || true
}

# Arranca la app compilada en un puerto, con su base de datos; `setsid -f` se desprende de verdad (con `&` dentro de un subshell el script se quedaba esperando al servidor).
arrancar_en() {
  local puerto="$1" datos="$2"
  if [ -n "$(pids_en_puerto "$puerto")" ]; then echo "Ya hay algo escuchando en el puerto $puerto."; return 0; fi
  [ -d "$WEB/.next-demo" ] || { echo "Falta compilar: bash pitch/demo.sh construir" >&2; return 1; }
  (cd "$WEB" && NEXT_DIST_DIR=.next-demo NODUS_DATA_DIR="$datos" \
    setsid -f node node_modules/next/dist/bin/next start -H 127.0.0.1 -p "$puerto" >"$REGISTROS/servidor-$puerto.log" 2>&1 </dev/null)
  local i
  for i in $(seq 1 60); do
    curl -fs -m 2 "http://127.0.0.1:$puerto/api/health" >/dev/null 2>&1 && { echo "App lista en http://localhost:$puerto (solo desde este equipo)."; return 0; }
    sleep 1
  done
  echo "La app no respondió en 60 s: mira $REGISTROS/servidor-$puerto.log" >&2
  return 1
}

iniciar_app() { arrancar_en "$PUERTO" "$DATOS"; }

construir() {
  detener_app
  # `next build` con NEXT_DIST_DIR agrega esa carpeta a tsconfig.json y reescribe next-env.d.ts: se devuelven como estaban.
  local copia
  copia="$(mktemp -d "$SALIDA/respaldo.XXXXXX")"
  cp "$WEB/tsconfig.json" "$WEB/next-env.d.ts" "$copia/"
  # Con comillas dobles: la ruta se escribe ahora, porque al salir `copia` (local) ya no existe.
  trap "cp '$copia/tsconfig.json' '$WEB/tsconfig.json'; cp '$copia/next-env.d.ts' '$WEB/next-env.d.ts'; rm -rf '$copia'" EXIT
  (cd "$WEB" && NEXT_DIST_DIR=.next-demo node node_modules/next/dist/bin/next build)
  echo "Compilada. tsconfig.json y next-env.d.ts quedaron como estaban."
}

# Borra la base de la demo y los vecinos guardados: la cuenta de la panadería hay que crearla de nuevo.
reiniciar() {
  detener_vecinos
  detener_app
  if [ -n "${DEMO_PUERTO:-}" ]; then echo "«reiniciar» es solo para la copia principal: borra los vecinos guardados de todas." >&2; return 1; fi
  if [ -d "$WEB/.data-demo" ]; then gio trash "$WEB/.data-demo"; fi
  rm -f "$SALIDA/vecinos.json"
  iniciar_app
}

# Un proceso suelto en su propia sesión, con su registro y su pid (el de `setsid -f` es el del hijo: lo escribe él mismo).
en_segundo_plano() {
  local nombre="$1"; shift
  rm -f "$REGISTROS/$nombre.pid"
  (cd "$RAIZ/packages/e2e" && setsid -f bash -c 'echo $$ >"$1"; shift; exec "$@"' _ "$REGISTROS/$nombre.pid" "$@" >"$REGISTROS/$nombre.log" 2>&1 </dev/null)
}

# Una passkey de la panadería para los scripts. Sin enlace, busca en la base la invitación de dispositivo que espera.
llave() {
  local invitacion="${1:-}" nombre="${2:-Panadería Sur}"
  detener_vecinos
  if [ -z "$invitacion" ]; then
    detener_app
    invitacion="$(cd "$RAIZ/packages/e2e" && bun run src/demo-db.ts invitacion "$WEB/$DATOS" "$nombre" | tail -n 1)"
    iniciar_app
    [ -n "$invitacion" ] || { echo "No hay ninguna invitación esperando: en la app, «Equipo» → «Invitar un dispositivo» → «Crear enlace de invitación»." >&2; return 1; }
  fi
  echo "Ahora, en «Equipo»: «Agregar con passkey» (aparece a los pocos segundos)."
  (cd "$RAIZ/packages/e2e" && bun run src/llave.ts "$invitacion" "$URL")
}

vecinos() {
  # Los límites de uso (sesiones, relayer, faucet) se cuentan por IP y aquí todo viene de la misma: cada corrida parte de cero.
  con_la_base limites
  en_segundo_plano vecinos bun run src/neighbors.ts "${1:-Panadería Sur}" "$URL"
  echo "Vecinos en marcha (tardan ~1 min en estar listos). Registro: $REGISTROS/vecinos.log"
}

# Toma 3 literal: otra instancia (puerto 3003) con base propia, para que "Fletes Ruta 5" no se repita en la de la demo.
inserto() {
  detener_vecinos
  detener_app 3003
  if [ -d "$WEB/.data-inserto" ]; then gio trash "$WEB/.data-inserto"; fi
  arrancar_en 3003 .data-inserto
  en_segundo_plano inserto bun run src/inserto.ts "${1:-Fletes Ruta 5}" "http://localhost:3003"
  echo "Inserto en marcha en http://localhost:3003: crea ahí la cuenta \"${1:-Fletes Ruta 5}\"."
}

# Mira o toca la base con la app apagada (el Postgres embebido admite un solo proceso) y la vuelve a levantar.
# Los vecinos se detienen también: sin la app se caerían solos.
con_la_base() {
  detener_vecinos
  detener_app
  (cd "$RAIZ/packages/e2e" && bun run src/demo-db.ts "$1" "$WEB/$DATOS" "${@:2}") || true
  iniciar_app
}

estado() {
  if curl -fs -m 3 "http://127.0.0.1:$PUERTO/api/health" >/dev/null 2>&1; then echo "App: arriba en $URL"; else echo "App: apagada"; fi
  if [ -d "$WEB/$DATOS" ]; then echo "Base: $(du -sh "$WEB/$DATOS" | cut -f1) en apps/web/$DATOS"; else echo "Base: vacía (se crea al primer uso)"; fi
  if curl -fs -m 3 "http://127.0.0.1:3003/api/health" >/dev/null 2>&1; then echo "Inserto: app arriba en http://localhost:3003"; fi
  if [ -f "$SALIDA/vecinos.json" ]; then echo "Vecinos guardados: sí"; else echo "Vecinos guardados: no (se crean en la primera corrida)"; fi
  for nombre in vecinos inserto; do
    if [ -f "$REGISTROS/$nombre.pid" ] && kill -0 "$(cat "$REGISTROS/$nombre.pid")" 2>/dev/null; then
      echo "${nombre^}: corriendo. Últimas líneas:"; tail -n 5 "$REGISTROS/$nombre.log" | sed 's/^/    /'
    fi
  done
}

case "${1:-}" in
  construir) construir ;;
  reiniciar) reiniciar ;;
  iniciar) iniciar_app ;;
  llave) llave "${2:-}" "${3:-}" ;;
  vecinos) vecinos "${2:-}" ;;
  inserto) inserto "${2:-}" ;;
  cuenta) con_la_base cuenta ${2:+"$2"} ;;
  limites) con_la_base limites ;;
  detener) detener_vecinos; detener_app; detener_app 3003; echo "Apagado." ;;
  estado) estado ;;
  *) sed -n '2,21p' "${BASH_SOURCE[0]}"; exit 1 ;;
esac
