# Nodus

Compensación multilateral de deudas entre negocios sobre Stellar.

## La idea

Las pymes se deben plata entre sí en círculo: A le debe a B, B le debe a C, C le debe a A. Todas esperan cobrar para poder pagar, y la liquidez queda inmovilizada.

Nodus detecta esos círculos, cancela todas las deudas a la vez y liquida solo el saldo neto.

> Se saldan 3 millones moviendo 200 mil.

## Cómo funciona

1. **Registrar.** El acreedor registra lo que le deben y el deudor lo acepta con su firma.
2. **Detectar.** Un buscador fuera de cadena encuentra círculos de deudas y propone la compensación.
3. **Firmar.** Cada parte ve cuánto baja su deuda, cuánto baja su cuenta por cobrar y cuánto paga neto, y firma solo lo suyo.
4. **Liquidar.** Con la última firma, una sola transacción cancela todas las obligaciones del círculo y mueve los netos. O pasa todo, o no pasa nada.

## Por qué Stellar

- **Sin operador central.** Cada participante firma solo su parte (`require_auth`) y todas las firmas viajan en una misma transacción; no hace falta una cámara de compensación de confianza.
- **Atómico.** La cancelación de las deudas y el pago de los netos ocurren juntos o no ocurren.
- **Verificable.** Los eventos del contrato son el recibo.

## Dos formas de liquidar

Para un círculo donde A le debe 100 a B, B le debe 80 a C y C le debe 90 a A:

|                      | Qué se cancela                         | Dinero que se mueve                       |
| -------------------- | -------------------------------------- | ----------------------------------------- |
| **Liquidar todo**    | Las tres deudas completas: 270         | 20 (A y C pagan 10 cada uno, B recibe 20) |
| **Sin mover dinero** | Lo que las deudas tienen en común: 240 | 0. Quedan vigentes 20 y 10                |

En los dos casos nadie queda mejor ni peor que antes: lo que cada negocio deja de cobrar es igual a lo que deja de deber más lo que recibe.

## Probado en testnet

- Un círculo de 20 negocios liquidado en [una sola transacción](https://stellar.expert/explorer/testnet/tx/da968b3a8e5ec4a1008d67e5f6ef1bc9df330bf922fbb0e58862245558039b63) con 20 firmas de passkey. Usa el 33% del cómputo y el 44% del tamaño que la red permite por transacción.
- Un círculo de 3 liquidado [sin mover dinero](https://stellar.expert/explorer/testnet/tx/a2f068a9bf2dbdf736ddabf5860edcce487f0bf3230af49e246881f819558fdd) desde la aplicación web, con la comisión pagada por el relayer.

## Arquitectura

```
contracts/nodus          Contrato Soroban (Rust): registro de deudas y liquidación atómica
contracts/allowlist      Policy para smart accounts: limita una llave a algunas funciones de Nodus
packages/contract-client Cliente TypeScript generado desde el contrato
packages/stellar         Configuración de red, relayer y verificación de firmas de passkey
packages/solver          Buscador de círculos
packages/db              Esquema y migraciones de Postgres
packages/indexer         Copia los eventos del contrato a Postgres
packages/api             Tipos de lo que devuelve la API
packages/e2e             Despliegue y pruebas de punta a punta contra testnet
apps/web                 Aplicación Next.js y su API
```

- **Contrato.** El acreedor registra (`register`) y puede anular (`cancel`); el deudor acepta o rechaza (`accept`, `reject`) y puede pagar directo (`pay`). `settle` recibe las deudas a cancelar, calcula el neto de cada parte, exige la autorización de todas y mueve los netos en el token de liquidación. `keep_alive` evita que las deudas abiertas expiren en la red.
- **Cuentas.** Cada negocio es una smart account de OpenZeppelin controlada por una passkey. No hay frases semilla ni extensiones. Se puede agregar una passkey de respaldo, que puede todo, y la de un contador, que registra y acepta deudas pero no liquida ni mueve dinero.
- **Comisiones.** Todas las transacciones se envían por OpenZeppelin Relayer (Channels), así que ningún negocio necesita XLM.
- **Firmas.** Cada negocio firma su entrada de autorización por separado. El servidor las guarda y las reenvía, pero no puede alterarlas: el navegador comprueba que lo que firma es exactamente el círculo en pantalla, y el servidor verifica cada firma antes de aceptarla.
- **Buscador.** Corre fuera de cadena, dentro de la aplicación, cada vez que cambian las deudas. No es de confianza: el contrato valida todo de nuevo.

El detalle está en [docs/arquitectura.md](docs/arquitectura.md) y el modelo de confianza en [docs/seguridad.md](docs/seguridad.md).

## Cómo correrlo

Requisitos: [Bun](https://bun.sh), Rust con el target `wasm32v1-none` y [Stellar CLI](https://developers.stellar.org/docs/tools/cli/install-cli).

```bash
bun install
bun run contract:build                           # compila el contrato y la policy
cp packages/e2e/.env.example packages/e2e/.env   # y completar la clave del relayer
bun run deploy:testnet                           # despliega token de prueba, contrato y policy
bun run dev                                      # http://localhost:3000
```

`deploy:testnet` escribe en `apps/web/.env.local` las direcciones y las llaves que la aplicación necesita. Sin `DATABASE_URL` la aplicación usa un Postgres embebido; con ella se conecta a cualquier Postgres (`bun run db:migrate` aplica el esquema). Para publicarla en Vercel con Supabase, o con el `Dockerfile`, ver [despliegue](docs/arquitectura.md#despliegue).

### Pruebas

```bash
bun run contract:test    # contratos
bun run test             # buscador, indexador, firmas e interfaz
bun run e2e:settle 3 10  # mide una liquidación de 3 y de 10 negocios en testnet
bun run e2e:netting      # deudas, indexador, buscador y liquidación en testnet
```

Con `--relayer`, `e2e:settle` y `e2e:netting` envían la liquidación por el relayer. La CI corre además `format:check`, `lint`, `typecheck` y el build de la aplicación.

`bun run deploy:sandbox && bun run dev:sandbox` levanta una segunda instancia en el puerto 3001 con llaves de prueba en vez de passkeys, y `bun run e2e:web http://localhost:3001` la recorre completa. `bun run demo:neighbors <dirección>` le da a tu negocio dos vecinos que maneja un script, para cerrar un círculo sin jugar todos los papeles.

## Límites conocidos

- Las deudas las declaran las partes; no hay conexión con facturas del SII.
- La identidad de los negocios no se verifica: el nombre es solo un rótulo.
- La compensación en cadena no tiene por sí sola efecto legal ni contable.
- Quién le debe a quién y cuánto queda público. La aplicación no nombra a los terceros de un círculo, pero sus deudas están en la cadena y el servidor las ve todas.
- El token de liquidación es un activo de prueba, no USDC real.
- La aplicación propone círculos de hasta 8 negocios; el de 20 se armó con un script.
- Corre solo en testnet y nada está auditado. Lo que habría que revisar antes de mainnet está en [docs/seguridad.md](docs/seguridad.md).

## Licencia

[MIT](LICENSE). Proyecto para [Find Your Way: Hackathon](https://blog.telluscoop.com/p/findyourway).
