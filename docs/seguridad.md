# Seguridad

Qué cuida la red, qué cuida la aplicación y qué no cuida nadie. Nada de esto está auditado. Cómo funciona cada pieza está en [arquitectura.md](arquitectura.md).

## Qué protege la cadena

- **Atomicidad.** `settle` cancela las deudas y mueve los netos en la misma invocación. Si falta una autorización, si una deuda cambió o si a alguien no le alcanza para su neto, falla la transacción entera y nada cambia.
- **Cada parte autoriza lo suyo.** `settle` calcula el neto de cada dirección que aparece en las deudas y llama `require_auth` para cada una, también para las que quedan en cero. La firma de una parte cubre la invocación exacta (`settle` con esas deudas y esos montos, en ese orden), su transferencia si le toca pagar, un nonce y un ledger de vencimiento. No sirve para otra liquidación ni se puede reutilizar.
- **Nadie queda mejor ni peor.** El contrato calcula los netos, no los recibe: lo que cada parte deja de cobrar es lo que deja de deber más lo que recibe. Vale para cualquier conjunto de deudas, sea o no un círculo. Primero pagan los que deben neto y después cobran los que reciben; el contrato termina con el mismo saldo con que empezó.
- **Reglas de cada deuda.** `register` lo firma el acreedor; `accept`, `reject` y `pay`, el deudor; `cancel`, el acreedor. Una deuda sin aceptar no se puede liquidar ni pagar. Las deudas de un `settle` tienen que venir ordenadas por id y sin repetir, aceptadas, con montos positivos y no mayores que lo adeudado.
- **El buscador no es de confianza.** Corre en el servidor y puede equivocarse. Lo peor que logra es proponer algo que nadie firma o que el contrato rechaza.
- **Las cuentas.** Cada negocio es una cuenta inteligente de OpenZeppelin. La red solo acepta firmas que las reglas de esa cuenta admiten, verificadas por el contrato verificador de WebAuthn.

## Qué protege la aplicación

- **Lo que se firma lo revisa el navegador.** Antes de pedir la passkey, `assertMatches` (`apps/web/src/lib/actions.ts`) comprueba que la entrada es para esta cuenta, que invoca `settle` del contrato Nodus con exactamente las deudas del círculo en pantalla y que, si la cuenta paga, la única transferencia es de ella al contrato por el neto mostrado. Si algo no calza, no firma. El servidor entrega la entrada, pero no decide qué se firma.
- **Las firmas las revisa el servidor antes de reenviarlas.** Una firma se guarda solo si la entrada es la que se pidió (misma dirección, invocación, nonce y vencimiento) y si la hizo una passkey de una regla `Default` sin políticas de esa cuenta, con las mismas comprobaciones que hace la red (`isSignedByPasskey`). Así nadie arruina una propuesta firmando a nombre de otro, y la llave de un contador no puede firmar una liquidación.
- **Propuestas.** Solo se abre una propuesta para un círculo que el buscador ofrece en ese momento, hay una sola por círculo y solo una petición la envía. Antes de abrirla se revisa que quienes pagan neto tengan saldo.
- **Sesiones.** Se abren con una aserción WebAuthn sobre un nonce del servidor (un uso, 5 minutos), con verificación del usuario, del dominio (el hash del rpId) y del origen. La cookie va firmada con HMAC, es HttpOnly y SameSite=Lax, y dura 30 días. El rol sale de la regla de la passkey en la cadena, no de lo que diga el navegador.
- **Passkeys conocidas.** La tabla `credentials` guarda solo passkeys que una regla de la cuenta nombra en la cadena, y los datos de creación solo si la transacción de creación los confirma.
- **Notas.** El texto de una referencia se guarda solo si lo escribe una parte de la deuda y su SHA-256 es el que está en la cadena.
- **Límites.** Contadores por IP y por cuenta guardados en Postgres, compartidos por todas las instancias (ver [límites de abuso](arquitectura.md#límites-de-abuso)).
- **Mantenimiento.** En producción `/api/sync` exige `CRON_SECRET`.
- **Llaves.** El servidor no guarda ninguna llave de los negocios. Las que tiene son la del relayer, la del emisor del token de prueba, la de las cookies y la de los avisos.

## Qué no protege

- **La privacidad frente a la red.** Cada deuda (deudor, acreedor, monto, hash de la referencia, vencimiento) y cada liquidación quedan en eventos públicos del contrato. Cualquiera puede leer quién le debe a quién y cuánto, por dirección.
- **La privacidad dentro de la app es de presentación.** Los terceros de un círculo aparecen como `anon:` y sin montos, pero el navegador recibe la lista completa de deudas del círculo (`clearings`, con ids y montos) porque la necesita para comprobar lo que firma, y con un id cualquiera lee la deuda en la cadena. Los marcadores cambian en cada círculo y en cada lectura, así que dos círculos con un mismo tercero no se pueden cruzar desde la app. Si a una parte no le alcanza para su neto, quien abre la propuesta solo sabe que «a otro negocio del círculo» no le alcanza; su propio faltante sí se le dice con cifras.
- **Nombres y direcciones.** El directorio responde a cualquiera con sesión, y abrir una cuenta es gratis: con búsquedas de dos letras se pueden listar nombres con sus direcciones y, con eso, leer en la cadena las deudas de cada nombre.
- **El servidor ve todo.** Postgres guarda la copia de todas las deudas, los nombres, las notas en texto plano, quién firmó qué y adónde mandar los avisos de cada negocio. Quien opere el servidor o la base (Supabase) puede leerlo.
- **Las referencias se pueden adivinar.** El hash es el SHA-256 del texto, sin sal: un número de factura corto se encuentra probando.
- **Los nombres no se verifican.** Cualquiera puede llamarse como otro; la app solo avisa que el nombre ya existe. Lo único que identifica a un negocio es su dirección.
- **Deudas no pedidas.** Cualquiera puede registrar una deuda contra cualquier dirección. No cuenta hasta que el deudor la acepta, pero le llega el aviso.
- **El token es de prueba.** `USDC` es solo el nombre de un activo que emite la cuenta operadora del despliegue, y con `TOKEN_ISSUER_SECRET` el servidor puede acuñar todo el que quiera.
- **Sin efecto legal.** Una compensación en la cadena no es por sí sola un acto legal ni contable. El vencimiento es informativo: el contrato no lo hace cumplir.
- **Sesiones y revocación.** La sesión no se guarda en el servidor, pero cada petición con sesión comprueba que la passkey siga vigente en `credentials`: quitar una passkey desde Equipo la marca revocada y sus sesiones dejan de servir en la siguiente petición. Lo que la app no ve es una regla quitada por fuera de ella: hasta que alguien la quite también en Equipo, esa sesión sigue leyendo el estado (firmar ya no puede, porque la cadena rechaza la firma).

## Si se pierde la passkey

- Nodus no guarda llaves de los negocios: no puede recuperar una cuenta.
- Si la passkey está sincronizada por el sistema (el llavero del teléfono o del navegador), aparece en el dispositivo nuevo y basta con entrar: el servidor entrega los registros que el kit necesita para conectarse.
- Si no, sirve una passkey de respaldo agregada antes desde Equipo ("Dispositivo de respaldo"). Vive en su propia regla `Default`, firma sola y puede lo mismo que la original: firmar círculos, pagar, agregar passkeys y quitar las de respaldo o de contador.
- Sin passkey ni respaldo, la cuenta queda sin nadie que firme. Sus deudas y su saldo siguen en la red, pero nadie puede aceptarlas, pagarlas ni liquidarlas.
- La app no ofrece quitar la passkey original (regla 0) ni la de la sesión en curso. Si roban un dispositivo, su passkey sigue protegida por la huella, el rostro o el PIN (la app exige verificación del usuario), pero desde la app no hay cómo sacarla de la cuenta.

## Qué puede y qué no puede un contador

El contador tiene una passkey en una regla `CallContract(<contrato Nodus>)` con la policy `contracts/allowlist` instalada con estas funciones (`CLERK_FUNCTIONS` en `apps/web/src/lib/config.ts`):

| Función    | Qué significa para el negocio                                                                   |
| ---------- | ----------------------------------------------------------------------------------------------- |
| `register` | Registrar, a nombre del negocio, que otro le debe. Cualquier monto, contra cualquier dirección. |
| `accept`   | Reconocer, a nombre del negocio, una deuda en su contra. Desde ahí puede entrar en un círculo.  |
| `reject`   | Rechazar una deuda que el negocio no ha aceptado.                                               |

La policy mira solo el nombre de la función, no los argumentos.

No puede:

- **Liquidar ni pagar.** La policy rechaza cualquier otra función de Nodus (error 3302), y el servidor no guarda firmas hechas bajo reglas con políticas.
- **Mover el token.** Una transferencia es una llamada al contrato del token, que la regla del contador no cubre.
- **Cambiar las llaves de la cuenta.** Esas llamadas van a la cuenta misma, tampoco cubierta.
- **En la API**, pedir o firmar propuestas, invitar, renombrar el negocio ni quitar passkeys (`requireOwner`).

Sí puede ver en la app todo lo que ve el dueño, escribir notas de referencias, pedir fondos de prueba y activar avisos.

## El relayer

- Todas las transacciones van por OpenZeppelin Channels de testnet, que envuelve cada invocación en una transacción de sus propias cuentas y paga la comisión. Los negocios no necesitan XLM; la instalación necesita `OZ_CHANNELS_API_KEY`.
- `/api/relay` es el relayer que usa el kit en el navegador. No pide sesión, porque la cuenta se crea antes de que haya una, y limita por IP. `classify` decide qué patrocina:
  - cualquier invocación del contrato Nodus, de cualquier función y de quien sea;
  - crear un contrato con el wasm de la cuenta inteligente (`ACCOUNT_WASM_HASH`), hasta 30 por hora por IP;
  - `add_context_rule`, `remove_context_rule`, `add_signer`, `remove_signer`, `add_policy` y `remove_policy` llamadas sobre un contrato que corre ese wasm.
  - Todo lo demás recibe 403.
- El relayer no firma por nadie: lleva firmas ajenas. La ruta no las revisa antes de enviar; eso queda para la red. Las firmas de una liquidación sí las revisa el servidor antes de que lleguen al relayer.
- El servidor también envía por el relayer: las liquidaciones (con las firmas de las partes), `keep_alive` (sin firmas) y los fondos de prueba (firmados por el emisor del token).

## Supuestos a revisar antes de mainnet

1. **La red está fija en el código.** `packages/stellar` fija testnet: RPC, Horizon, passphrase, la URL de Channels, el hash del wasm de la cuenta y el verificador WebAuthn. Hay que parametrizarlos y confirmar las direcciones de OpenZeppelin en mainnet.
2. **Sin auditoría.** Ni el contrato Nodus ni la policy están auditados. El contrato no tiene administrador ni función de actualización: corregirlo es desplegar otro y migrar las deudas.
3. **Versión de la policy.** La policy copia los tipos de `stellar-accounts` 0.7 de OpenZeppelin y la app usa `smart-account-kit` 0.8. Hay que confirmar que coinciden con las cuentas de mainnet.
4. **La policy no mira el contrato.** Compara solo el nombre de la función y confía en que la regla sea `CallContract(<contrato Nodus>)`. Instalada en otra regla, dejaría llamar a `register` o `accept` de cualquier contrato.
5. **Vida de los datos en la red.** Las deudas viven 120 días desde la última escritura y dependen de que el cron corra `keep_alive`. Lo que la policy guarda para cada contador se extiende solo al instalarse, y las cuentas también tienen vida limitada. Falta decidir cómo se restauran entradas archivadas; hoy `reconcile` marca `expired` una deuda que ya no puede leer.
6. **Token real.** Pasar a USDC real (el símbolo y los 7 decimales están fijos en `apps/web/src/lib/config.ts`) y quitar `TOKEN_ISSUER_SECRET` y el faucet.
7. **Patrocinio sin cuota.** `/api/relay` paga cualquier llamada a Nodus de cualquiera, con límites solo por IP. En mainnet eso es plata: hace falta una cuota por cuenta, un presupuesto y alertas.
8. **La IP del cliente.** Los límites por IP leen el primer valor de `x-forwarded-for`. En Vercel lo pone la plataforma; en otro host hay que asegurar un proxy que lo reescriba, o cualquiera se salta los límites.
9. **Rutas caras.** Abrir una propuesta corre una búsqueda completa y una simulación; hoy las limita el contador por cuenta (`writesPerAddress`), que conviene afinar con uso real.
10. **Sesiones.** Falta revocarlas (por ejemplo, con una versión por cuenta) y confirmar el rol en la cadena en cada escritura. Contra CSRF hoy solo está SameSite=Lax y que las rutas piden JSON.
11. **Privacidad.** Decidir si los montos de terceros pueden llegar al navegador; si no, la comprobación de lo que se firma tiene que hacerse de otra forma. Ponerle sal a las referencias y acotar el directorio.
12. **Invitaciones.** El enlace es la credencial durante 7 días: quien lo abre primero registra su passkey, y el dueño debería confirmar por otro canal antes de agregarla. Retirar una invitación ya agregada solo la marca en la base: la passkey sigue en la cuenta hasta que se quite su regla, y como `POST /api/credentials` no pide sesión, quien la tiene puede volver a registrarla.
13. **Datos que nadie verifica.** En `POST /api/credentials`, `isPrimary` y el nombre de la passkey los pone quien llama.
14. **Avisos.** El servidor manda peticiones a cualquier URL `https` que una sesión registre como suscripción, y `DELETE /api/push/subscribe` borra cualquier suscripción sin mirar de quién es.
15. **Propuestas atascadas.** Una propuesta `submitted` con un hash que el RPC no conoce queda así para siempre y retiene sus deudas.
16. **Datos de terceros.** La base guarda nombres, notas y suscripciones en un proveedor externo. Hay que revisar las obligaciones de protección de datos antes de operar con negocios reales.
17. **Efecto legal.** Definir qué valor tiene una deuda aceptada y una compensación en la cadena, y cómo se ligan a facturas reales.
