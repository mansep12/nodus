**Nodus desanuda las deudas entre negocios.**

## El problema

En Chile un negocio puede cerrar teniendo plata por cobrar. La ley da 30 días para pagar una factura, pero el promedio real es de 44, y cuando una pyme le paga a otra pyme llega a 53. Muchas veces el atraso viene en cadena: quien te debe también está esperando que le paguen. Seis de cada diez pymes dicen estar al borde del cierre o endeudadas por estos atrasos.

Y muchas de esas deudas forman círculos: la panadería le debe 100 al molino, el molino le debe 80 al transportista y el transportista le debe 90 a la panadería. Los tres tienen plata por cobrar y ninguno tiene suficiente para pagar.

## La solución

Nodus encuentra esos círculos, cancela todas las deudas a la vez y mueve solo la diferencia. En el ejemplo hay dos formas de hacerlo:

- Liquidar todo: se cancelan los 270 moviendo solo 20. La panadería y el transportista pagan 10 cada uno y el molino recibe 20.
- Sin mover dinero: se descuentan 80 de cada deuda. Se cancelan 240 con cero pesos movidos y quedan 30 por pagar.

En los dos casos nadie queda mejor ni peor que antes: lo que cada negocio deja de cobrar es igual a lo que deja de deber más lo que recibe.

## Cómo funciona

1. Registrar. El acreedor registra lo que le deben y el deudor lo acepta con su firma.
2. Detectar. Un buscador fuera de cadena encuentra los círculos cada vez que cambian las deudas. No es de confianza: el contrato valida todo de nuevo.
3. Firmar. Cada negocio ve solo su parte (cuánto deja de deber, cuánto dejan de deberle y cuánto paga neto) y firma solo lo suyo con su passkey.
4. Liquidar. Con la última firma, una sola transacción cancela todas las deudas del círculo y paga los netos. Si falta una firma, no pasa nada.

## Por qué Stellar

Compensar deudas no es nuevo, pero siempre hay alguien en el medio: una cámara de compensación, o un factoring que compra la factura a entre 1 % y 2,2 % mensual. En Stellar lo que hay en el medio es un contrato de código abierto que no se queda con nada.

- Contrato Soroban (Rust) con el registro de deudas y la liquidación. La función settle calcula el neto de cada parte, exige la autorización de todas (require_auth) y mueve los netos. Todas las firmas viajan en una misma transacción atómica: o pasa todo, o no pasa nada.
- Smart accounts de OpenZeppelin con passkey. Cada negocio firma desde su dispositivo, sin frases semilla ni extensiones. Se puede agregar una passkey de respaldo y la de un contador, limitada por una policy propia a registrar y aceptar deudas, sin poder liquidar ni mover dinero.
- Comisiones patrocinadas con OpenZeppelin Relayer (Channels). Ningún negocio necesita XLM.
- Pagos netos por Stellar Asset Contract y los eventos del contrato como recibo público.
- El servidor no es de confianza para las firmas. Las guarda y las reenvía, pero no puede alterarlas: el navegador comprueba que lo que firma es exactamente el círculo en pantalla.

## Qué está funcionando

Contrato, policy, buscador de círculos, indexador y aplicación web, en la red de pruebas de Stellar.

- Aplicación: https://nodus-stellar.vercel.app
- Contrato: CBHNJMALT3D44LRI6UD2AYECTTRPUVB6MF4EYYPVGBOJ2JC54UUNQJ7U
  https://stellar.expert/explorer/testnet/contract/CBHNJMALT3D44LRI6UD2AYECTTRPUVB6MF4EYYPVGBOJ2JC54UUNQJ7U
- 20 negocios en una sola transacción, con 20 firmas de passkey: usó el 33 % del cómputo y el 44 % del tamaño que la red permite por transacción.
  https://stellar.expert/explorer/testnet/tx/da968b3a8e5ec4a1008d67e5f6ef1bc9df330bf922fbb0e58862245558039b63
- 3 negocios sin mover dinero, liquidado desde la aplicación web con la comisión pagada por el relayer.
  https://stellar.expert/explorer/testnet/tx/a2f068a9bf2dbdf736ddabf5860edcce487f0bf3230af49e246881f819558fdd
- Pruebas del contrato, del buscador, del indexador, de las firmas y de la interfaz, más pruebas de punta a punta contra testnet. Todo corre en CI.

## Qué está simulado y límites

- Corre solo en testnet y nada está auditado. El token de liquidación es un activo de prueba, no USDC real.
- Las deudas las declaran las partes: no hay conexión con las facturas del SII. La identidad de los negocios no se verifica (por ahora).
- La compensación en cadena no tiene por sí sola efecto legal ni contable.
- Quién le debe a quién y cuánto queda público en la cadena.
- Sobre la demo del video: los negocios (la panadería, el molino, el transportista y sus vecinos) son cuentas de prueba creadas por scripts. La aplicación pide cada firma con WebAuthn, como siempre, y en la grabación la responde el autenticador virtual del navegador, por eso no se ve el diálogo del sistema. Las transacciones son reales, en la red de pruebas.

## Próximos pasos

- Tomar las deudas desde las facturas electrónicas del SII en vez de declararlas a mano, y verificar la identidad de cada negocio.
- Privacidad de los montos y de quién le debe a quién.
- Círculos más grandes desde la aplicación y poder mejores opciones entre los mismos círculos que se forman.

## Enlaces

- Video: [PEGAR_ENLACE_DE_YOUTUBE](https://www.youtube.com/watch?v=DzJ7x45mRkY)
- Repositorio (MIT): https://github.com/mansep12/nodus
- Aplicación: https://nodus-stellar.vercel.app

## Fuentes de las cifras

- 30 días: plazo legal de pago de facturas en Chile.
- 44 días: Ranking de Pagadores de la Bolsa de Productos, julio 2025 a junio 2026 (Ex-Ante, 21 de agosto de 2026).
- 53 días entre pymes: Radiografía Pyme 2025 de Xepelin.
- 6 de cada 10: encuesta Asech y CobranzaOnline, julio–agosto 2025 (Diario Financiero, 23 de septiembre de 2025).
- Factoring entre 1 % y 2,2 % mensual: Pauta, julio 2026.

## English summary

Nodus unties the debts between businesses. Small businesses owe each other money in circles: the bakery owes the mill 100, the mill owes the carrier 80, the carrier owes the bakery 90. Everyone is waiting to be paid before they can pay. Nodus finds those circles, cancels every debt at once and moves only the net: 270 of debt cleared by moving 20, or 240 cleared without moving any money.

Each business signs only its own part with a passkey, and a single atomic Soroban transaction cancels all the debts and pays the nets. If one signature is missing, nothing happens. There is no clearing house in the middle: just an open-source contract that keeps nothing. Built with a Soroban contract (Rust), OpenZeppelin smart accounts with passkeys, a custom policy for limited keys, fees sponsored through OpenZeppelin Relayer, and net payments through the Stellar Asset Contract.

Working on testnet: contract, circle finder, indexer and web app. A circle of 20 businesses was settled in one transaction with 20 passkey signatures, using 33 % of the compute and 44 % of the size the network allows per transaction. Simulated: invoices, business identity and the legal effect of the netting; the settlement token is a test asset; nothing is audited. In the video demo the businesses are test accounts driven by scripts and the passkey prompts are answered by the browser's virtual authenticator; the transactions are real testnet transactions.
