# Motor fiscal (`packages/core/src/fiscal`)

Alcance, supuestos, fuentes y limitaciones de cada módulo. Todas las cifras son
**orientativas** y se refieren al ejercicio `FISCAL_YEAR` (`brackets.ts`). No es
asesoramiento fiscal.

## `brackets.ts`

Escalas oficiales, constantes del rendimiento del trabajo y motor de tramos
progresivos. Es la única fuente de verdad de los tipos impositivos.

- **Escala estatal general** (art. 63.1.1º LIRPF): se aplica tal cual. La ley ya
  la da dividida por dos (tipos 9,50 a 24,50); multiplicarla por 0,5 la dividiría
  dos veces. Fuente: AEAT, Manual práctico de Renta 2025, "Gravamen estatal".
- **Escala autonómica supletoria** (art. 65 LIRPF): coincide con la estatal hasta
  60.000 €, pero su último tramo es un 22,50 % plano, sin el desdoblamiento de
  300.000 € al 24,50 %. Confundirlas sobreestima las rentas > 300.000 € (49 % en
  vez del 47 % real). Desde 2011 no hay supletoriedad real: rige solo para Ceuta y
  Melilla (DA 32ª LIRPF) y residentes en el extranjero, y es la que se usa si no
  se indica comunidad.
- **Escala general** `IRPF_GENERAL` = estatal + supletoria tramo a tramo (el 47 %
  final sale de 24,50 + 22,50).
- **Ahorro, Patrimonio (Ley 19/1991, art. 30) y Sucesiones (Ley 29/1987, art. 21)**:
  escalas estatales; las CCAA pueden aprobar la suya.
- **Seguridad Social del trabajador**: 6,50 % indefinido (contingencias comunes
  4,70 + desempleo 1,55 + FP 0,10 + MEI 0,15), 6,55 % temporal; base máxima
  5.101,20 €/mes × 12. Fuente: Orden de cotización 2026.
- **Gastos de difícil justificación** (estimación directa simplificada, art. 30
  RIRPF, RD 439/2007): 5 % con tope de 2.000 €. El 7 % fue excepcional de 2023.
- **Reducción por rendimientos del trabajo** (art. 20 LIRPF): escala decreciente de
  tres tramos; por encima del tercer límite es 0.
- **Planes de pensiones** (art. 52 LIRPF): límite individual 1.500 €, hasta 8.500 €
  adicionales por contribuciones empresariales, conjunto 10.000 € y, además, el
  30 % de los rendimientos netos del trabajo y de actividades económicas.
- **Mínimos** (arts. 57-60 LIRPF): los descendientes se computan al 100 %; si se
  repartieran con el otro progenitor serían la mitad.

## `irpf.ts`

Rendimiento del trabajo para las calculadoras de salario bruto→neto, retención,
planes de pensiones e IRPF de autónomos. Aproxima el cálculo de la AEAT por el
método de doble escala: cuota(base) − cuota(mínimo personal y familiar).

- **Sin comunidad**: escala conjunta `IRPF_GENERAL` y mínimo estatal (comportamiento
  de Ceuta y Melilla).
- **Con comunidad**: cuota estatal (escala y mínimo estatales) + cuota autonómica
  (escala de la comunidad y su mínimo propio si lo tiene), cada una acotada a cero
  por separado. El mínimo autonómico solo alimenta la cuota autonómica (art. 46.1.a
  Ley 22/2009).
- **Limitaciones**: no se modelan deducciones autonómicas (muchas y de gran
  efecto en el resultado real).

## `regions.ts`

Escalas autonómicas y mínimos personales y familiares de las 15 comunidades de
régimen común.

- **Combinación**: `cuotaÍntegraGeneral = escalaEstatal(BLG) + escalaAutonómica(BLG)`,
  sin factor 0,5. Cada cuota es independiente: `escala(BLG) − escala(mínimo)`,
  acotada a cero por separado.
- **Sin rama "la comunidad no legisló"**: desde 2011 se exceptúa la aplicación
  supletoria de la normativa estatal en tarifa autonómica y las 15 comunidades
  tienen escala propia.
- **Base del ahorro**: no es competencia autonómica (arts. 66.1 y 76 LIRPF las fija
  la ley estatal), así que no se parametriza por comunidad.
- **Fuentes**: AEAT, Manual práctico de Renta 2025 (actualizado en marzo de 2026),
  capítulo 15 "Gravamen autonómico"; contrastado con Hacienda, _Tributación
  Autonómica. Medidas 2026_ (29/04/2026), que confirma que ninguna comunidad
  modificó su escala de 2026 respecto de 2025: valen para ambos ejercicios.
- **Canarias, último tramo**: el Anexo I de Hacienda dice «26 % para BL > 121.200 €»,
  pero es texto idéntico en los PDF de Medidas 2025 y 2026, boilerplate anterior a
  la deflactación del 2,1 % (121.200 × 1,021 = 123.745,2). Vale 123.745 €, que es lo
  que da la AEAT. No "corregir" a 121.200.
- **Mínimos autonómicos**: importes del ejercicio 2025 (AEAT, "Cuadro comparativo de
  los importes de los mínimos personales y familiares, estatal y autonómicos para
  2025", 17/03/2026). Hacienda confirma que en 2026 ejercen la competencia las
  mismas comunidades en los mismos términos, pero no publica importes de 2026 y el
  manual de Renta 2026 aún no existe: la continuidad es razonable pero no está
  verificada. Hueco declarado. Los importes por tramo de edad son totales
  acumulados, no incrementos. No se modelan el incremento por ascendiente > 75 años
  ni los gastos de asistencia de terceras personas.
- **Illes Balears sin mínimo propio, a propósito**: el cuadro de la AEAT dice «5.550
  euros anuales, en general. 6.105 euros anuales si tiene más de 65 años + 1.265
  euros anuales, mayor de 65 años + 1.540 adicionales, mayor de 75» y es ambiguo
  sobre si 6.105 sustituye a 5.550 o se acumula con el +1.265. Antes de codificarlo
  hay que leer el art. 1 del TR balear (Decreto Legislativo 1/2014). Mientras tanto
  usa el mínimo estatal: mejor un hueco declarado que un número inventado.
- **La Rioja sin mínimo propio**: solo modifica el mínimo por discapacidad de
  descendientes (3.300 / 9.900), que las calculadoras no modelan (solo la del
  contribuyente, donde mantiene los importes estatales).
- **Territorios no soportados**: se muestran en el selector deshabilitados en vez de
  omitirlos, porque quien no se ve asume que el resultado genérico le vale.
  - Régimen foral (Álava, Bizkaia, Gipuzkoa, Navarra): Concierto/Convenio
    Económico con ley propia. Su escala es el impuesto total, no una mitad que se
    sume a la estatal, y el País Vasco tiene tres escalas (una por territorio). No
    hay ninguna cifra foral en el módulo.
  - Ceuta y Melilla: su escala es la supletoria (art. 65 LIRPF), pero no se modela
    la deducción por rentas obtenidas allí (art. 68.4 LIRPF, 60 %), que domina el
    resultado; dar la cuota sin ella engañaría.
- **Limitaciones**: no se modelan las deducciones autonómicas (≈358 vigentes).

## `plusvalias.ts`

Ganancias y pérdidas patrimoniales por transmisión de valores homogéneos:
emparejamiento FIFO de lotes y estimación de la cuota en la escala del ahorro.
Lo consumen la simulación "¿qué pasaría si vendo?" y el informe de ganancias
realizadas (`realised-gains.ts`), con las mismas reglas.

**Modela**

- FIFO obligatorio para valores homogéneos: art. 37.2 Ley 35/2006 (valores
  cotizados) y art. 37.1.b (participaciones en IIC). No se elige lote ni coste medio.
- Valor de adquisición = importe + gastos y comisiones de compra (art. 35.1); las
  comisiones del lote se prorratean entre las participaciones vivas.
- Valor de transmisión = importe recibido − gastos y comisiones de venta (art. 35.2).
- Escala del ahorro (`IRPF_AHORRO`) aplicada por tramos.

**No modela** (resultado solo orientativo)

- Regla de los dos meses (art. 33.5.f): recomprar el mismo valor en los dos meses
  anteriores o posteriores impide computar la pérdida en ese ejercicio.
- Compensación con otras ganancias y pérdidas: la simulación mira la venta aislada,
  así que una pérdida da cuota 0 en vez del ahorro fiscal real. (El informe anual sí
  compensa las ventas del mismo ejercicio.)
- Resto de la base del ahorro (dividendos, intereses, otras ventas), que puede
  empujar la ganancia a un tramo superior.
- Retenciones, coeficientes de abatimiento (DT 9ª), no residentes, traspasos de
  fondos con diferimiento (art. 94) y especialidades forales.

## `realised-gains.ts`

Informe anual de ganancias y pérdidas realizadas: ventas ya registradas, emparejadas
por FIFO (`walkLots`), agrupadas por ejercicio y compensadas dentro de él.

**Modela**

- FIFO, valores de adquisición y transmisión con comisiones (ver `plusvalias.ts`).
- FIFO por valor, no por posición: el criterio se aplica a todas las
  participaciones del contribuyente, estén en el bróker que estén. Si el mismo
  símbolo está en dos posiciones, una venta en cualquiera empareja primero la compra
  más antigua de las dos; cada venta se atribuye a la posición donde se registró.
- Integración y compensación dentro del ejercicio (art. 49.1.b LIRPF): se suman
  ganancias y pérdidas del mismo año y la cuota se estima sobre el saldo si es
  positivo.

**No modela** (el informe lo avisa en pantalla)

- Saldos negativos de los cuatro ejercicios anteriores (art. 49.1.b, último
  párrafo): un año con pérdida neta da cuota 0 y no se arrastra.
- Compensación cruzada del 25 % con rendimientos del capital mobiliario (la cartera
  no registra dividendos ni intereses).
- Regla de los dos meses (art. 33.5.f).
- Conversión a euros de posiciones en otra divisa: Hacienda exige el cambio oficial
  de la fecha de compra y de venta, y la aplicación solo guarda unos días de
  histórico de tipos; convertir con el cambio de hoy daría una cifra fiscalmente
  falsa. Los importes se agrupan por divisa y la cuota solo se estima sobre el grupo
  en euros.
