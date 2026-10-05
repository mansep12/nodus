# Descripción del proyecto

Texto para el campo "Describe your project" del formulario de entrega.

---

**Nodus desanuda las deudas entre negocios.**

Las pymes se deben plata en círculo: A le debe a B, B le debe a C y C le debe a A. Todas esperan cobrar para poder pagar, y la liquidez queda inmovilizada. Nodus encuentra esos círculos, cancela todas las deudas a la vez y mueve solo el saldo neto. En nuestro ejemplo se cancelan 270 moviendo 20, o 240 sin mover nada.

**Cómo funciona.** El acreedor registra lo que le deben y el deudor lo acepta con su firma. Un buscador detecta el círculo y cada negocio ve cuánto baja su deuda, cuánto baja lo que le deben y cuánto paga neto. Cada uno firma solo su parte y, con la última firma, una sola transacción cancela todo y paga los netos. Si falta una firma, no pasa nada.

**Por qué Stellar.** La compensación multilateral existe hace décadas, pero necesita una cámara de compensación de confianza. En Soroban cada parte autoriza solo lo suyo y todas las autorizaciones viajan en una transacción atómica, así que no hace falta ese operador. Usamos:

- Un contrato Soroban con registro de deudas y liquidación atómica con autorización de todas las partes.
- Smart accounts con passkey: cada negocio firma con su huella, sin frases semilla ni extensiones.
- Comisiones patrocinadas con OpenZeppelin Relayer: ningún negocio necesita XLM.
- Pagos netos por Stellar Asset Contract y eventos del contrato como recibo.

**Qué está construido.** Contrato, buscador de círculos, indexador y aplicación web, funcionando en testnet. Probamos un círculo de 20 negocios liquidado en una sola transacción con 20 firmas de passkey, usando un tercio de los límites de la red.

**Qué está simulado.** Las facturas, la identidad de las empresas y el efecto legal de la compensación. El token de liquidación es un activo de prueba.
