# Guion del video (3 minutos)

Cerca de 400 palabras habladas. Los tiempos son una guía.

## 0:00 – 0:25 · El problema, con rostro

**En pantalla:** tres negocios de un barrio y flechas entre ellos.

> La panadería le debe 100 al molino. El molino le debe 80 al transportista. Y el transportista le debe 90 a la panadería. Los tres tienen plata por cobrar y ninguno puede pagar, porque todos esperan al otro. Es un nudo. Y en Chile es lo normal: las pymes cobran, en promedio, mucho después de los 30 días que fija la ley.

## 0:25 – 0:45 · La idea

**En pantalla:** el círculo se cierra y aparece el número del centro.

> Nodus desanuda esas deudas. Encuentra el círculo, cancela todo a la vez y mueve solo la diferencia. Aquí hay 270 en deudas, y basta con mover 20.

## 0:45 – 1:55 · Demo

**En pantalla:** la aplicación.

1. **Crear cuenta** (10 s). "La panadería entra con su huella. No hay contraseñas ni frases que anotar: la cuenta es una passkey."
2. **Registrar y aceptar** (20 s). "Anota lo que le deben. El que debe lo acepta con su firma."
3. **El círculo aparece** (15 s). "Nodus detecta el círculo y le muestra a cada negocio su parte: dejas de deber 100, dejan de deberte 90, pagas 10."
4. **Firmar** (15 s). "Cada uno firma solo lo suyo. Mientras falte una firma, no pasa nada."
5. **Última firma** (10 s). "Con la última firma, una sola transacción cancela las tres deudas y paga los netos."

**En pantalla:** el círculo desanudado y el enlace a la transacción.

## 1:55 – 2:35 · Por qué Stellar

**En pantalla:** la transacción en el explorador.

> Esto existe hace décadas, pero siempre con una cámara de compensación en la que todos confían. En Stellar no hace falta. Cada negocio autoriza solo su parte, todas las autorizaciones viajan en una misma transacción, y la red garantiza que pasa todo o no pasa nada. Probamos un círculo de 20 negocios en una sola transacción.
>
> Las cuentas son passkeys, las comisiones están patrocinadas, y nadie necesita saber qué es una blockchain.

## 2:35 – 2:50 · Sin mover dinero

**En pantalla:** el selector "Sin mover dinero".

> Y si alguien no tiene saldo, pueden compensar solo lo que tienen en común: 240 cancelados sin mover un peso.

## 2:50 – 3:00 · Cierre

> Hoy las facturas y la identidad están simuladas; el siguiente paso es conectarlas. Nodus: desanuda las deudas entre negocios.

## Para grabar

- Tener las tres cuentas creadas y las deudas registradas antes de grabar; dejar en vivo solo la aceptación final y las firmas.
- `bun run demo:neighbors <tu dirección>` crea dos vecinos que aceptan y firman solos, para grabar con una sola cuenta.
