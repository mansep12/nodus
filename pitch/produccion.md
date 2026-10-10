# Producción del video

Las decisiones ya tomadas, cómo grabar cada cosa, cómo montar y qué entregar. Lo que respalda cada decisión está en el informe de investigación (`reports/Video pitch Nodus hackathon.md`); aquí va solo lo que hay que hacer. Qué se dice y qué se ve en cada momento está en [guion.md](guion.md).

## Las decisiones

| Pregunta                                   | Decisión                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ¿Voz en off o yo a cámara?                 | Voz en off tuya todo el video. Tu cara, si acaso, solo en el cierre, unos segundos; si la luz no da, se corta y no pasa nada. Nada de imagen en imagen sobre la demo: compite con la interfaz y con los subtítulos.                                                                                                                      |
| ¿Voz propia o de inteligencia artificial?  | Propia. Algunos hackathons prohíben la voz sintética, los estudios dicen que saber que es IA baja la confianza, y en un campo lleno de voces de máquina la tuya diferencia. Clonar tu voz sirve solo para parchar una frase si no hay tiempo de regrabar.                                                                                |
| ¿Hago la demo en vivo mientras hablo?      | No. La pantalla se graba aparte, en silencio y en tomas cortas; la voz se graba después y cada toma se recorta a su frase. Hablar y hacer clic a la vez produce pausas raras y cursor que vaga. Pero la grabación es real: clics reales, prompt de passkey real, hash real.                                                              |
| ¿Primero las animaciones o primero la voz? | Primero la voz, dicha con tus palabras y de corrido por parte (`A.mp3`, `demo.mp3`, `B.mp3`). La animación se ancla después a lo que se dijo: nada se anima antes de tener el audio.                                                                                                                                                     |
| ¿Con qué hago las animaciones?             | Con la app misma: la ruta `/pitch` reutiliza el grafo, el nudo, las tintas y la curva de movimiento de Nodus, se cuelga de la voz por tiempos de palabra y se renderiza cuadro por cuadro (`pitch:render`). Cero herramienta nueva y el estilo es idéntico por construcción.                                                             |
| ¿Corto los silencios?                      | No se corta ni se agrega nada dentro de una parte: las pausas se graban. El silencio digital suena a corte, no a pausa; si una pausa tiene que ser más larga, se alarga con el sonido de sala de la misma grabación.                                                                                                                     |
| ¿Idioma?                                   | Español hablado, subtítulos en inglés quemados. Tellus pidió español en su edición anterior y el competidor chileno más fuerte de esta edición hizo exactamente esto.                                                                                                                                                                    |
| ¿Música?                                   | Una pista instrumental de cama, sin letra, fija a 20–25 dB por debajo de la voz, que sube 2–3 segundos en la apertura y el cierre. Solo de fuentes con licencia clara (YouTube Audio Library, Pixabay, Mixkit, Uppbeat). Música con derechos es error descalificador. `pitch/sonido.py` genera una cama y efectos propios, sin licencia. |
| ¿Modo claro u oscuro?                      | Uno solo para todo el video. Claro, que es como está diseñada la app.                                                                                                                                                                                                                                                                    |
| ¿Cuánto dura?                              | Corte final entre 2:48 y 2:52. Marcador en 2:55 como tope. Nunca 3:00. A mide 1:44,5 y B dura 0:36. La demo no se acorta: dura 45 s (techo 47) y A y B van a 1,1× con el tono conservado (`setpts=PTS/1.1` y `atempo=1.1`), así que el total queda en 2:52,7. La demo va a su velocidad, salvo las esperas de red con su rótulo.         |

## El orden de trabajo

La voz manda y la imagen se cuelga de ella: las escenas no se graban, se renderizan a la hora de cada frase.

1. **Voz de una parte,** de corrido, en `pitch/voz/` (`A.mp3` y `B.mp3` ya están; falta la demo).
2. **Juntar y transcribir.** `bun run pitch:juntar` y `uv run pitch/voz/alinear.py` (las palabras con su segundo).
3. **Anclar.** Escribir en `voz/anclas.json` las primeras palabras de cada paso, tal como se dijeron, y `bun run pitch:anclar --parte A` para A (B se ancla por separado, ver README). Revisar el informe: frases no encontradas o dudosas.
4. **Adaptar la escena** a lo que se dijo, y revisarla en `/pitch` (espacio reproduce con la voz; `L` repite una escena; `,` `.` cuadro a cuadro).
5. **Renderizar esa parte** (`pitch:render --desde … --hasta …`) y mezclarla con su voz (`pitch:mezclar`) para verla.
6. **Demo.** Grabar con OBS la app, sin hablar: un intento completo por vez, de donde salen las seis tomas ([paso a paso](#grabar-la-demo-paso-a-paso)). Después, la voz de la demo mirando las tomas elegidas.
7. **Montaje** en Kdenlive: la parte A, las seis tomas de la demo con su voz, la parte B.
8. **Subtítulos, música, exportación, subida, descripción, entrega.**

## Grabar la voz

- **Dónde.** Un clóset lleno de ropa, hablando hacia la ropa más densa; una frazada colgada detrás si hay pared desnuda. Sin el notebook dentro del clóset si su ventilador se oye: graba con el celular o alarga el cable.
- **Con qué.** Un micrófono USB cardioide de 30 a 70 dólares (Fifine K669, Tonor TC30, Samson Q2U) o el celular en modo sin pérdida, a 10–15 centímetros de la boca, apenas de lado para que no lleguen las "p".
- **Ganancia.** Picos en torno a −12 dBFS, nunca cerca de 0. Una grabación limpia y algo baja se arregla; una saturada no.
- **Cómo.** Cinco minutos de calentamiento. De pie, sonriendo (se oye), hablándole a una sola persona. Energía no es velocidad. Cada parte de corrido, con sus pausas, y dos o tres tomas completas para elegir; nada se pega después.
- **Limpieza** (Audacity, gratis): Noise Reduction tomando el perfil de un tramo solo con ruido, con reducción suave (6 dB) y revisando que no se coma la voz; luego Loudness Normalization a −14 LUFS; limitador para que los picos no pasen de −1 dBTP. Adobe Podcast Enhance (gratis hasta una hora al día) ayuda, pero no al 100 % porque suena plástico. Exportar WAV 48 kHz.
- **Si hay música**, los −14 LUFS se miden sobre la mezcla final, no sobre la voz sola.

## Grabar la pantalla

OBS es solo para las seis tomas de la app. Las escenas de `/pitch` no se graban: `bun run pitch:render` las saca cuadro por cuadro a 1920×1080 y 60 fps, siempre iguales y a la hora de la voz ([README.md](README.md)).

- **Herramienta.** OBS Studio (captura de pantalla por PipeWire en Wayland). Recordly u OpenScreen si quieres zoom automático al cursor; si fallan en Wayland, OBS y zoom con fotogramas clave en Kdenlive. Screen Studio y Cursorful no existen en Linux.
- **Ajustes.** 1920×1080 a 60 fps, como el render (o 4K si el monitor lo permite, para hacer zoom en edición sin perder nitidez). Formato mkv o mp4, 12–16 Mbps.
- **El navegador.** Perfil limpio sin extensiones, ventana fijada a 1920×1080, zoom de página al 125–150 % para que el texto se lea en un teléfono, pantalla completa salvo cuando se muestra la barra de direcciones del explorador. Notificaciones del sistema apagadas.
- **Antes de la demo.** Ver [Grabar la demo, paso a paso](#grabar-la-demo-paso-a-paso): la app de la demo con base limpia y los vecinos (`bash pitch/demo.sh`). Las transacciones de 20 y de 3 abiertas en pestañas de stellar.expert solo si se van a mostrar; la demo no va al explorador.
- **Un intento completo, no una toma por plano.** Las seis tomas dependen una de otra (la cuenta, las deudas, el círculo) y la liquidación se gasta al firmarla, así que se graba el recorrido entero y las seis tomas se cortan de él. Si algo falla, se descarta el intento y se repite desde una base limpia; las tomas buenas pueden venir de intentos distintos.
- **El prompt de passkey** se graba en tiempo real, 1 a 1,5 segundos: es parte del valor.
- **Las esperas de red** se aceleran en el montaje entre 4 y 8 veces, con un rótulo pequeño "tiempo acelerado". Acelerar el video completo está prohibido en varios hackathons; acelerar una espera con rótulo no.
- **La miniatura.** `bun run pitch:render stills --t 2.4` deja la portada en `pitch/out/wip/`.

## Grabar la demo sola

Así se grabó la demo del video (9 de octubre): sin nadie al mouse. Lo de «paso a paso», más abajo, es la forma a mano, que sigue sirviendo si se quiere el diálogo de la passkey del sistema en pantalla.

```bash
# Una copia de la app solo para grabar (puerto 3004, base .data-auto), con una panadería que crean los scripts y su red completa.
DEMO_PUERTO=3004 DEMO_DATOS=.data-auto CREAR=1 MANOS_FUERA=1 bash pitch/demo.sh vecinos   # ~10 min la primera vez; después, ~1 min
bun pitch/grabar.ts --salida pitch/out/demo/toma-3      # el recorrido entero, ~2 min; deja panaderia.mp4, transportista.mp4 y marcas.json
bun pitch/demo-montar.ts --toma pitch/out/demo/toma-3   # lo corta a la voz: pitch/out/demo-sin-voz.mp4 (43 s)
python3 pitch/sonido.py                                 # las camas, también la del video entero (cama-final.wav)
bun pitch/final.ts                                      # A + demo + B: pitch/out/nodus-final.mp4
```

- **Cómo graba.** `grabar.ts` abre un Chromium sin ventana a 1536×864 con escala 1,25 (lo mismo que una pantalla de 1920×1080 con el zoom en 125 %) y guarda cada cuadro que el navegador dibuja, con su hora: salen unos 58 por segundo. El puntero es un dibujo dentro de la página que sigue al ratón. Entre una acción y la siguiente lo deja quieto, y anota la hora de cada cosa en `marcas.json`.
- **Las firmas.** La app pide la passkey con WebAuthn, como siempre. La responde el autenticador virtual del navegador, al que se le entregan las llaves de prueba de la panadería y del transportista (`pitch/out/demo/vecinos.json`). No hay diálogo que aprobar, así que no se ve ninguno. Las transacciones son reales, en la red de pruebas.
- **El transportista acepta en cámara.** Con `MANOS_FUERA=1` los vecinos no aceptan por él: una segunda pestaña, con su cuenta, abre su bandeja y aprieta «Aceptar con passkey».
- **Entre una toma y otra, 15 minutos.** `vecinos` deja todo listo en un minuto, pero el círculo recién liquidado se queda arriba en «Bandeja» hasta 15 minutos después de su primera firma.
- **Una copia a la vez.** Dos copias llenándose al mismo tiempo sobre el mismo contrato chocan: cada deuda nueva toma el número siguiente, y si otra se registra entre que la transacción se prepara y se envía, falla («trying to access contract data key outside of the footprint»).
- **El montaje.** `demo-montar.ts` tiene la lista de tramos: cada uno empieza en una marca y cae en su segundo de la voz. Si el siguiente llega antes, el tramo se corta en una pausa; si llega después, su último cuadro se queda. Nada va acelerado. Si la voz se graba de nuevo, se cambian ahí los segundos.

## Grabar la demo, paso a paso

La demo se graba en una copia local de la app, compilada en modo producción, con su propia base de datos y escuchando solo en `127.0.0.1:3002`. No en producción ni con `next dev`:

- Los nombres de negocio no son únicos y el selector «Quién te debe» busca en un directorio global. Si cada intento creara vecinos nuevos con el mismo nombre saldrían varios «Fletes Ruta 5» y podrías elegir uno que ya no responde; por eso la cuenta y los vecinos son permanentes.
- Producción queda limpia, y no hay insignia de desarrollo de Next ni esperas de compilación.
- Los límites (relayer 120 por hora, faucet 20 al día, por IP) viven en esa base: reiniciarla los pone en cero. Cada intento gasta unas 8 llamadas al relayer.

```bash
bash pitch/demo.sh construir   # una vez, o si cambia la app; deja tsconfig.json y next-env.d.ts como estaban
bash pitch/demo.sh reiniciar   # borra TODO (base y vecinos guardados): solo para empezar de cero
bash pitch/demo.sh iniciar     # levanta la app con la base que haya
bash pitch/demo.sh llave       # una vez: le da a los scripts una passkey de la panadería (ver abajo)
bash pitch/demo.sh vecinos     # deja todo listo para un intento (la primera vez llena la red: ~8 min; después, ~1 min)
bash pitch/demo.sh cuenta      # qué tiene la cuenta: deudas, círculos, passkeys (reinicia la app)
bash pitch/demo.sh estado      # ¿está arriba?, y las últimas líneas de los vecinos
bash pitch/demo.sh detener     # al terminar
```

Se abre en `http://localhost:3002`, con `localhost` y no con `127.0.0.1`: una passkey no puede ser de una IP.

**Preparación, una vez**

- **OBS Studio** (Flatpak, instalado a nivel de usuario: `flatpak run com.obsproject.Studio`). El perfil «Nodus» ya viene hecho: 1920×1080 a 60 fps, MKV, calidad alta, grabaciones en `~/Videos/nodus-demo/`. Falta una cosa que solo se puede a mano: en la escena, «+» → «Captura de pantalla (PipeWire)», elegir la pantalla completa y marcar «Mostrar cursor». La pantalla completa, no la ventana: así entra el prompt de la passkey aunque sea otra ventana. En Wayland OBS no tiene atajos globales, así que la grabación se inicia y se detiene desde su ventana.
- **Perfil de Brave «Demo»**, solo con la extensión de Bitwarden y sin barra de marcadores; F11 y zoom 125 %. Bitwarden desbloqueado y con el bloqueo automático en «nunca» mientras grabas; mejor con una cuenta de Bitwarden de prueba, para que en el diálogo de la passkey no pueda salir nada personal. La contraseña maestra no se teclea nunca en cámara.
- **GNOME** en «No molestar» y sin bloqueo de pantalla (`gsettings set org.gnome.desktop.session idle-delay 0`; al terminar, devolverlo). Cerrar Discord, Telegram y Spotify.

**La cuenta de la panadería, una sola vez.** Es permanente: así la demo arranca entrando con la passkey y la red ya tiene saldo, deudas e historial. Los vecinos también son permanentes (sus llaves de prueba quedan en `pitch/out/demo/vecinos.json`), así el selector nunca muestra dos «Fletes Ruta 5».

1. Si no existe: en el perfil «Demo», «Crear cuenta», `Panadería Sur`, «Crear cuenta con passkey». Una sola vez y sin pulsar nada más hasta que cargue.
2. **La llave de los scripts.** En «Equipo»: «Invitar un dispositivo», un nombre (`Notebook del local`), «Crear enlace de invitación». Después `bash pitch/demo.sh llave`: el script responde la invitación con una passkey de prueba y espera. En «Equipo» aparece «Agregar con passkey»: se aprueba con la passkey de verdad, una vez. Desde ahí los scripts firman como la panadería (la llave queda en `vecinos.json`, fuera de git) y no queda nada que aceptar a mano entre intentos.
3. `bash pitch/demo.sh vecinos`. La primera vez llena la red, en unos 8 minutos: cuatro proveedores (Molino Andes 100, Agrícola Maipo 75, Distribuidora Lácteos 55, Envases Sur 30), cinco clientes (Hotel Andino 180, Restaurante Del Valle 140 de 200 con un pago de 60 y la factura vencida, Colegio Los Aromos 95, Cafetería Central 70 de 150, Minimarket Don Pepe 45), con sus facturas y vencimientos, y dos círculos ya desanudados en «Historial» (245 moviendo 50 entre tres; 320 sin mover dinero entre cuatro). Lo que queda debiéndose no cierra ningún círculo: el único que aparece al grabar es el de 100, 80 y 90.

**Un intento.** Antes de grabar, `bash pitch/demo.sh vecinos` (pone los límites de uso en cero, y reinicia la app un par de segundos): paga lo que haya dejado un intento a medias, deja a la panadería debiendo 100 al molino (aceptada) y al molino 80 al transportista, y avisa `Ready` en `pitch/out/demo/vecinos.log`. **«Bandeja» tiene que estar vacía antes de grabar:** un círculo liquidado se queda arriba, en «Recién desanudados», hasta 15 minutos después de su primera firma, y taparía la tarjeta de la toma 4. Tú, fuera de cámara, solo «Salir». Después, solo clics:

1. OBS → iniciar la grabación. Alt+Tab al navegador en `http://localhost:3002`. Puntero al borde, quieto 2 s.
2. **Toma 1.** «Entrar con mi passkey»: el prompt a la vista 1–1,5 s y se aprueba. Llega a «Red» con saldo, «Debes 100» y el historial. Quieto 2 s.
3. **Toma 2.** «Registrar una deuda» → `Flet` → «Fletes Ruta 5» → `90` → «Registrar con passkey» → prompt.
4. **Toma 3.** Manos fuera y el puntero aparcado a un lado hasta que la cuerda quede entera. Quieto 2 s.
5. **Toma 4.** «Ir a la bandeja»: la tarjeta. Pausa de 2 s y el puntero recorre, lento, las tres cifras. Extra: alternar «Sin mover dinero» y volver a «Liquidar todo».
6. **Toma 5.** «Firmar con passkey» → prompt. Quieto mientras se lee «Firmando · 1 de 3».
7. **Toma 6.** No tocar nada hasta «Desanudado» y el recibo. Quieto 3 s. Extra: abrir «Historial» (ahora con dos comprobantes).
8. Alt+Tab a OBS → detener.

**Reglas del puntero.** Lento y en línea recta; 1 s de quietud antes y después de cada clic; aparcado fuera de lo que importa mientras se espera. No se habla: la voz va después.

**Esperas medidas.** Dos recorridos completos del 9 de octubre en la red de pruebas, con una panadería de llaves de software. En la app se suman el prompt de la passkey (1 a 1,5 s) y el sondeo de 3 s. Sirven para decidir qué acelerar en el montaje.

| Qué                                               | Espera                                                                            |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| Crear la cuenta                                   | 9 a 11 s                                                                          |
| Vecinos listos, desde que arrancan                | 55 a 65 s                                                                         |
| Aceptar la deuda de 100                           | 8 a 14 s                                                                          |
| «Obtener … de prueba»                             | 7 a 8 s                                                                           |
| Registrar la deuda de 90                          | 8 a 9 s                                                                           |
| Círculo visible tras registrar (el vecino acepta) | 4 a 10 s                                                                          |
| Tu firma, hasta «Firmando · 2 de 3»               | 13 a 17 s con la pausa de 5 s de las pruebas; unos 10 a 15 s con la de 3 s actual |
| «2 de 3» hasta «3 de 3»                           | 4 s                                                                               |
| «3 de 3» hasta «Desanudado»                       | 8 s, más 1,5 s del nudo                                                           |

**Toma 3 literal (inserto).** El guion pide la bandeja del transportista. Se graba aparte, en otra instancia con base propia (`http://localhost:3003`) para que no convivan dos «Fletes Ruta 5»: `bash pitch/demo.sh inserto`, y ahí, en el perfil «Demo», crear la cuenta `Fletes Ruta 5` con su passkey. Un negocio «Panadería Sur», manejado por el script, le registra 90. Se graba «Bandeja» → «Panadería Sur registró que le debes 90» → «Aceptar con passkey» → prompt → «Aceptada». En el montaje va entre la toma 2 y la 4. Es independiente del recorrido principal.

**Si algo falla** (testnet lenta, una transacción rechazada): el intento se descarta y se repite desde «Un intento». Las tomas buenas pueden venir de intentos distintos, porque la cuenta se llama igual en todos.

**Al terminar:** `bash pitch/demo.sh detener`, devolver `idle-delay` y las notificaciones, y borrar las passkeys de prueba de Bitwarden. Las grabaciones se copian a `pitch/out/demo/` (fuera de git).

## Grabarte a cámara

- **Luz.** De frente a una ventana grande sin sol directo, en una mañana o tarde nublada. Una lámpara rebotada en la pared o tapada con papel mantequilla como relleno del otro lado. Nunca luz cenital (ojos hundidos), nunca una ventana a la espalda. Balance de blancos fijo.
- **Encuadre.** El celular en horizontal a 1080p, apoyado en libros a la altura de los ojos, a un brazo de distancia; tú de hombros para arriba, con aire sobre la cabeza; fondo limpio.
- **Mirada.** Al lente, no a la pantalla. La frase pegada en un papel justo al lado del lente. Tres segundos de mirada al lente antes y después de hablar, para tener aire de edición.
- **Sonido.** El mismo micrófono que la voz en off, para que no cambie el timbre al cortar.
- **Ropa.** Lisa, sin rayas finas ni logos.
- Tres tomas. Si ninguna queda bien, el cierre va con la escena 8 y no se pierde nada.

## Montar

- **Editor.** Kdenlive. DaVinci Resolve gratis en Linux no decodifica el audio AAC de los mp4 y obliga a transcodificar todo. Audacity para la voz. ffmpeg a mano si hace falta.
- **Tres piezas en fila.** La parte A renderizada, las seis tomas de la demo con su voz y la parte B renderizada. La voz manda; cada toma de la demo se corta a su frase.
- **Ritmo.** Algo tiene que cambiar en pantalla cada 15–30 segundos; en la apertura, cada 3–5. Ningún cuadro quieto más de 30 segundos.
- **Números.** Cada vez que la voz dice un número, ese número grande en pantalla en el mismo instante, con la tipografía de la app. Nada de texto menor a 24 píxeles en el video final. Probarlo en el teléfono.
- **Rótulos** de 3–6 segundos, en los dos tercios superiores, porque el inferior lo ocupan los subtítulos. El rótulo "tiempo acelerado" sobre las esperas.
- **Subtítulos** en inglés quemados: traducción condensada, 10–20 % más corta que la voz; hasta 42 caracteres por línea, dos líneas, y no más de 20 caracteres por segundo; 45–55 píxeles con borde o fondo semitransparente, sobre el borde inferior sin tapar la interfaz. Además, un SRT en español y otro en inglés para subir a YouTube.
- **Música** a −20/−25 dB bajo la voz. Verificar la licencia aunque sea "gratis".
- **Tope.** Marcador en 2:55. Si pasa, se acortan las esperas de la demo y los segundos del explorador, no las frases de "por qué Stellar".
- **Exportar.** 1920×1080, H.264, 12–16 Mbps si se grabó a 60 fps (8 a 30 fps), AAC 320 kbps 48 kHz, misma tasa de cuadros en que se grabó.

## Entregar

- Subir a YouTube como no listado, con los dos SRT. Título: "Nodus: compensación de deudas entre negocios en Stellar". Miniatura: el cuadro de la escena 8 (el nudo y "Nodus"), o el triángulo con "Desanuda las deudas".
- Verlo entero en el teléfono y en el notebook. Probar el enlace en una ventana de incógnito.
- La descripción del proyecto en Stellar Passport, con la estructura que usan los fuertes de esta edición: problema, solución, por qué Stellar, qué funciona (contract ID, los dos hashes, tests, "la app propone círculos de hasta 8; el de 20 se armó con un script"), límites honestos (red de pruebas, facturas e identidad simuladas, sin auditoría), enlaces (video, repositorio, explorador), próximos pasos. El borrador está en `docs/descripcion.md`.
- Confirmar que la entrega aparece publicada. Cierre: 12 de octubre a las 20:59 hora de Chile según la página de Stellar Passport (el blog de Tellus decía 5 de octubre: está desactualizado). Entregar el domingo 11; el lunes es colchón.

## Lo que falta

La entrega cierra el lunes 12 de octubre a las 20:59 de Chile; la idea es entregar el domingo 11 y dejar el lunes de colchón.

- [x] Parte A: voz, anclas, animación.
- [x] Voz de la parte B.
- [x] Preparar la grabación de la demo: OBS, app y vecinos (`bash pitch/demo.sh`), tarjeta de tomas para el celular.
- [x] Llenar la red de la panadería (`llave` y `vecinos`): proveedores, clientes, historial.
- [x] Grabar la demo, con el transportista aceptando desde su cuenta (`pitch/grabar.ts`).
- [x] Voz de la demo (`pitch/voz/demo.mp3`, 42,4 s).
- [x] A y B a 1,1× con el tono conservado, y el video entero con una sola cama (`pitch/final.ts`).
- [x] Anclar y adaptar la parte B a su voz.
- [x] Render final de las dos partes a 60 cuadros por segundo.
- [x] Montaje y sonido: `pitch/out/nodus-final.mp4`, 2:49,8, 1920×1080 a 60, −14,8 LUFS (la toma usada es `pitch/out/demo/toma-3`).
- [ ] Oír el video entero (los niveles están medidos, pero nadie lo ha escuchado) y verlo en el teléfono.
- [ ] Subtítulos en inglés, subida, descripción, entrega.

## Lista final antes de subir

- [ ] Dura menos de 2:55.
- [ ] Nodus se ve en la portada y se nombra antes del primer minuto.
- [ ] Se ve el prompt de la passkey de verdad.
- [ ] Se ve el hash de 20 negocios (en el recibo de la parte B).
- [ ] Se lee "red de pruebas" y "simuladas" en el cierre (ya no se dice: se recortó de la voz).
- [ ] Ningún texto menor a 24 píxeles; probado en el teléfono.
- [ ] Voz a −14 LUFS, picos bajo −1 dBTP, sin ruido de fondo audible en silencio.
- [ ] Música con licencia verificada, bajo la voz.
- [ ] Subtítulos en inglés legibles a velocidad normal.
- [ ] Sin "Soroban", "smart contract", "on-chain", "trustless" ni "wallet" en la voz.
