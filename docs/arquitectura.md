# Arquitectura

Cómo está hecho Nodus por dentro: qué corre dónde, cómo pasa una deuda de registrada a cancelada y qué hace la aplicación entre medio. La idea está en el [README](../README.md); el modelo de confianza, en [seguridad.md](seguridad.md).

## Piezas

```text
                 Navegador de cada negocio
        interfaz React · smart-account-kit · passkey
               |                               |
               | /api/* (cookie de sesión)     | simula y lee la red
               v                               v
     Servidor Next.js (Vercel) ---------> RPC de Soroban · Horizon
     rutas API, indexador, buscador,           |
     sesiones, propuestas, avisos              |
          |                |                   v
          v                v             Stellar testnet
      Postgres       OpenZeppelin -----> contrato Nodus · token de liquidación ·
     (Supabase)        Channels          policy allowlist · cuentas inteligentes ·
                    (envía y paga)       verificador WebAuthn
```

| Pieza                | Dónde corre                                                                                       | Qué hace                                                                                 | Código                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Contrato Nodus       | Soroban, testnet                                                                                  | Guarda las deudas y ejecuta las liquidaciones. Es la fuente de verdad.                   | `contracts/nodus`                                               |
| Policy allowlist     | Soroban, testnet                                                                                  | Deja que la llave de un contador llame solo algunas funciones de Nodus.                  | `contracts/allowlist`                                           |
| Cuentas inteligentes | Soroban: el contrato de cuenta de OpenZeppelin que despliega `smart-account-kit` 0.8              | Una por negocio. Sus reglas dicen qué passkey firma qué.                                 | `ACCOUNT_WASM_HASH` y `WEBAUTHN_VERIFIER` en `packages/stellar` |
| Token de liquidación | Stellar Asset Contract de un activo `USDC` que emite la cuenta operadora del despliegue           | En él se pagan los netos y los pagos directos.                                           | `deployWorld` en `packages/e2e/src/harness.ts`                  |
| Indexador            | Dentro de la app, en cada lectura y en `/api/sync`                                                | Copia los eventos del contrato a Postgres y cuadra la copia con el contrato.             | `packages/indexer`                                              |
| Buscador             | Dentro de la app, después de cada cambio                                                          | Encuentra círculos entre las deudas aceptadas.                                           | `packages/solver`, `apps/web/src/server/circles.ts`             |
| Postgres             | Supabase en producción; sin `DATABASE_URL`, PGlite (Postgres en WebAssembly) en `apps/web/.data/` | Copia de las deudas, propuestas y firmas, passkeys conocidas, nombres, avisos y límites. | `packages/db`                                                   |
| Aplicación           | Next.js en Vercel, o el `Dockerfile`                                                              | Interfaz y rutas `/api`.                                                                 | `apps/web`                                                      |
| Relayer              | OpenZeppelin Channels de testnet, servicio externo                                                | Envuelve cada invocación en una transacción de sus propias cuentas y paga la comisión.   | `relay` en `packages/stellar/src/index.ts`                      |

Además: `packages/api` tiene los tipos de lo que devuelve la API, compartidos por la app y los scripts; `packages/contract-client` es el cliente del contrato, generado con `bun run contract:bindings`; `packages/e2e` despliega y prueba contra testnet.

No hay procesos aparte. El indexador y el buscador son bibliotecas que corren dentro de las rutas de Next.js; lo único que corre sin que nadie abra la app es el cron que llama a `/api/sync`.

## Ciclo de vida de una deuda

En el contrato una deuda es `Obligation { debtor, creditor, amount, accepted, reference, due }`, guardada bajo `Obligation(id)` con ids correlativos desde 0 (`count()` dice cuántas se han registrado).

```text
                       register (firma el acreedor)
                                  |
                                  v
       reject (deudor)      +-----------+      cancel (acreedor)
   rejected <-------------- |  pending  | ----------------------> cancelled
                            +-----------+                              ^
                                  | accept (deudor)                    |
                                  v                                    |
                            +-----------+      cancel (acreedor)       |
                            | accepted  | -----------------------------+
                            +-----------+
                                  | settle (todas las partes) o pay (deudor)
                                  v
                       baja el monto; si llega a 0: settled
```

| Función                                              | Quién firma | Qué hace                                                                                                      |
| ---------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| `register(creditor, debtor, amount, reference, due)` | acreedor    | Crea la deuda sin aceptar y devuelve su id. El monto debe ser positivo y las partes distintas.                |
| `accept(id)`                                         | deudor      | La acepta. Solo una deuda aceptada puede liquidarse o pagarse.                                                |
| `reject(id)`                                         | deudor      | La borra, si todavía no la había aceptado.                                                                    |
| `cancel(id)`                                         | acreedor    | La borra, aceptada o no: la perdona o se pagó por fuera.                                                      |
| `pay(id, amount)`                                    | deudor      | Paga parte o todo en el token, directo al acreedor. Si queda en 0, se borra.                                  |
| `settle(clearings)`                                  | cada parte  | Cancela deudas y mueve solo los netos. Ver [cómo se firma un círculo](#cómo-se-encuentra-y-firma-un-círculo). |
| `keep_alive(ids)`                                    | nadie       | Extiende la vida en la red de las deudas que siguen guardadas.                                                |
| `obligation(id)`, `count()`, `token()`               | nadie       | Lectura.                                                                                                      |

Cada cambio emite un evento (`Registered`, `Accepted`, `Rejected`, `Cancelled`, `Paid`, `Cleared` por cada deuda que toca una liquidación y `Settled` con el resumen: cuánto se canceló, cuánto se movió y cuántas partes hubo). El indexador los traduce a los estados de la tabla `obligations`: `pending`, `accepted`, `rejected`, `cancelled`, `settled` y `expired`. En la cadena una deuda rechazada, anulada o pagada entera desaparece; en Postgres queda con su estado final.

**Referencia.** `reference` es el SHA-256 del texto que escribe el acreedor (un número de factura, por ejemplo), sin espacios al borde. La cadena guarda solo el hash. La app manda el texto a `POST /api/notes`, que lo guarda en `notes` solo si quien escribe es parte de la deuda y el hash coincide; la API lo devuelve como `note` a las dos partes.

**Vencimiento.** `due` es una fecha Unix en segundos. Es informativa: el contrato no la usa, la app la muestra.

**Vida en la red.** Cada escritura extiende la entrada de la deuda a 120 días (`TTL_EXTEND_TO`, con 17.280 ledgers por día), y cada llamada hace lo mismo con la instancia del contrato. `keep_alive` hace lo mismo sin pedir firmas, y el mantenimiento lo llama cada semana con todas las deudas `pending` y `accepted`, de a 50 por transacción y por el relayer. Si una deuda pasa 120 días sin que nada la toque, la red la archiva; el siguiente `reconcile` no la encuentra y la marca `expired`.

Los errores del contrato (`InvalidAmount` = 1 a `ExceedsObligation` = 8) los traduce `explain` en `apps/web/src/lib/actions.ts`.

## Cómo se encuentra y firma un círculo

### Búsqueda

1. Después de cada cambio en las deudas o en las propuestas (`afterChange`), `recomputeCandidates` toma las deudas aceptadas con saldo (`settleable`), les descuenta lo que ya comprometen las propuestas `open` o `submitted` y corre `search`.
2. `search` trata todas las deudas de un negocio con otro como una sola arista, recorre los ciclos simples de hasta 8 negocios (`MAX_PARTIES`), los ordena por la deuda que liberan más allá del dinero que mueven (a igualdad, menos partes primero) y los toma en ese orden, saltando los que comparten una deuda con uno ya tomado. Se detiene a los 2 segundos (`BUDGET_MS`) o a los 50.000 círculos, y lo dice (`cutShort`).
3. Para cada círculo que mueve dinero calcula también la versión sin dinero (`withoutMoney`), que cancela solo lo que todas sus deudas tienen en común.
4. El resultado queda en la tabla `candidates`, una fila por contrato. Las lecturas no corren el buscador: filtran esa fila por negocio.

### Firma

```text
Navegador de una parte                    Servidor                                      Red
POST /api/proposals {clearings} ------->  ¿hay una propuesta abierta para este círculo?
                                          si no: refresh(true), busca de nuevo y exige
                                          que el círculo esté entre los ofrecidos;
                                          revisa el saldo de quienes pagan neto;
                                          simula settle sin firmas  ------------------> RPC
                                          guarda la propuesta y una entrada de
                                          autorización por parte
                <-----------------------  su entrada sin firmar y el ledger de vencimiento
assertMatches(entrada, círculo en pantalla)
kit.signAuthEntry: pide la passkey
POST /api/proposals/<id>/signatures ---->  isSignatureOf + isOwnerSignature; guarda la firma
                                          ¿era la última? open -> submitted
                                          relay(func, firmas) ---------------> Channels -> red
                                          espera la confirmación: settled o failed
```

- **Una propuesta por círculo.** La clave es `clearingsKey`: SHA-256 del contrato y de las deudas ordenadas como `id:monto`. Un índice único (`proposals_under_way`) admite una sola propuesta `open` o `submitted` por clave: si dos partes empiezan a la vez, una gana y la otra se suma.
- **Solo lo que ofrece el buscador.** Una propuesta nueva se abre solo si el círculo está entre los que el buscador ofrece en ese momento, así nadie puede amarrar deudas con propuestas inventadas.
- **Entradas por parte.** La propuesta guarda `func` (la invocación de `settle` en XDR) y, en `authorizations`, la entrada sin firmar de cada parte con su nonce. Las firmas vencen en `expirationLedger`: el ledger actual más 17.280, cerca de un día.
- **El navegador revisa lo que firma.** `assertMatches` (`apps/web/src/lib/actions.ts`) se niega a firmar si la entrada no es de esta cuenta, si no invoca `settle` del contrato Nodus, si las deudas no son exactamente las del círculo en pantalla y en el mismo orden, o si sobra o falta una transferencia: sin neto a pagar no puede haber ninguna, y con neto a pagar debe haber una sola, `transfer(cuenta, contrato, neto)` en el token, por el neto mostrado.
- **El servidor revisa cada firma.** Antes de guardarla, `isSignatureOf` comprueba que la entrada firmada tiene la misma dirección, invocación, nonce y vencimiento que la pedida, y una firma en su lugar. Luego `isOwnerSignature` exige que la firma sea de una passkey de una regla `Default` sin políticas de esa cuenta, bajo esa regla, con `isSignedByPasskey` (`packages/stellar/src/passkey.ts`), que repite fuera de la cadena lo que comprueban la cuenta y su verificador: el resumen de la entrada y de las reglas, el tipo `webauthn.get`, las marcas de presencia y verificación del usuario, la `s` baja y la firma P-256.
- **Un solo envío.** Con la última firma, solo la petición que logra pasar la propuesta de `open` a `submitted` la envía. `relay` le pasa a Channels `func` y todas las entradas firmadas; Channels arma la transacción y paga la comisión. El servidor espera la confirmación (20 consultas) y marca `settled`, o `failed` con el motivo en castellano.

```text
              última firma                confirmada
     open --------------------> submitted ------------> settled
       |                            |
       | vence el plazo, o las      | la red la rechaza o no la confirma,
       | deudas cambiaron           | o el envío quedó a medias (120 s)
       v                            v
     failed <-----------------------+
```

`closeStaleProposals`, en cada `afterChange`, cierra las propuestas abiertas cuyo ledger venció o cuyas deudas ya no alcanzan para lo que cancelan, las `submitted` sin hash 120 segundos después de la última firma y las `submitted` con hash según lo que diga el RPC de la transacción. Una propuesta fallida libera sus deudas, y su motivo aparece en el círculo si el buscador lo vuelve a ofrecer. Un círculo liquidado sigue en pantalla hasta 15 minutos después de abierta su propuesta.

## Sesión y cuentas

### Crear la cuenta

`createWallet` del kit crea una passkey para el dominio de la app y despliega una cuenta inteligente cuya regla 0 (`Default`, sin políticas) tiene esa passkey como único firmante: un firmante `External` con el verificador WebAuthn y, como `keyData`, la llave pública de 65 bytes seguida del id de la passkey. El despliegue va por `/api/relay`. Después el navegador publica el registro de la passkey (`POST /api/credentials`), abre la sesión y le pone nombre al negocio (`POST /api/businesses`).

### Abrir sesión

```text
Navegador                                     Servidor
GET /api/session/challenge  ----------------> nonce de 32 bytes en `challenges` (5 min, un uso) y rpId
navigator.credentials.get: passkey con huella, rostro o PIN
POST /api/session {assertion} --------------> busca la passkey en `credentials`
                                              gasta el nonce
                                              verifyAssertion: tipo, nonce, origen, hash del rpId,
                                              presencia y verificación del usuario, firma P-256
                                              lee la regla de la passkey en la cadena: owner o clerk
                  <-------------------------- cookie nodus_session y los registros de todas
                                              las passkeys de la cuenta
seedCredentials: los escribe en la IndexedDB del kit
kit.connectWallet({ credentialId, contractId })
```

La sesión no se guarda en el servidor: la cookie `nodus_session` lleva `{ address, credentialId, ruleId, role, expiresAt }` en base64url y una firma HMAC-SHA256 con `NODUS_SESSION_SECRET`. Es HttpOnly, SameSite=Lax, Secure en producción y dura 30 días. El rol sale de la regla en la cadena: `owner` si es `Default` sin políticas, `clerk` si no. Las rutas se protegen con `requireSession` y `requireOwner` (`apps/web/src/server/session.ts`).

### La tabla `credentials`

No se cree nada de lo que manda el navegador. `registerCredential` guarda una passkey solo si la regla `contextRuleId` de la cuenta la nombra en la cadena. Los datos de creación (`birth`: hash del wasm, hash de la transacción de creación, su ledger y el hash de los argumentos del constructor) se contrastan con la transacción misma: se busca en el RPC y, si ya la olvidó, en Horizon; el hash tiene que ser el de afuera (el relayer envuelve la creación en un fee bump), y la operación tiene que crear, con el wasm de la cuenta, exactamente esa dirección con esos argumentos. Por eso la ruta no pide sesión: basta lo que dice la red.

### Entrar desde otro dispositivo

`smart-account-kit` 0.8, sin indexador, solo se conecta a una cuenta si tiene en su almacenamiento el registro de la passkey con los datos de creación. Para que un negocio entre desde otro navegador:

1. El navegador que creó la cuenta publica su registro al crearla y cada vez que carga la app (`publishCredential`).
2. En el otro dispositivo, "Entrar" pide cualquier passkey del dominio: una sincronizada por el sistema o la del teléfono. El servidor la encuentra en `credentials`, verifica la aserción y devuelve los registros de todas las passkeys de la cuenta.
3. `seedCredentials` (`apps/web/src/lib/kit.ts`) los escribe en el almacenamiento del kit, con las passkeys secundarias marcadas como asociación ya verificada, y `connectWallet` conecta. El kit vuelve a comprobar los datos de creación contra la red (RPC o Horizon).

Al cargar, `SessionProvider` (`apps/web/src/lib/session.tsx`) cuadra las dos memorias: si la API y el kit conocen la misma cuenta, entra; si la API tiene sesión pero el kit no conoce la cuenta, pide `GET /api/credentials` y siembra; si solo el kit la conoce, publica el registro y pide un toque de la passkey para abrir la sesión de nuevo.

### Respaldo y contador

| Llave            | Regla en la cuenta                                                                                               | Rol de la sesión | Puede                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------- |
| Passkey original | 0, `Default`, sin políticas                                                                                      | `owner`          | Todo.                               |
| Respaldo         | Una regla `Default` propia, sin políticas, con solo esa passkey                                                  | `owner`          | Todo, incluso firmar liquidaciones. |
| Contador         | `CallContract(<contrato Nodus>)` con la policy allowlist instalada con `register`, `accept`, `reject` y `cancel` | `clerk`          | Solo esas cuatro funciones.         |

Cada passkey tiene su propia regla, así que firma sola. La app firma cada invocación bajo la regla de la sesión (`configureSigner` y `ruleIds` en `actions.ts`). Qué puede y qué no un contador está en [seguridad.md](seguridad.md#qué-puede-y-qué-no-puede-un-contador).

```text
Dueño     POST /api/invitations {role, label} ----> invitación de 7 días: enlace /invitacion/<id>
Invitado  abre el enlace; GET /api/invitations/<id> dice el negocio y el rol
          crea una passkey sobre un nonce del servidor
          POST /api/invitations/<id> {id, clientDataJSON, publicKey} ----> registered
Dueño     kit.rules.add(regla según el rol, [passkey del invitado]), firmado con su passkey
          PATCH /api/invitations/<id> {ruleId}: el servidor comprueba en la cadena que esa
          regla nombra la passkey y la guarda en `credentials` ----> added
Invitado  entra con su passkey, como cualquiera
```

Para quitar una passkey, el dueño borra su regla en la cadena (`kit.rules.remove`, firmado con la suya) y luego llama a `DELETE /api/team`; el servidor la marca revocada solo si la cadena ya no la nombra. La app no ofrece quitar la passkey original ni la de la sesión en curso.

## Lo que ve cada negocio

`GET /api/state` devuelve un `StateView` (`packages/api/src/index.ts`) armado para la cuenta de la sesión por `getState` (`apps/web/src/server/state.ts`):

- **Deudas.** Solo aquellas en que es deudor o acreedor, con su nota si la hay.
- **Círculos.** Los que están en firma y tienen una entrada suya, los candidatos donde participa y los liquidados cuya propuesta se abrió hace menos de 15 minutos. De cada parte ve dirección y números solo de sí mismo y de los dos con que trata en ese círculo. El resto llega como `anon:` seguido de 12 caracteres hexadecimales al azar, con `owesLess`, `owedLess` y `net` en `"0"` y solo la marca `signed`. Los marcadores los inventa el `Viewer` por cada círculo que arma: un mismo tercero tiene uno distinto en cada círculo y en cada lectura.
- **Aristas.** Una por par de negocios; `amount` solo en las que tocan al que mira y `null` en las demás.
- **`clearings`.** La lista completa de ids y montos del círculo, porque el navegador la necesita para comprobar lo que firma. Ver [seguridad.md](seguridad.md#qué-no-protege).
- **Directorio.** `businesses` trae nombres solo del que mira, de sus contrapartes y de sus vecinos en círculos. Para registrar una deuda con alguien nuevo está `GET /api/businesses?q=` (dos letras o más, hasta 8 resultados) o `?address=` (exacta), con sesión.
- **Historial.** Las 10 liquidaciones más recientes vienen con el estado y `settlementsTotal` dice cuántas hay; el resto se pide a `GET /api/settlements?offset=&limit=` (hasta 50 por página). Una liquidación es del negocio si canceló alguna de sus deudas; se rearma desde los eventos `cleared` y `settled` de su transacción, con la misma reserva sobre terceros.
- **Red.** `network` suma, sin decir quién, cuántos negocios tienen nombre, cuántas liquidaciones ha habido y cuánto se canceló y se movió en total.
- **Otros.** El saldo del token (leído directo del almacenamiento del token), si la instalación entrega fondos de prueba (`faucet`) y la llave pública para avisos (`push`).

## Sincronización y mantenimiento

```text
lectura: /api/state, cada 3 s por pestaña       cron: /api/sync, cada hora
              |                                          |
              v                                          v
refresh(): si pasaron más de 2 s                 maintain(): refresh(true)
  sync(): eventos nuevos desde el cursor           keep-alive, si pasaron 7 días
  si hubo un hueco: reconcile()                    reconcile, si pasó un día
  si hubo cambios, o cada 30 s: afterChange()      (la tabla jobs recuerda cuándo)
              |
              v
afterChange(): cierra propuestas vencidas, busca círculos y manda avisos
```

- **En cada lectura.** `refresh` sincroniza si la copia tiene más de 2 segundos, una vez a la vez por instancia. Después de una transacción propia, el navegador pide `/api/state?fresh=1`, que fuerza `refresh(true)`.
- **`sync`.** Pide al RPC los eventos del contrato desde el cursor, de a 200, y aplica cada uno una sola vez (la llave es el id del evento) en la misma transacción que guarda el cursor (`cursors`). La primera vez parte en `NODUS_DEPLOY_LEDGER`, o en el ledger más antiguo que guarda el RPC si ese ya no está o si la variable falta.
- **Retención.** El RPC guarda cerca de una semana de eventos. Si el cursor queda fuera, el indexador sigue desde lo más antiguo que hay y avisa el hueco; `reconcile` cuadra entonces la copia leyendo directo el almacenamiento del contrato: agrega deudas que no conocía, corrige monto y aceptación, y marca `expired` las que el contrato ya no guarda. El cron de cada hora mantiene el cursor dentro de la ventana aunque nadie use la app. Para transacciones viejas, como la creación de una cuenta, el servidor y el kit consultan Horizon, que guarda toda la historia.
- **`/api/sync`.** Acepta GET y POST. Si existe `CRON_SECRET`, exige `Authorization: Bearer <CRON_SECRET>`, que Vercel manda solo; si no existe, en producción rechaza todo y en desarrollo queda abierta. `vercel.json` la programa con `0 * * * *` y puede durar hasta 300 segundos.
- **`/api/health`.** Dice si responden la base y el RPC (200 o 503), si hay relayer y avisos configurados, y hace cuánto sincronizó esta instancia (`lagSeconds`). Esa hora y los cachés (ledger 3 s, saldos 3 s, reglas de cuentas 60 s) viven en la memoria de cada instancia.

## Avisos

- **Llaves.** Con `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` la instalación puede mandar avisos; el estado entrega la pública en `push`. `VAPID_SUBJECT` es el contacto que exige el protocolo.
- **Suscripción.** Desde Equipo, el navegador registra el service worker `public/sw.js`, pide permiso, se suscribe con la llave pública y manda la suscripción a `POST /api/push/subscribe` (solo URLs `https`). `DELETE` la borra.
- **Qué se avisa.** `notifyChanges` corre en cada `afterChange` y tras cada firma que no es la última. Solo considera negocios con suscripción: una deuda pendiente registrada en las últimas 24 horas (al deudor), un círculo en firma de las últimas 24 horas donde falta su firma, un círculo liquidado en las últimas 24 horas y un círculo encontrado que nadie empezó a firmar.
- **Una vez.** Cada aviso tiene un id `tipo:asunto:dirección` que se guarda en `notifications`, así no se repite. Se envía con TTL de una hora; si el servicio de push responde 404 o 410, la suscripción se borra.
- **Service worker.** Muestra el aviso con título, texto e ícono, y al tocarlo enfoca una ventana abierta de la app y la lleva a la página del aviso, o abre una nueva.

## Variables de entorno

| Nombre                                  | Quién la usa                                                                                               | Cómo obtenerla                                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_NODUS_CONTRACT`            | Navegador y servidor. Obligatoria.                                                                         | `bun run deploy:testnet`                                                                                  |
| `NEXT_PUBLIC_TOKEN_CONTRACT`            | Navegador y servidor. Obligatoria.                                                                         | `bun run deploy:testnet`                                                                                  |
| `NEXT_PUBLIC_ALLOWLIST_POLICY`          | Navegador, al agregar un contador. Sin ella no se puede invitar contadores.                                | `bun run deploy:testnet`                                                                                  |
| `NODUS_DEPLOY_LEDGER`                   | Indexador, la primera vez que sincroniza.                                                                  | `bun run deploy:testnet`                                                                                  |
| `TOKEN_ISSUER_SECRET`                   | `/api/faucet`. Con ella aparece el botón de fondos de prueba.                                              | `bun run deploy:testnet` (la llave de la cuenta operadora que emitió el token)                            |
| `OZ_CHANNELS_API_KEY`                   | `/api/relay`, liquidaciones, `keep_alive`, faucet y los scripts de `packages/e2e`.                         | `curl https://channels.openzeppelin.com/testnet/gen`; `deploy:testnet` la copia desde `packages/e2e/.env` |
| `DATABASE_URL`                          | Servidor, `bun run db:migrate`, `e2e:netting`. Obligatoria en Vercel.                                      | La cadena de conexión de Supabase (sirve el pooler: la app no usa sentencias preparadas)                  |
| `NODUS_SESSION_SECRET`                  | Firma de las cookies. Obligatoria en producción; en desarrollo se guarda una en `.data/`.                  | `deploy:testnet` la genera; o `openssl rand -base64 32`                                                   |
| `CRON_SECRET`                           | `/api/sync`. Obligatoria en producción para que el mantenimiento corra.                                    | Cualquier texto largo al azar                                                                             |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Avisos.                                                                                                    | `deploy:testnet` las genera; o `bunx web-push generate-vapid-keys`                                        |
| `VAPID_SUBJECT`                         | Avisos. Por omisión `mailto:hola@nodus.cl`.                                                                | Un `mailto:` o una URL de contacto                                                                        |
| `NEXT_PUBLIC_APP_URL`                   | Enlaces absolutos de las tarjetas para compartir. Si falta, usa `VERCEL_PROJECT_PRODUCTION_URL`.           | La URL pública                                                                                            |
| `NEXT_PUBLIC_SOFTWARE_PASSKEYS`         | Navegador: con `1`, llaves en el almacenamiento del navegador en vez de passkeys. Se ignora en producción. | Solo para pruebas; `dev:sandbox` la pone                                                                  |
| `NODUS_DATA_DIR`                        | Dónde viven el Postgres embebido y el secreto de sesión de desarrollo (`.data`).                           | `dev:sandbox` usa `.data-sandbox`                                                                         |
| `NEXT_DIST_DIR`                         | `next.config.ts`: carpeta del build.                                                                       | `dev:sandbox` usa `.next-sandbox`                                                                         |
| `NEXT_OUTPUT`                           | `next.config.ts`: con `standalone`, build autocontenido.                                                   | Lo pone el `Dockerfile`                                                                                   |

Next.js fija las `NEXT_PUBLIC_*` en el código del navegador al compilar: cambiarlas exige compilar de nuevo.

## Scripts

| Comando                                               | Qué hace                                                                                                                |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `bun run contract:build`                              | Compila los contratos a WebAssembly (`stellar contract build --optimize`).                                              |
| `bun run contract:test`                               | Pruebas de los contratos (`cargo test`).                                                                                |
| `bun run contract:bindings`                           | Regenera `packages/contract-client` desde `nodus.wasm`.                                                                 |
| `bun run deploy:testnet`                              | Despliega token de prueba, contrato y policy, y escribe `apps/web/.env.local`.                                          |
| `bun run deploy:sandbox`                              | Lo mismo, en `apps/web/.env.sandbox`.                                                                                   |
| `bun run dev`                                         | La app en `http://localhost:3000`.                                                                                      |
| `bun run dev:sandbox`                                 | Una segunda instancia en el puerto 3001, con llaves de software, su propio contrato y su propia base (`.data-sandbox`). |
| `bun run db:migrate`                                  | Aplica las migraciones al Postgres de `DATABASE_URL`.                                                                   |
| `bun run test`                                        | `bun test` en cada paquete: buscador, indexador, firmas de passkey, círculos candidatos y componentes.                  |
| `bun run typecheck`, `lint`, `format`, `format:check` | TypeScript, ESLint y Prettier.                                                                                          |
| `bun run e2e:settle 3 10 [--relayer]`                 | Mide en testnet una liquidación de cada tamaño; con `--relayer` la envía el relayer.                                    |
| `bun run e2e:netting [--relayer]`                     | Deudas, indexador, buscador y liquidación en testnet.                                                                   |
| `bun run e2e:web [url]`                               | Recorre una instancia de la app por su API, con llaves de software.                                                     |
| `bun run demo:neighbors <dirección> [url]`            | Le da a un negocio dos vecinos que maneja un script, para cerrar un círculo sin jugar todos los papeles.                |

La CI (`.github/workflows/ci.yml`) corre `format:check`, `lint`, `typecheck`, `test` y el build de la app con direcciones de contrato de relleno, y aparte compila los contratos y corre sus pruebas.

## Despliegue

### Vercel y Supabase

1. Crear el Postgres en Supabase y aplicar el esquema: `DATABASE_URL=… bun run db:migrate`. La app migra sola solo el Postgres embebido, nunca uno externo.
2. Correr `bun run deploy:testnet` y copiar a Vercel las variables de `apps/web/.env.local`, más `DATABASE_URL`, `CRON_SECRET` y `NEXT_PUBLIC_APP_URL`.
3. El proyecto compila `apps/web`. `vercel.json` trae el cron de cada hora; Vercel lo lee del directorio raíz del proyecto, así que si el proyecto apunta a `apps/web` el archivo tiene que estar ahí.
4. En Vercel, sin `DATABASE_URL` la app se niega a partir: el Postgres embebido no tiene disco donde guardarse.

Las rutas largas declaran su duración: `/api/relay`, `/api/faucet` y `/api/proposals/<id>/signatures` hasta 60 segundos, `/api/sync` hasta 300.

### Docker

El `Dockerfile` de la raíz es para otros hosts. Instala con Bun, compila con Node 24 en modo `standalone` y corre `node apps/web/server.js` como usuario `node` en el puerto 3000:

```bash
docker build -t nodus --build-arg NEXT_PUBLIC_NODUS_CONTRACT=C… --build-arg NEXT_PUBLIC_TOKEN_CONTRACT=C… .
docker run -p 3000:3000 --env-file apps/web/.env.local nodus
```

Las `NEXT_PUBLIC_*` van como argumentos de build (también `NEXT_PUBLIC_ALLOWLIST_POLICY` y `NEXT_PUBLIC_APP_URL`). La imagen corre en modo producción: pide `NODUS_SESSION_SECRET`, `/api/sync` no corre sin `CRON_SECRET` y no trae cron, así que algo de afuera tiene que llamarla cada hora con el token. Copia las migraciones para el Postgres embebido, pero la carpeta de la app no es del usuario `node`, así que en la práctica necesita `DATABASE_URL` (con `bun run db:migrate` aplicado antes).

### Reinicios de testnet

Testnet se reinicia de vez en cuando y se lleva contratos y cuentas. Después hay que desplegar de nuevo y conviene una base vacía: las deudas, eventos y propuestas llevan `contract_id`, pero los nombres y las passkeys no.

## Límites de abuso

`LIMITS` en `apps/web/src/server/limits.ts`. Cada límite es una ventana fija guardada en `rate_limits`, así que vale para todas las instancias, y se cuenta de forma atómica. Pasado el límite la API responde 429, con `Retry-After` salvo en `/api/relay`.

| Límite             | Clave               | Máximo       | Dónde                                                                                                                                             |
| ------------------ | ------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `faucetPerAddress` | `faucet:<cuenta>`   | 3 por día    | `POST /api/faucet`                                                                                                                                |
| `faucetPerIp`      | `faucet:ip:<ip>`    | 20 por día   | `POST /api/faucet`                                                                                                                                |
| `accountsPerIp`    | `relay:create:<ip>` | 10 por hora  | `POST /api/relay`, cuando crea una cuenta                                                                                                         |
| `relayPerIp`       | `relay:<ip>`        | 120 por hora | `POST /api/relay`                                                                                                                                 |
| `sessionPerIp`     | `session:<ip>`      | 60 por hora  | `GET /api/session/challenge`, `POST /api/session`, `POST /api/credentials`, `POST /api/invitations/<id>`                                          |
| `directoryPerIp`   | `directory:<ip>`    | 120 por hora | `GET /api/businesses`                                                                                                                             |
| `writesPerAddress` | `writes:<cuenta>`   | 120 por hora | `POST /api/businesses`, `POST /api/invitations`, `PATCH /api/invitations/<id>`, `DELETE /api/team`, `POST /api/notes`, `POST /api/push/subscribe` |

La IP es el primer valor de `x-forwarded-for` (o `x-real-ip`). Sin límite propio quedan las lecturas con sesión (`/api/state`, `/api/settlements`, `/api/team`, `GET /api/credentials`), `GET /api/invitations/<id>`, `DELETE /api/invitations/<id>`, `DELETE /api/push/subscribe`, `/api/health`, `/api/sync` (protegida por su token) y las propuestas y firmas (`/api/proposals`, `/api/proposals/<id>/signatures`).

Otros topes: hasta 200 deudas por propuesta, círculos de hasta 8 negocios, búsquedas de hasta 2 segundos, nombres de negocio de 2 a 40 caracteres, referencias de hasta 120 y páginas de historial de hasta 50.
