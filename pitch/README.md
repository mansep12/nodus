# El video de presentación

Todo lo que tiene que ver con el video de 3 minutos para Find Your Way vive aquí.

| Archivo                          | Qué es                                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [guion.md](guion.md)             | El guion a dos columnas: lo que dice la voz y lo que hay en pantalla, bloque por bloque, con la escena y el paso de `/pitch`. |
| [produccion.md](produccion.md)   | Las decisiones (voz, cámara, demo, cortes) y las instrucciones para grabar, montar y entregar. El plan por día.               |
| `apps/web/src/components/pitch/` | Las escenas animadas, hechas con los mismos componentes y tokens de la app.                                                   |
| `apps/web/src/app/pitch/`        | La ruta `/pitch` que las reproduce. Solo existe en desarrollo.                                                                |
| `voz/`                           | La voz y su alineación: `anclas.json`, `alinear.py`, `anclar.ts`, `tiempos.json`.                                             |
| `render.ts`, `mezclar.ts`        | El render cuadro por cuadro y la mezcla con la voz, la cama y los efectos.                                                    |
| `sonido.py`                      | La cama y los efectos de cada animación, sintetizados y colgados de los segundos de `tiempos.json`.                           |
| `demo.sh`                        | La app de la demo: una copia local con su base, los vecinos y la red de la panadería.                                         |
| `grabar.ts`, `demo-montar.ts`    | La demo grabada sola (un navegador sin ventana hace el recorrido) y cortada a su voz.                                         |
| `final.ts`                       | El video entero: A, la demo y B en un archivo, con una sola cama de principio a fin.                                          |
| `docs/descripcion.md`            | El texto del formulario de entrega.                                                                                           |

## Las escenas

```bash
bun run dev              # http://localhost:3000/pitch
```

La ruta muestra el video entero dentro de un marco de 1920×1080 que se escala a la ventana, con un reloj: cada paso de cada escena tiene su segundo (`timeline.ts`, que lee `tiempos.json`), y en pantalla está el último paso cuya hora ya llegó. Las escenas van en el orden en que se dicen; la claqueta de la demo separa la parte A de la parte B, que se renderizan por separado.

| Tecla               | Hace                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `espacio`           | Reproduce o pausa, con la voz si está (ver abajo).                                                  |
| `←` `→`             | Reproduciendo: un segundo atrás o adelante. En pausa: paso anterior o siguiente, como antes a mano. |
| `⇧←` `⇧→`           | Cinco segundos atrás o adelante.                                                                    |
| `[` `]` (y `Enter`) | Paso anterior o siguiente; el reloj salta a la hora de ese paso.                                    |
| `,` `.`             | Pausa y retrocede o avanza un cuadro (1/60 s).                                                      |
| `PgUp` `PgDn`       | Escena anterior o siguiente.                                                                        |
| `R`                 | Vuelve al principio de la escena.                                                                   |
| `L`                 | Repite la escena en bucle mientras reproduce.                                                       |
| `H`                 | Oculta la ayuda.                                                                                    |
| `Inicio`            | Al segundo 0.                                                                                       |

Abajo, la línea de tiempo (un clic lleva ahí), el reloj, la escena, el paso y qué pasa en él; "(estimado)" o "(interpolado)" si su hora todavía no viene de la voz. `/pitch?t=35` abre en el segundo 35; `/pitch#2.1` en el segundo paso de la tercera escena. En pausa, los pasos tomados a mano se juegan enteros (las firmas de los veinte, el nudo), así que las flechas siguen sirviendo para mirar una escena paso por paso.

### La voz manda

```bash
# 1. La voz se graba por parte, de corrido (A.mp3 es todo lo de antes de la demo), en pitch/voz/. Esto las pega en orden,
#    sin agregar silencio entre una y otra, en pitch/voz/voz.mp3:
bun run pitch:juntar
# 2. Las palabras con su segundo, con Whisper (stable-ts) en español. Instala uv una vez: pipx install uv
uv run pitch/voz/alinear.py                   # escribe pitch/voz/palabras.json; --modelo medium, más fino y más lento
# 3. Cada paso a la hora de su frase
bun run pitch:anclar --parte A                # ancla A, conserva los tiempos relativos de B y actualiza la voz de la vista
# 4. Revisar en /pitch con espacio: suena la voz y la imagen va con ella
# 5. Renderizar y mezclar, una parte a la vez: lo de antes de la demo y lo de después
bun run pitch:render --parte A --carpeta frames-A-final  # termina donde empieza demo.0
bun run pitch:mezclar --video pitch/out/pitch-A.mp4 --voz pitch/voz/A.mp3 --salida pitch/out/parte-A.mp4
```

- `alinear.py` se corre con uv, que instala solo Python 3.12, stable-ts y torch para CPU (la primera vez baja ~1 GB entre torch y el modelo `small`; tres minutos de voz tardan uno o dos en CPU). Con `--alinear` no transcribe sino que alinea a la fuerza el texto del guion: más fino si la voz dice el guion tal cual. ffmpeg: el del PATH o, si no hay, el del runtime Flatpak `org.freedesktop.Platform//25.08`.
- `anclas.json` dice qué frase empieza cada paso y los pasos sin voz (`fijos`: la portada). Las frases se escriben desde lo que se grabó, no desde el guion: se transcribe el bloque y se copian las primeras palabras de cada paso. `anclar.ts` busca cada frase en orden, tolerando lo que Whisper oye mal y las cifras en dígitos, y pone el paso 0,18 s antes de su primera palabra. Avisa de las frases que no encontró (las pone después de la última encontrada, a la distancia de sus horas estimadas) y de las dudosas. Una frase no empieza con «y» si justo antes se dice una cifra como 53, ni con una palabra que la frase anterior dejó sin usar. Sin `palabras.json` solo revisa el archivo; `--estimados` escribe las horas estimadas.
- Entre "veinte firmas de passkey" y "una sola transacción" hay que dejar unos cinco segundos: las firmas se reparten en ese hueco.

### Parte A con el caso sin caja (9 de octubre de 2026)

`voz/A.mp3` dura 104,491 s. La escena `caja` ocupa 61,04–85,72 s: recupera el triángulo original, descuenta 80 de cada deuda y conserva las flechas de las deudas pendientes (20 hacia el molino y 10 hacia la panadería). El dinero movido es cero; el total pendiente es 30. La red se inicia a los 85,72 s.

`anclar.ts --parte A` usa la duración real del audio para fijar `demo.0`, y desplaza la demo y B conservando sus distancias internas. No vuelve a interpretar la grabación de B. `render.ts --parte A` exporta solo A, sin la claqueta de demo. La voz original se conserva completa.

### Parte B grabada (9 de octubre de 2026)

`voz/B.mp3` dura 33,882 s. La exportación `out/parte-B.mp4` dura 36 s, en 1920×1080 a 60 fps, con la voz completa y tres segundos desde la última palabra hasta el final; los últimos 0,8 s se funden a negro. Usa el mismo mundo, cámara, tipografía y tintas de A.

La B se ancla por separado para conservar los tiempos ya aprobados de A y dejar el hueco de la demo. Su inicio en la línea de tiempo se lee de `veinte.0` (se desplaza si cambia la duración de A); ese desplazamiento no forma parte del MP4. La vista `/pitch?parte=B` abre ahí y reproduce `B.mp3` desde su segundo cero.

```bash
uv run pitch/voz/alinear.py --voz pitch/voz/B.mp3 --salida pitch/out/B.palabras.json
bun pitch/voz/anclar.ts --parte B --palabras pitch/out/B.palabras.json
bun run pitch:render --parte B --carpeta frames-B
bun run pitch:mezclar --video pitch/out/pitch-B.mp4 --voz pitch/out/B-voz-normalizada.wav --salida pitch/out/parte-B.mp4
```

`B.mp3` quedó grabada muy baja (−44 dB de media), y `loudnorm` de una pasada no la levanta bien: la mezcla usa `out/B-voz-normalizada.wav`, la misma voz llevada antes a −14 LUFS con picos en −1 dBTP. El render de B tarda unos 25 minutos a 60 fps (el anillo de veinte es lo más lento de dibujar).

Al volver a anclar con `--parte A`, B conserva sus tiempos relativos y no necesita anclarse otra vez. Si usas el anclado general sin `--parte`, ejecuta después el anclado de B. El anclado de B exige coincidencias exactas con la transcripción y se detiene si falta alguna frase.

Las firmas entran entre «Esto ya lo probé» y «una sola transacción». El centro muestra el número de firmas y luego una transacción, sin presentar los montos ilustrativos como cifras del ensayo. El recibo dibujado conserva el hash público de `facts.ts`; no es una captura del explorador. La comparación de «Por qué Stellar» agrega lo que la voz no dice, con el mismo dibujo a los dos lados del anillo (`middleman.tsx`): un monto sale, pasa por lo que hay en el medio y llega lo que queda. A la izquierda, en rojo, un intermediario que se queda con su parte: 100 a 53 días al 2,2 % mensual son 96 (el factoring cuesta entre 1 % y 2,2 % al mes; Pauta, julio 2026). A la derecha, en verde, el smart contract: los 20 del ejemplo de los tres entran y salen, y cuando la voz dice «nadie tiene tu plata» se ve que se queda con 0. Debajo, las líneas entran a medida que la voz llega: firma con huella, todo o nada, nadie retiene la plata, recibo público. La parte de la red de pruebas y los datos simulados se recortó de la voz: el aviso se conserva escrito al cierre, donde el anillo de veinte se va para no asomar detrás del nombre, y la dirección del repositorio entra después de él.

**Los textos no tiemblan.** El navegador pone cada letra en píxeles enteros, así que un texto que se mueve una fracción de píxel por cuadro tiembla. Se probó pedirle la forma exacta (`text-rendering: geometricPrecision`) y girar el dibujo una centésima de grado: el temblor cambia de forma pero no se va (`out/wip/medir.py` lo mide). Lo que quedó: la cámara ya no sigue acercándose al llegar a un plano, se queda quieta, y lo que nunca para es el fondo (`Far` en `camera.tsx` respira con el reloj). Vale para todo el video.

**Las dos partes de una vez.** `pitch/out/hacer-partes.sh` levanta su propio `next dev`, renderiza A y B en tramos paralelos de 26 y 12 segundos (`--desde`, `--hasta`, `--url`, `--sin-video`), los junta, codifica y mezcla con la voz; deja `out/LISTO` al terminar. Se lanza con `setsid nohup` para que no dependa de la terminal. Unos 35 minutos.

Esta exportación incluye la voz; música y subtítulos pertenecen al montaje final.

### El sonido

```bash
bun run pitch:sonido        # escribe pitch/out/cama-A.wav, efectos-A.wav, cama-B.wav, efectos-B.wav (unos 25 s)
bun pitch/mezclar.ts --video pitch/out/pitch-A.mp4 --voz pitch/voz/A.mp3 \
  --musica pitch/out/cama-A.wav --efectos pitch/out/efectos-A.wav --musica-db=-17 --salida pitch/out/parte-A-sonido.mp4
bun pitch/mezclar.ts --video pitch/out/pitch-B.mp4 --voz pitch/out/B-voz-normalizada.wav \
  --musica pitch/out/cama-B.wav --efectos pitch/out/efectos-B.wav --musica-db=-17 --salida pitch/out/parte-B-sonido.mp4
```

No hay que volver a renderizar: el video se copia tal cual y solo cambia el audio. `sonido.py` sintetiza todo con numpy (sin licencias) y es determinista. La **cama** es un colchón de acordes de re mayor, cada 16 s, que resuelve a la tónica en el cierre; el mezclador la agacha bajo la voz. Los **efectos** salen de `tiempos.json` más lo que el código de las escenas espera tras cada paso (los conteos de los días, las firmas cada 0,128 s, el nudo que aprieta 1,5 s y se suelta, la cámara 0,3 s antes que la voz). Cada efecto es una línea de `effects()`: moverlo o quitarlo es cambiar un número. Las voces se graban bajas (A.mp3 promedia −43 dBFS), así que `mezclar.ts` mide la voz y la sube hasta −16 LUFS **antes** de sumar la cama y los efectos; sin eso quedan a la par de la voz. Pasa los niveles con `=` (`--musica-db=-17`): con espacio, `-17` se lee como otra opción. La cama dura lo que la parte; la demo va entre A y B y se cruza en Kdenlive.

### Renderizar

`pitch:render` levanta su propio `next dev` (con el Node de verdad, puerto libre, carpeta `.next-render`; deja `tsconfig.json` como estaba), abre `/pitch?render=1` en el Chromium sin ventana de Playwright y saca cada cuadro con el tiempo del navegador detenido entre cuadro y cuadro: el mismo segundo sale igual cada vez. A 60 fps cada cuadro tarda entre 0,1 y 0,7 s (el anillo de veinte es lo más lento): la parte A y la B, unos 35 minutos con tramos en paralelo (`out/hacer-partes.sh`).

| Opción                        | Hace                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `--desde 35 --hasta 48`       | Un tramo, en segundos (sale `pitch-35-48.mp4`). Pre-rueda desde un paso anterior.            |
| `--escena veinte`             | Una escena (sale `pitch-veinte.mp4`).                                                        |
| `--fps 30`                    | Otra cadencia.                                                                               |
| `--muestras 4`                | Desenfoque de movimiento: cuatro subcuadros promediados por cuadro (cuatro veces más lento). |
| `--verificar`                 | Lo renderiza otra vez en otro proceso y compara los cuadros.                                 |
| `stills --t 12.5,40.2`        | Cuadros sueltos a `pitch/out/wip/` (para la miniatura, `stills --t 2.4`).                    |
| `--url http://localhost:3002` | Usa un servidor que ya corre.                                                                |

Lo generado, que no va en git (ya está en el `.gitignore`; la voz en `public/` se publicaría con la app si no lo estuviera): `pitch/out/` (cuadros, videos, `next-render.log`), `pitch/voz/palabras.json`, `apps/web/public/pitch/voz.mp3`. Sí van en git `anclas.json` y los dos `tiempos.json` (la fuente es `pitch/voz/tiempos.json`; `apps/web/src/components/pitch/tiempos.json` es su copia, y un test revisa que sean iguales).

`pitch:mezclar` junta el video con la voz y, si está, `pitch/voz/musica.mp3` agachada bajo la voz, a −14 LUFS. Es para ver el resultado: el corte final se monta en Kdenlive.

| N.º | Escena                    | Bloque del guion                                                    |
| --- | ------------------------- | ------------------------------------------------------------------- |
| 1   | El problema               | A1: la portada con su cifra, los días (30, 44, 53)                  |
| 2   | El nudo                   | A2: el triángulo, una deuda a la vez                                |
| 3   | La idea                   | A3: se cancelan las tres, 270 → 20, quién paga, el nudo             |
| 4   | Sin usar caja             | A: se descuentan 80 de cada deuda; quedan 20 y 10, sin mover dinero |
| 5   | La red                    | A4: la red crece desde la panadería; el círculo, en ella            |
| 6   | Demo (claqueta)           | Marcador: aquí va la app grabada aparte                             |
| 7   | Veinte en una transacción | B1: la prueba                                                       |
| 8   | Por qué Stellar           | B2                                                                  |
| 9   | Cierre                    | B3: último cuadro                                                   |

Todo el video es un solo dibujo y una sola cámara (`world.tsx`), que sale 0,3 s antes que la voz para estar llegando cuando la frase se dice: el triángulo está en el medio del mundo y no se va nunca, la red crece alrededor, la tarjeta de los días a su derecha, la cadena pasa por el medio y el anillo de veinte más allá. `scenes.ts` solo nombra las escenas y sus pasos; cada parte del mundo (`days.tsx`, `chain.tsx`, `triangle.tsx`, `network.tsx`, `stellar.tsx`) lee del paso en el que va qué tiene que estar haciendo, y lo que es cuestión de tiempo (las firmas, el nudo que se suelta) lo lee del reloj (`clock.tsx`). Se dibuja con `drawing.tsx` (negocios, cuerdas, notas) y con lo que ya tiene la app: `CircleGraph`, `Tie`, `useUntying`, `useDraw`, las tintas de `tones.ts` y la curva de `motion.ts`.

Lo que hace que no parezca una presentación de diapositivas está en la cámara (`camera.tsx`, el `viewBox` animado, y la lista `SHOTS` de `world.tsx`):

- **No corta nunca.** De un plano al otro viaja, siguiendo lo que se dice: baja de la portada a la tarjeta, recorre la cadena, se acerca a los dos primeros negocios, se abre al círculo, va hacia el molino que recibe.
- **El fondo no se queda quieto.** Al llegar a un plano la cámara se detiene, para que el texto no tiemble; lo que está lejos sigue respirando, despacio (`BREATH`).
- **El fondo tiene profundidad.** `Far` dibuja capas que se mueven y crecen menos que el dibujo: las manchas de color de la marca casi no se mueven, unos anillos van a media velocidad y la grilla de puntos va con el dibujo. Que pasen a velocidades distintas es lo que se lee como espacio.
- **Lo escrito va en un `Pin`,** que lo mantiene del mismo tamaño en pantalla; la tarjeta de los días, en cambio, se dibuja entera a escala del plano.

## El video entero

```bash
python3 pitch/sonido.py     # las camas; `cama-final.wav` es la del video entero
bun pitch/final.ts          # pitch/out/nodus-final.mp4 (2:49,8)
```

`final.ts` pone A y B a 1,1× con el tono conservado y la demo (`pitch/out/demo-sin-voz.mp4`, de `demo-montar.ts`) entre las dos, con un fundido de 0,4 s en cada unión. El sonido se mezcla de nuevo desde las pistas, con la receta de `mezclar.ts`: cada voz subida a −16 LUFS, los efectos de A y de B a su velocidad, y una cama única que no se corta entre pieza y pieza y resuelve en el cierre. Cómo se graba la demo: [produccion.md](produccion.md#grabar-la-demo-sola).
