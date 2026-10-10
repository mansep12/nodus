/**
 * The scenes of the video, in the order they play. Every scene is a stretch
 * of one drawing seen through one camera (`world.tsx`): a scene only names
 * its steps, one each time the voice gets to the next line, and says what
 * happens in each for the cue line under the frame. The slate marks where
 * the recording of the app goes: what comes before it is rendered as one
 * part of the video, and what comes after as another. When each step
 * happens is the timeline's (`timeline.ts`).
 */
export interface Scene {
  id: SceneId;
  title: string;
  steps: string[];
}

export type SceneId = "problema" | "nudo" | "idea" | "caja" | "red" | "demo" | "veinte" | "stellar" | "cierre";

export const SCENES: Scene[] = [
  {
    id: "problema",
    title: "El problema",
    steps: [
      "Portada: el mundo pequeño y tenue; el nudo se dibuja, aparece Nodus y la frase. La voz ya habla. Sirve también de miniatura.",
      "Un negocio puede cerrar: bajo la frase, el rótulo de 6 de cada 10 pymes, al borde del cierre o endeudadas por los atrasos.",
      "La ley establece un plazo: la cámara baja al mundo, hasta la tarjeta de los días que tarda en pagarse una factura, con su regla.",
      "La marca de la ley, con su píldora: 30 días.",
      "El promedio real: la barra pasa la marca y sigue en rojo mientras su cifra cuenta hasta 44.",
      "Entre pymes es peor: la segunda barra llega a la marca.",
      "Y sigue de largo, contando hasta 53.",
      "El atraso viene en cadena: la tarjeta se va y la cámara viaja a lo largo de una cadena de negocios que se dibuja eslabón por eslabón, hasta ti.",
      "Quien te debe también está esperando: lo que te deben, en azul; cada negocio late cuando la espera llega a él, y bajo cada uno, quién es.",
    ],
  },
  {
    id: "nudo",
    title: "El nudo",
    steps: [
      "Un ejemplo sencillo: la cadena se va, la cámara se acerca y el círculo se dibuja vacío, con el lugar de cada uno de los tres.",
      "Se dibujan la panadería y el molino, y la deuda entre ellos: 100.",
      "Se dibuja el transportista, y la deuda del molino con él: 80. La cámara se abre un poco.",
      "La deuda del transportista con la panadería: 90. Se cierra el círculo y el centro cuenta hasta 270.",
      "Bajo el 270: los tres tienen dinero por cobrar, pero ninguno tiene suficiente para pagar.",
    ],
  },
  {
    id: "idea",
    title: "La idea",
    steps: [
      "Las tres deudas, juntas: 270 en deudas.",
      "Forman un círculo: las tres se encienden en verde.",
      "Para eso hicimos Nodus: el nombre, sobre el círculo.",
      "Y bajo el nombre, lo que hace: compensa las deudas, solo se paga la diferencia.",
      "En este ejemplo hay 270 en deuda: el nombre se va y las deudas vuelven a la tinta.",
      "Basta con mover 20: las tres cuerdas se retiran y el centro baja de 270 a 20.",
      "La panadería y el transportista pagan 10 cada uno: dos cuerdas finas hacia el molino.",
      "El molino recibe 20, y late.",
      "Las tres deudas quedan saldadas: se anudan y el nudo se suelta. Queda el anillo verde: se saldaron 270 moviendo 20.",
    ],
  },
  {
    id: "caja",
    title: "Sin usar caja",
    steps: [
      "Otra resolución del mismo ejemplo: vuelven las deudas de 100, 80 y 90. Sin usar caja.",
      "El monto común: se destaca el descuento de 80 en cada una de las tres deudas.",
      "Sin mover plata: las cuerdas se reducen a 20, 0 y 10; desaparece la deuda del molino. Cero dinero movido.",
      "La panadería queda debiendo 20 al molino: se destaca esa deuda pendiente.",
      "El transportista queda debiendo 10 a la panadería: se destaca la otra deuda pendiente.",
      "La comparación vuelve al total original: 270 en deudas al inicio; las deudas residuales siguen visibles.",
      "De 270 quedan 30 por pagar. Las dos deudas siguen visibles; se compensaron 240 sin mover plata.",
    ],
  },
  {
    id: "red",
    title: "La red",
    steps: [
      "Esto pasa con muchos negocios: la cámara se aleja y los tres tienen sus deudas otra vez.",
      "Un negocio le debe a otros: de la panadería salen cuerdas hacia su izquierda, donde ya estaba el molino.",
      "Otros le deben a él: desde su derecha, donde ya estaba el transportista, llegan cuerdas a la panadería.",
      "Y esos, a su vez: cada uno se abre igual, con los que le debe y los que le deben, y los tres se confunden con el resto.",
      "Cuentas pendientes con otros negocios: otra vuelta, más afuera. La cámara se aleja.",
      "Así se va formando una red enorme: la última vuelta y los cruces. La cámara se aleja hasta verla entera.",
      "Cada uno solo puede ver lo suyo: todo se apaga menos las deudas de la panadería, en sus tintas.",
      "Nadie ve cómo están todos conectados: la red entera, encendida otra vez.",
      "Nodus sí: la red queda tenue y los círculos que hay en ella se dibujan en tinta, el de los tres entre ellos.",
      "Puede encontrar esos círculos: se marcan en verde.",
    ],
  },
  {
    id: "demo",
    title: "Demo (claqueta, no va en el video)",
    steps: ["Las seis tomas de la app, en orden. Esta pantalla no se graba: es el marcador del montaje."],
  },
  {
    id: "veinte",
    title: "Veinte en una transacción",
    steps: [
      "La cámara viaja a la derecha, pasando por la red, y el anillo de 20 negocios se dibuja, sin firmas.",
      "Las firmas llegan en desorden, repartidas en lo que la voz deja hasta el paso siguiente (de 120 a 300 ms cada una), y cada una viaja a la siguiente que falta; la panadería firma última.",
      "Con la última firma el círculo se anuda y se suelta.",
      "Junto al anillo, el recibo: el hash real, 20 firmas, 33 % del cómputo, 44 % del tamaño.",
    ],
  },
  {
    id: "stellar",
    title: "Por qué Stellar",
    steps: [
      "La cámara se abre, el recibo se retira y arriba se lee: Por qué Stellar. Hoy siempre hay alguien en el medio.",
      "A la izquierda, Hoy: lo que te deben pasa por alguien en el medio, que se queda con una parte, en rojo. 100 a 53 días al 2,2 % mensual: llegan 96.",
      "A la derecha, En Stellar: nadie en el medio. Un smart contract ocupa el lugar del intermediario.",
      "Cada negocio firma con su huella, desde su teléfono.",
      "La red lo ejecuta todo junto: todo o nada, si falta una firma no se mueve nada.",
      "Nadie retiene tu plata: entra y sale en la misma transacción.",
      "El recibo es público para todos.",
    ],
  },
  {
    id: "cierre",
    title: "Cierre",
    steps: [
      "La cámara se aleja hasta ver todo, pequeño y tenue; el nudo se dibuja, aparece Nodus y la frase, y debajo lo que es real y lo que no: red de pruebas, facturas e identidad simuladas.",
      "La dirección del repositorio.",
    ],
  },
];

/** Where each scene starts, counting the steps of all the scenes before it. */
const STARTS = SCENES.reduce<Record<string, number>>((starts, scene, index) => {
  const previous = SCENES[index - 1];
  starts[scene.id] = previous ? starts[previous.id]! + previous.steps.length : 0;
  return starts;
}, {});

/** A step of a scene as one number, counted from the start of the video, so that "from here on" is a comparison. */
export function position(id: SceneId, step = 0): number {
  return STARTS[id]! + step;
}
