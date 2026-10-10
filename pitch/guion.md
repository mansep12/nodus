# Guion del video

Esto es una guía para contar el video, no un texto para leer. Cada bloque dice qué tiene que quedarle al que mira, las pocas palabras que no pueden cambiar (cifras y nombres, porque también salen escritas en pantalla) y una forma en que podría sonar. Esa forma es un ejemplo: dilo como lo dirías tú.

El video son tres piezas, y la voz se graba antes que todo lo demás:

| Pieza   | Qué es                                        | Bloques | Techo  |
| ------- | --------------------------------------------- | ------- | ------ |
| Parte A | Animación: el problema y la idea              | grabada | 1:44,5 |
| Demo    | La aplicación grabada, sin animación          | 6 tomas | 0:45   |
| Parte B | Animación: la prueba, por qué Stellar, cierre | grabada | 0:36   |

La parte A (`pitch/voz/A.mp3`, 9 de octubre) dura **104,491 segundos** e incluye el caso sin usar caja; la B dura 36. A su velocidad, quedarían 34,5 s para la demo (tope 2:55). **Decisión del 9 de octubre:** la demo no se acorta. Mantiene sus seis tomas y su voz completas, en **45 s (techo 47 s)**, y el tiempo se compensa llevando A y B a **1,1×** con el tono conservado: A + B bajan de 140,5 a 127,7 s y el total queda en 2:52,7. La demo va a su velocidad, salvo las esperas de red con su rótulo.

| Bloque  | Qué                           | Techo                         | Palabras, más o menos |
| ------- | ----------------------------- | ----------------------------- | --------------------- |
| Parte A | Todo lo de antes de la demo   | 104,491 s (grabada)           | 298 (transcritas)     |
| Demo    | Seis tomas de la app          | 45 s (techo 47)               | 85                    |
| Parte B | Todo lo de después de la demo | 36 s (voz de 33,9 s, grabada) | 100 (transcritas)     |

## Cómo contarlo

- **Cuéntalo, no lo leas.** Lee el bloque, levanta la vista y díselo a una persona. Tres o cuatro tomas por bloque y eliges la mejor.
- **Las palabras fijas son solo cifras y nombres.** Todo lo demás es tuyo. Si en una toma dijiste algo distinto y sonó bien, esa es la buena.
- **En primera persona.** "Hice", "probé", "les muestro". Es una persona mostrando lo que construyó, no un narrador.
- **Una frase de remate en todo el video,** y es la última. "Nodus desanuda las deudas" se dice una sola vez, en el cierre.
- **Lento donde hay cifras.** Una deuda, respira, la siguiente. En la toma de prueba las tres deudas salieron en 6 segundos y es la parte que más memoria pide.

---

## Parte A · Animación (grabada)

Esto es lo que quedó grabado en `pitch/voz/A.mp3`, de corrido, y lo que la animación hace con cada frase. Ya no es una guía: es el registro de lo que se dijo. Si se vuelve a grabar, la animación se vuelve a anclar a lo que se diga (`voz/anclas.json`).

### El problema · 0:00–0:20

> Hoy en Chile un negocio puede cerrar aunque todavía tenga dinero por cobrar. La ley establece un plazo de treinta días para pagar las facturas, pero el promedio real llega a cuarenta y cuatro. Y entre pymes es aún peor: este número sube a cincuenta y tres. Muchas veces el atraso viene en cadena, ya que quien te debe también está esperando que le paguen a él.

| Frase                         | En pantalla                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| "Hoy en Chile un negocio…"    | La portada: el nudo, "Nodus" y su frase.                                                                      |
| "puede cerrar"                | Bajo la frase, el rótulo: 6 de cada 10 pymes, al borde del cierre o endeudadas por los atrasos de pago.       |
| "La ley establece un plazo"   | La cámara baja a una tarjeta con la regla de días; en "treinta" se dibuja la marca de la ley, con su píldora. |
| "el promedio real llega a 44" | La primera barra cruza la marca y sigue en rojo mientras su cifra cuenta hasta 44; al lado, "+14".            |
| "entre pymes es aún peor"     | La segunda barra llega hasta la marca y espera.                                                               |
| "este número sube a 53"       | Sigue de largo, contando hasta 53; al lado, "+23".                                                            |
| "el atraso viene en cadena"   | La tarjeta se va y la cámara viaja a lo largo de una cadena de negocios que se dibuja eslabón por eslabón.    |
| "quien te debe también…"      | Al final de la cadena estás tú; lo que te deben se pone azul y cada negocio late cuando la espera llega a él. |

### El ejemplo · 0:20–0:37

> Ahora voy a dar un ejemplo sencillo, en donde una panadería le debe cien al molino. El molino le debe ochenta al transportista, el transportista le debe noventa a la panadería. Los tres tienen dinero por cobrar, pero ninguno tiene suficiente dinero para poder pagar.

En "un ejemplo sencillo" la cadena se va, la cámara se acerca y el círculo se dibuja vacío, con el lugar de cada uno de los tres marcado. Después, cada negocio aparece cuando se lo nombra y su cuerda se dibuja con la cifra, con la cámara siguiéndolos. Con la tercera se cierra el anillo y el centro cuenta hasta 270; debajo, "Los tres tienen dinero por cobrar, pero ninguno tiene suficiente para pagar."

### La idea · 0:38–1:00

> Pero si miramos las tres deudas juntas, vemos que forman un círculo. Para eso hicimos Nodus: permite compensar esas deudas para que solo haya que pagar la diferencia. En este ejemplo hay doscientos setenta en deuda, pero basta con mover solo veinte. La panadería y el transportista pagan diez cada uno y el molino recibe veinte. Así las tres deudas quedan saldadas.

| Frase                           | En pantalla                                                              |
| ------------------------------- | ------------------------------------------------------------------------ |
| "forman un círculo"             | Las tres deudas se encienden en verde.                                   |
| "Para eso hicimos Nodus"        | El nombre, sobre el círculo.                                             |
| "permite compensar esas deudas" | Bajo el nombre: "Compensa las deudas: solo se paga la diferencia."       |
| "En este ejemplo hay 270"       | El nombre se va y las deudas vuelven a la tinta, con el 270 al centro.   |
| "basta con mover solo 20"       | Las tres cuerdas se retiran y el centro baja de 270 a 20.                |
| "pagan 10 cada uno"             | Dos cuerdas finas de 10 hacia el molino.                                 |
| "el molino recibe 20"           | El molino late, con el rótulo "Recibe 20".                               |
| "quedan saldadas"               | Las deudas se anudan y el nudo se suelta: "se saldaron 270 moviendo 20". |

### Sin usar caja · 1:01–1:25

La nueva grabación agrega otra resolución del mismo ejemplo después de «Así las tres deudas quedan saldadas» y antes de «Y esto pasa con muchos negocios». Explica que, si nadie tiene caja o no quiere usarla, se descuentan 80 de cada deuda sin mover dinero: la panadería queda debiendo 20 al molino y el transportista 10 a la panadería. De 270 quedan 30.

| Frase                         | En pantalla                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| «Sobre este mismo ejemplo»    | Vuelven las tres deudas originales, 100, 80 y 90, con el título «Sin usar caja».                                       |
| «De este modo se descuenta»   | Las tres cuerdas se iluminan; un −80 junto a cada deuda, y «Se descuentan 80 de cada deuda» al centro.                 |
| «Sin necesidad de mover»      | Las cuerdas se afinan hasta 20 y 10. La del molino desaparece al llegar a cero. El centro distingue «0 dinero movido». |
| «La panadería queda debiendo» | Se destaca en naranja la deuda de 20 de la panadería al molino.                                                        |
| «El transportista»            | Se destaca en azul la deuda de 10 del transportista a la panadería.                                                    |
| «Pero ya pasa de»             | Se recuerda el total inicial de 270.                                                                                   |
| «Solamente treinta»           | El total baja a 30 por pagar; las dos deudas siguen visibles. «240 compensados · 0 dinero movido».                     |

### La red · 1:25–1:44,5

> Y esto pasa con muchos negocios. Un negocio le debe a otros, otros le deben a él, y estos a su vez también tienen cuentas pendientes con otros negocios. Y así se va formando una red enorme donde cada uno solo puede ver lo suyo. Pero nadie ve cómo están todos conectados. Nodus sí, y gracias a eso puede encontrar esos círculos dentro de la red.

| Frase                                  | En pantalla                                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| "esto pasa con muchos negocios"        | La cámara se aleja y los tres tienen sus deudas otra vez.                                             |
| "Un negocio le debe a otros"           | De la panadería salen cuerdas naranjas hacia su izquierda, donde ya estaba el molino: "Les debe".     |
| "otros le deben a él"                  | Desde su derecha, donde ya estaba el transportista, llegan cuerdas azules: "Le deben".                |
| "y estos a su vez…"                    | Cada uno de esos se abre igual, en dos vueltas, y todo pasa a gris. La cámara se aleja.               |
| "se va formando una red enorme"        | La última vuelta y los cruces; la red llena el cuadro.                                                |
| "cada uno solo puede ver lo suyo"      | Todo se apaga menos las deudas de la panadería, en sus colores.                                       |
| "nadie ve cómo están todos conectados" | La red entera se enciende otra vez.                                                                   |
| "Nodus sí"                             | La red queda tenue y los círculos que hay en ella se dibujan en tinta: el de los tres y otros cuatro. |
| "puede encontrar esos círculos"        | Se marcan en verde: "Nodus los encuentra."                                                            |

---

## Demo · La aplicación (grabada)

La voz quedó grabada en `pitch/voz/demo.mp3` (42,4 s), de corrido y en primera persona, y la pantalla se grabó sola con `pitch/grabar.ts`; `pitch/demo-montar.ts` pone cada cosa en el segundo en que la voz la dice (43 s en total). Nada va acelerado: las esperas de la red se saltan con un corte.

> Ahora bien, pasando a la demo. Esta es la aplicación. Yo soy la panadería y entro con mi passkey, sin necesidad de poner una contraseña o sin necesidad de tener que anotar nada. El transportista me debe noventa, así que lo puedo anotar aquí. Él ahora luego lo acepta desde su cuenta con su propia firma. Con eso se cerró un círculo y me muestra solamente mi parte: dejo de deber cien, dejan de deberme noventa y pago diez. Yo ahora firmo lo mío y espero que los otros dos lo hagan. Si falta una firma no va a pasar nada, simplemente. Y cuando firma el último, está listo: una sola transacción cancela las tres deudas y pago solamente la diferencia.

| Segundo | Frase                             | En pantalla                                                                                                                      |
| ------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 0,0     | «Ahora bien, pasando a la demo…»  | La portada de la app.                                                                                                            |
| 5,5     | «…y entro con mi passkey»         | Clic en «Entrar con mi passkey»; «Red» se dibuja: cinco clientes que le deben 530 y cuatro proveedores a los que debe 260.       |
| 9,5     | «…tener que anotar nada»          | «Registrar una deuda»; `Flet` → «Fletes Ruta 5»; 90; «Registrar con passkey» cuando termina «lo puedo anotar aquí».              |
| 15,8    |                                   | «Deuda registrada…»; el transportista aparece punteado entre los otros cinco.                                                    |
| 16,3    | «Él ahora luego lo acepta…»       | La cuenta de Fletes Ruta 5: «Panadería Sur registró que le debes 90», «Aceptar con passkey», y su bandeja ya muestra el círculo. |
| 20,2    | «Con eso se cerró un círculo…»    | De vuelta en la panadería: «Falta tu firma en un círculo.», «Ir a la bandeja», la tarjeta «Se cancelan 270 moviendo solo 20».    |
| 24,8    | «Dejo de deber cien…»             | El puntero pasa por «Dejas de deber 100», «Dejan de deberte 90» y «Pagas 10», cada una cuando se dice.                           |
| 29,6    | «Yo ahora firmo lo mío…»          | «Firmar con passkey»; «Firmando · 1 de 3» y «Ya firmaste. Faltan las firmas de Molino Andes y Fletes Ruta 5.»                    |
| 32,0    | «Si falta una firma…»             | El puntero va a «Si falta una firma, no pasa nada.»                                                                              |
| 34,2    | «Y cuando firma el último…»       | «2 de 3», «Liquidando…», el nudo se aprieta.                                                                                     |
| 37,3    | «Una sola transacción…»           | «Desanudado» y el comprobante.                                                                                                   |
| 40,2    | «…y pago solamente la diferencia» | El puntero va a «Pagaste 10» y se queda ahí.                                                                                     |

En «y me muestra solamente mi parte» la transcripción duda entre «Nodus me muestra» y «no me muestra»: conviene oírlo.

Las notas que siguen son de cuando la demo se iba a grabar a mano, en seis tomas; el recorrido es el mismo.

**Cambió la toma 1.** Dice «con su passkey» y no «con su huella»: en la máquina de la grabación el prompt no pide huella. Y la panadería ya existe: entra a una cuenta con historia en lugar de crear una vacía (más cerca de la voz, y sin la espera de crear la cuenta). La cuenta se crea una sola vez, fuera de cámara.

**Cambió la toma 2.** En la app la deuda la registra el que cobra y la acepta el que debe. El guion anterior hacía que la panadería anotara "al molino, cien", que es justo la deuda que ella debe y no puede registrar. Ahora anota lo que le debe el transportista (noventa) y el transportista acepta, que es como funciona de verdad y calza con el triángulo.

**Cambió la toma 5.** «Falta su firma» no sale con tres negocios que se conocen: la app solo lo escribe para negocios sin nombre en el círculo (el de veinte). Con tres, en pantalla se lee «Firmando · 1 de 3» y «Ya firmaste. Faltan las firmas de…».

**Las cuentas las manejan scripts.** La demo se grabó sola (`pitch/grabar.ts`): la panadería, el molino, el transportista y los otros ocho negocios son cuentas reales en la red de pruebas, hechas por scripts con llaves de prueba. La app pide cada firma con WebAuthn, como siempre, y la responde el autenticador virtual del navegador: la firma es una passkey de verdad y se verifica en la red, pero en pantalla no hay un diálogo que aprobar. Hay que decirlo en la descripción del proyecto (ver más abajo).

**El recibo de veinte sale una sola vez,** en la parte B. Aquí la toma 6 termina en "Confirmada en la red".

---

## Parte B · Animación (grabada)

Esto es lo que quedó grabado en `pitch/voz/B.mp3` (33,9 s), de corrido, y lo que la animación hace con cada frase. La parte que decía qué corre en la red de pruebas y qué está simulado se recortó de la voz: queda escrita en el último cuadro. El video de la parte dura 36 s, con el cierre en pantalla y el fundido a negro después de la última palabra.

### Veinte negocios · 0:00–0:10

> Bueno, ¿y esto ahora cuánto aguanta? Esto ya lo probé con veinte negocios: veinte firmas y una sola transacción. Y ocupó solo un tercio del cómputo de lo que la red permite.

| Frase                          | En pantalla                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| "Bueno, ¿y esto ahora…"        | El anillo de veinte negocios, sin firmas; al centro, "20 en un círculo".                       |
| "Esto ya lo probé con veinte…" | Las firmas llegan en desorden y el centro las cuenta, de 1 a 20.                               |
| "una sola transacción"         | Con la última el círculo se anuda y se suelta; al centro, "1 sola transacción".                |
| "Y ocupó solo un tercio"       | Junto al anillo, el recibo: el hash, 20 firmas de passkey, 33 % del cómputo y 44 % del tamaño. |

### Por qué Stellar · 0:10–0:30

> Compensar deuda no es nada nuevo, pero siempre hay alguien entremedio. Por dar un ejemplo, un factoring que te compra la factura a un equis por ciento mensual. La diferencia con Stellar es que no hay nadie entremedio: cada negocio firma su parte desde el teléfono y la red lo ejecuta todo junto. Nadie tiene tu plata y el recibo es público para todos.

| Frase                          | En pantalla                                                                                                                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Compensar deuda no es…"       | El recibo se retira y sobre el anillo se lee: "Por qué Stellar. Hoy siempre hay alguien en el medio."                                                                                                    |
| "Por dar un ejemplo"           | A la izquierda, "Hoy · Alguien en el medio": lo que te deben (100) sale hacia ti y pasa por un nodo rojo con un "%".                                                                                     |
| "a un equis por ciento"        | El nodo late y se queda con su parte: una flecha roja, "−4 · Comisión"; al otro lado llegan 96. Debajo, la cifra del factoring y su fuente.                                                              |
| "La diferencia con Stellar"    | A la derecha, "En Stellar · Nadie en el medio", con el mismo dibujo en verde: pagan 20, pasan por el contrato "{ }" y reciben 20. Debajo: "En el medio hay un smart contract (Soroban): código abierto." |
| "Cada negocio firma su parte"  | "Cada negocio firma con su huella."                                                                                                                                                                      |
| "la red lo ejecuta todo junto" | "Todo o nada: si falta una firma, no se mueve nada."                                                                                                                                                     |
| "Nadie tiene tu plata"         | Del contrato baja una flecha verde: "0 · Se queda". Debajo: "Nadie retiene tu plata."                                                                                                                    |
| "el recibo es público"         | "El recibo es público para todos."                                                                                                                                                                       |

La pantalla no repite la voz: agrega lo que la voz no dice. La tasa del factoring no se dice ("un equis por ciento"), así que el ejemplo en pantalla lleva su cuenta y su fuente: el factoring cuesta entre 1 % y 2,2 % mensual (Pauta, julio 2026), y 100 a 53 días al 2,2 % son 96. "Soroban" y "smart contract" van escritos, no dichos.

### Cierre · 0:30–0:36

> Esto es Nodus: desanuda las deudas entre los negocios.

La cámara se aleja hasta ver todo, pequeño y tenue, y el anillo de veinte se va. Se dibuja el nudo, aparece "Nodus" y su frase; debajo, "Hoy en la red de pruebas de Stellar. Facturas e identidad, simuladas." y la dirección del repositorio. Casi dos segundos quietos y fundido a negro.

---

## Si el total pasa de 2:55

El total ya cuenta con A y B a 1,1×. Si aun así pasa de 2:55: acelerar un poco más las esperas de red de la demo (más de ×8 no se lee), recortar los casi dos segundos quietos del cierre de B y, al final, la holgura de las tomas 3 y 4. La voz de la demo no se acorta. "Red de pruebas" y "simuladas" ya no se dicen: tienen que quedar escritas en el cierre.

## Fuera del video, a la descripción del proyecto

- **Recibo del caso sin caja:** la transacción de 3 que está en `facts.ts` es del modo que cancela 240 sin mover dinero, ahora explicado en A.
- **Plata del bolsillo del dueño:** el 74 % de las pymes (PROPYME/DefensaDeudores, agosto 2026).
- **El 40 %** de los atrasos que sufre una pyme vienen de otra pyme (Asech/CobranzaOnline, 2025; sin ficha metodológica).
- **El círculo de veinte se armó con un script;** la app propone círculos de hasta 8.
- **Las cuentas de la demo** (la panadería, el molino, el transportista y los otros ocho negocios) son de prueba y las manejan scripts. En la grabación la app pide cada firma con WebAuthn y la responde el autenticador virtual del navegador: no se ve el diálogo del sistema. Las transacciones son reales, en la red de pruebas.

## Fuentes de lo que sí se dice

- **30 días:** el plazo legal de pago de facturas en Chile.
- **6 de cada 10, al borde del cierre o endeudadas** (solo escrito): encuesta Asech y CobranzaOnline, julio–agosto 2025, reportada por el Diario Financiero el 23 de septiembre de 2025. Sin ficha metodológica publicada.
- **44 días:** Ranking de Pagadores de la Bolsa de Productos, julio 2025 a junio 2026, reportado por Ex-Ante el 21 de agosto de 2026. Es el promedio de todos los pagadores; el 53 es cuánto tarda una pyme en pagarle a otra, y por eso se dicen seguidos pero separados.
- **53 días:** Radiografía Pyme 2025 de Xepelin (42 mil pymes, octubre 2025): cuando el deudor es otra pyme, paga a 53 días.
- **Factoring al 2 % mensual:** cuesta entre 1 % y 2,2 % mensual (Pauta, julio 2026).
- **Veinte negocios, un tercio del cómputo:** la transacción `twenty` de `apps/web/src/components/landing/facts.ts`.

## Para grabar

- **Por bloque,** tres o cuatro tomas seguidas de cada uno, con un chasquido entre toma y toma. Nunca una toma larga.
- **Cronómetro por bloque,** contra su techo. Si un bloque se pasa, se vuelve a contar más corto; no se habla más rápido.
- **Un audio por parte, de corrido:** `pitch/voz/A.mp3` es todo lo de antes de la demo; `B.mp3`, todo lo de después; `demo.mp3`, la demo. `bun run pitch:juntar` las pega en `voz.mp3` sin agregar silencio entre una y otra: el silencio digital suena a corte, no a pausa, así que las pausas se graban.
- **Después de la voz, no antes:** se transcribe el bloque, se escriben sus anclas en `voz/anclas.json` desde lo que dijiste y se ajusta su escena de `/pitch`. Las escenas ya están en el orden de este guion; el A1 ya está anclado a su voz, y los demás bloques tienen todavía las frases del ejemplo y tiempos estimados. La parte A y la parte B se renderizan por separado (`pitch:render --desde … --hasta …`). Los subtítulos en inglés salen de esa misma transcripción.
- **Para la demo:** el paso a paso está en [produccion.md](produccion.md#grabar-la-demo-paso-a-paso). `bash pitch/demo.sh vecinos` deja todo listo antes de cada intento: la deuda de 100 con el molino ya aceptada, la de 80 entre el molino y el transportista, y alrededor los otros proveedores y clientes de la panadería. La voz va en `pitch/voz/demo.mp3`, después de elegir las tomas.
