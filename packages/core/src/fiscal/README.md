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

## `fx-reference.ts`

Tipo de cambio de referencia del BCE vigente en una fecha, para pasar a euros operaciones en
divisa. La serie la descarga y cachea la API (`apps/api/src/fx-reference/`) del ECB Data Portal
(series `EXR.D.<DIVISA>.EUR.SP00.A`), que son los tipos que publica el Banco de España.

- **Festivos y fines de semana:** el BCE no publica; vale la última publicación anterior a la
  fecha. Si la última queda a más de `MAX_RATE_GAP_DAYS` (7) días, no es un festivo sino que
  falta la serie, y no hay tipo (mejor sin cifra que con un cambio que no corresponde).
- **Sin publicación posterior:** nunca se usa un tipo de un día posterior a la operación.
- **Antes de 1999** no hay serie (el euro nace el 4 de enero de 1999).

## `realised-gains.ts`

Informe anual de ganancias y pérdidas realizadas: ventas ya registradas, emparejadas
por FIFO (`walkLots`), pasadas a euros, agrupadas por ejercicio y compensadas dentro de él.

**Modela**

- FIFO, valores de adquisición y transmisión con comisiones (ver `plusvalias.ts`).
- FIFO por valor, no por posición: el criterio se aplica a todas las
  participaciones del contribuyente, estén en el bróker que estén. Si el mismo
  símbolo está en dos posiciones, una venta en cualquiera empareja primero la compra
  más antigua de las dos; cada venta se atribuye a la posición donde se registró.
- Integración y compensación dentro del ejercicio (art. 49.1.b LIRPF): se suman
  ganancias y pérdidas del mismo año y la cuota se estima sobre el saldo si es
  positivo.
- **Valores en divisa (criterio de la DGT):** la ganancia se calcula en la divisa en que
  están denominados los valores y la diferencia se convierte a euros al tipo vigente el día
  de la venta. Los valores de transmisión y de adquisición se convierten con ese mismo tipo,
  de modo que su resta es la ganancia. Fuentes: consultas vinculantes V2422-20, V0706-22 y
  V0152-26 (27/01/2026), que repiten literalmente el criterio de una consulta de 6 de julio
  de 2017: «debiendo efectuarse dicho
  cálculo en la moneda en que se encuentren denominadas las acciones y efectuar la conversión
  de la diferencia resultante a euros al tipo de cambio vigente en la fecha en la que haya
  tenido lugar la alteración patrimonial».
- **Diferencias de cambio:** cambiar la divisa a euros es otra ganancia o pérdida (art. 33
  LIRPF; V2466-08, citada en V0152-26), por la diferencia entre lo que costó la divisa y lo
  que se recibe por ella. El informe la calcula por lote vendido como
  `adquisición / tipo de la venta − adquisición / tipo de la compra`, **suponiendo que la
  divisa se compró el día de la compra y se cambia a euros el día de la venta** (lo que hace
  un bróker con cuenta en euros). Con ese supuesto, ganancia + diferencia de cambio es
  exactamente convertir cada operación al tipo de su fecha (lo comprueba un test de
  propiedades). Si el usuario guarda la divisa en una cuenta, la diferencia se imputa cuando
  la cambia (art. 14.2.e LIRPF) y el informe no puede saberlo: lo avisa en pantalla.
- **Sin tipo del día de la venta** (divisa que el BCE no publica, serie no disponible), la
  venta va a `unconverted`, en su divisa y fuera de los totales y de la cuota. **Sin tipo de
  alguna compra** (anterior a 1999), la ganancia sí se convierte pero no la diferencia de
  cambio (`fxIncomplete`).

**No modela** (el informe lo avisa en pantalla)

- Saldos negativos de los cuatro ejercicios anteriores (art. 49.1.b, último
  párrafo): un año con pérdida neta da cuota 0 y no se arrastra.
- Compensación cruzada del 25 % con rendimientos del capital mobiliario (la cartera
  no registra dividendos ni intereses).
- Regla de los dos meses (art. 33.5.f).
- Comisiones en una divisa distinta de la de la posición: se suponen en la divisa de la
  posición, como el resto de importes del lote.

## `savings-base.ts`

Integración y compensación de la base imponible del ahorro y cuota por la escala del
ahorro. Puro y sin texto: devuelve cifras y la traza de cada compensación.

- **Qué modela** (arts. 46, 48 y 49 LIRPF): dos grupos, ganancias y pérdidas
  patrimoniales por transmisión (art. 49.1.b) y rendimientos del capital mobiliario
  (art. 49.1.a). Un saldo negativo se compensa con el positivo del **otro** grupo con
  el límite del **25 %** de ese positivo (límite vigente desde 2018). Lo que no cabe
  queda pendiente **cuatro años** «en el mismo orden establecido en los párrafos
  anteriores» (art. 49.1): primero contra el positivo de su mismo grupo y después contra
  el del otro con el 25 %. Se compensa «en la cuantía máxima que permita cada uno de los
  ejercicios» (art. 49.2). Caducan los saldos con origen anterior a `ejercicio − 4`.
- **Orden aplicado** (interpretación): primero el saldo negativo del propio ejercicio
  contra el otro grupo; después los pendientes, del más antiguo al más reciente. El 25 %
  es único por grupo positivo (se calcula sobre su saldo positivo del ejercicio antes de
  compensar) y lo comparten el propio ejercicio y los arrastres. La compensación con el
  mismo grupo no tiene límite porcentual. El texto del art. 49 no fija un orden entre
  cruzar el saldo del propio ejercicio y aplicar los arrastres; se ha elegido el de la
  integración anual (primero el ejercicio). A igual año, GPP antes que RCM.
- `savingsTax(base)` aplica `IRPF_AHORRO` y devuelve cuota íntegra y tipo medio
  efectivo en % (`null` con base 0).
- **No modela**: la reducción del art. 55 LIRPF (remanente que reduce la base del
  ahorro, art. 50.2), deducciones ni rentas exentas. Los tests son de elaboración propia
  a partir del texto legal: no se encontraron ejemplos numéricos en el Manual práctico
  de Renta 2025 de la AEAT que reproducir.
- **Fuentes**: Ley 35/2006, arts. 46, 48, 49 y 50.2 (art. 49 en la redacción de la
  Ley 26/2014, de 27 de noviembre),
  https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764

## `double-taxation.ts`

Deducción por doble imposición internacional (art. 80 LIRPF) para dividendos del
extranjero. Puro: los avisos son códigos (`origin_unknown`, `no_treaty_rate`,
`excess_withholding`) con país e importe.

- **Qué modela**: deducción total = mín(a) impuesto satisfecho en el extranjero, b) tipo
  medio efectivo × renta gravada en el extranjero), art. 80.1. Por país, lo
  acreditable es mín(retención, tipo del convenio × íntegro); la retención por encima
  del convenio se devuelve como `excessReclaimable` (se reclama en origen, no se
  deduce en España). El tipo medio se redondea a dos decimales (art. 80.2).
- **Tabla `TREATY_DIVIDEND_RATES`**: tipo «General» de dividendos de la tabla de la DGT
  (actualización 01/01/2018), solo países con un único tipo sin nota al pie. No incluye
  la cláusula matriz-filial ni cambios de convenio posteriores a 2018. Revisar al
  cambiar de ejercicio.
- **Prudencia**: sin tipo confirmado en la tabla (país sin convenio o no verificado) no
  se deduce nada y se avisa. Con retención desconocida tampoco.
- **Simplificaciones**: el tipo medio efectivo del art. 80.2 es cuota líquida total /
  base liquidable; aquí se recibe el de la escala del ahorro (cuota íntegra / base,
  `savingsTax`), sin deducciones. El límite b) usa el íntegro de todas las rentas
  extranjeras, sin descontar gastos. No modela intereses, cánones ni ganancias del
  extranjero ni la devolución efectiva en origen.
- **Fuentes**: Ley 35/2006, art. 80,
  https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764 ; DGT, «Límites de imposición
  sobre dividendos, intereses y cánones resultantes de los CDI»,
  https://www.hacienda.gob.es/SGT/NormativaDoctrina/Tributaria/CDI/Documentacion/Limites_Imposicion_CDI.pdf
