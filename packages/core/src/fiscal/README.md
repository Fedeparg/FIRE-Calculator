# Motor fiscal (`packages/core/src/fiscal`)

Alcance, supuestos, fuentes y limitaciones de cada módulo. Todas las cifras son
**orientativas** y se refieren al ejercicio `FISCAL_YEAR` (`brackets.ts`). No es
asesoramiento fiscal.

## `brackets.ts`

Escalas oficiales, constantes del rendimiento del trabajo y motor de tramos
progresivos. Es la única fuente de verdad de los tipos impositivos.

- **Revisión anual**: `FISCAL_REVIEW_BY` marca cuándo revisar las cifras de
  `FISCAL_YEAR` (escalas, mínimos, Seguridad Social, `withholding-rates.ts`). Desde
  esa fecha falla un test de `brackets.test.ts`: es un recordatorio, no una caducidad.
- **Patrimonio, Donaciones y planes de pensiones**: el mínimo exento y la exención de
  la vivienda (Ley 19/1991), los umbrales y coeficientes por parentesco del ISD (Ley
  29/1987, art. 22.2) y el tope del 30 % de los planes (art. 52 LIRPF) también viven
  aquí; las calculadoras solo los importan.

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
emparejamiento FIFO de lotes (la cuota va aparte, en `savings-tax.ts`).
Lo consumen la simulación "¿qué pasaría si vendo?" y el informe de ganancias
realizadas (`realised-gains.ts`), con las mismas reglas.

**Modela**

- FIFO obligatorio para valores homogéneos: art. 37.2 Ley 35/2006 (valores
  cotizados) y art. 37.1.b (participaciones en IIC). No se elige lote ni coste medio.
- Valor de adquisición = importe + gastos y comisiones de compra (art. 35.1); las
  comisiones del lote se prorratean entre las participaciones vivas.
- Valor de transmisión = importe recibido − gastos y comisiones de venta (art. 35.2).
- **Ampliaciones liberadas** (art. 37.1.a LIRPF): el coste total de las acciones antiguas se
  reparte entre antiguas y nuevas, y las nuevas heredan la antigüedad de las antiguas. Una
  compra a **precio 0 y sin comisiones** se interpreta como acciones totalmente liberadas (así las
  importa Trade Republic, `BONUS_ISSUE`) y `walkLots` la reparte proporcionalmente entre los lotes
  vivos en ese momento (solo si el precio es un 0 de verdad: un precio no numérico, que se sanea
  a 0, queda como compra propia): cada lote gana títulos, conserva su coste total y su fecha (y su orden
  FIFO). Con ello la ganancia cuadra con el ejemplo del Manual práctico de Renta 2025 (Parte 1,
  págs. 885-887: 900 acciones de 2001 + 600 liberadas + 500 parcialmente liberadas de 2011; venta
  de 1.600 a 10 € → 6.000 + 500 = 6.500 €). Supuestos: las **parcialmente liberadas** (se paga algo)
  no se distinguen de una compra normal y siguen como compra; sin lotes vivos la compra a precio 0
  es una compra normal. Afecta también a `simulateSale` y `buildOpenLots`. Pendiente de la revisión
  del asesor fiscal: una compra manual a 0 (regalo, error de tecleo) también se reparte; la solución
  completa es un flag explícito de ampliación que escriba el importador. Fuente: Ley 35/2006,
  art. 37.1.a, https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764

**No modela** (resultado solo orientativo)

- Regla de los dos meses en la simulación de venta (`simulateSale` mira la venta aislada); sí la
  aplica el informe anual, vía `wash-sale.ts`.
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
- **Regla de los dos meses** (`wash-sale.ts`): la pérdida diferida no cuenta en el ejercicio de su
  venta (`deferred`, `eur.deferredLoss`) y sí en el de la venta definitiva de los recomprados
  (`integrated`, `eur.integratedLoss`); `gains`, `losses`, `net`, `total` y `tax` ya reflejan la regla
  (`computableGain = gain − deferredLoss + integratedLoss`). La pérdida se convierte a euros con el
  tipo del día de la venta que la originó y se integra por ese importe, no al tipo de la venta
  posterior (si esa venta no tiene tipo, se usa el de la que la integra). La diferencia de cambio
  no es una transmisión de valores y no se difiere. Los derivados (`isDerivative`) no se agrupan
  con una acción del mismo símbolo, pero sí están sujetos: los de la cartera son warrants y
  certificados con ISIN, valores negociables (DGT V1790-07); V2172-21 y V3755-16 solo excluyen
  contratos como opciones y futuros (que Sextante no distingue: limitación declarada). Una venta sin tipo del día
  (`unconverted`) queda fuera de los totales también en lo diferido.
- **Sin tipo del día de la venta** (divisa que el BCE no publica, serie no disponible), la
  venta va a `unconverted`, en su divisa y fuera de los totales y de la cuota. **Sin tipo de
  alguna compra** (anterior a 1999), la ganancia sí se convierte pero no la diferencia de
  cambio (`fxIncomplete`).

**No modela** (el informe lo avisa en pantalla)

- La compensación con rendimientos del capital mobiliario (25 %) y el arrastre de saldos
  negativos de los cuatro ejercicios anteriores no están aquí: los hace `savings-base.ts`
  sobre el saldo de este informe y los cobros (`savings-return.ts`).
- Comisiones en una divisa distinta de la de la posición: se suponen en la divisa de la
  posición, como el resto de importes del lote.

## `wash-sale.ts`

Regla de los dos meses (art. 33.5.f LIRPF): no se computan las pérdidas por transmitir valores
admitidos a negociación si el contribuyente adquiere valores homogéneos en los dos meses anteriores
o posteriores; la pérdida se integra a medida que se transmiten, de forma definitiva, los valores
recomprados. (Para valores no cotizados el plazo es de un año: fuera de alcance, todo se trata como
cotizado.) `computeWashSales(lots, walk?)` es pura, trabaja en la divisa de la posición y recibe el
histórico de un valor y su `walkLots(lots, { trackOpenLots: true })`; devuelve, por venta, la
pérdida diferida (`deferredLoss`, ≤ 0), los títulos bloqueados y lo que se integra (`integratedLoss`,
con su venta de origen).

**Criterios (interpretaciones)**

- **Ventana «de fecha a fecha»** (art. 5.1 Código Civil), con ambos extremos incluidos: venta 16/07 →
  del 16/05 al 16/09. Si el mes de destino no tiene ese día, el último del mes (31/12 + 2 meses →
  28/02). Una compra el día 16/09 bloquea; el 17/09, no. Misma regla hacia atrás (16/05 sí, 15/05 no).
- **Qué compras bloquean:** las de la ventana cuyos títulos siguen en cartera tras la venta (las
  anteriores) o que aún no existen (las posteriores). Los títulos vendidos en la propia operación no
  cuentan. Las ampliaciones liberadas no son compra. Un título comprado bloquea como mucho una vez.
- **Proporcionalidad:** se analiza cada trozo FIFO de la venta y solo los que dan pérdida; si se
  recompran menos títulos que los vendidos con pérdida, se difiere `pérdida × recomprados / vendidos
con pérdida`. Con varias ventas, se atienden por orden cronológico y cada una consume primero las
  compras más antiguas de su ventana.
- **Integración:** al vender títulos que bloquean una pérdida se libera la parte proporcional a lo
  vendido (FIFO). Solo se integra si esa transmisión es «definitiva» (Manual: «Una transmisión se
  considerará definitiva cuando, en los dos meses anteriores o posteriores a ella, no se adquieran
  nuevamente valores homogéneos»); si hay otra recompra, la parte proporcional pasa a los nuevos
  títulos conservando su venta de origen.
- **Derivados:** sujetos si son valores negociables (warrants, certificados, turbos con ISIN:
  V1790-07); no lo están los contratos como opciones y futuros (V2172-21, V3755-16). Sextante no
  distingue unos de otros y aplica la regla a todos: sus derivados importados son warrants y
  certificados de Trade Republic.
- **Fuentes:** Ley 35/2006, art. 33.5.f,
  https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764 ; AEAT, Manual práctico de Renta 2025,
  cap. 11 «Pérdidas patrimoniales que no se computan como tales»,
  https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c11-ganancias-perdidas-patrimoniales/ganancias-perdidas-patrimoniales-que-no-bi/perdidas-patrimoniales-que-no-se-tales.html
  (la caja de texto con las citas del Manual se verificó; el caso práctico T.S.A. (1.000 acciones,
  16/07/2025, 12.000 € frente a 16.800 €, recompra el 16/08/2025) se reproduce como test tal y
  como figura en el encargo, sin haber podido localizar su texto en esa página).

**No modela:** valores no cotizados (plazo de un año) ni distinguir valores homogéneos que no
comparten símbolo y divisa (p. ej. una misma empresa con dos cotizaciones).

## `income.ts`

Rendimientos del capital mobiliario del ejercicio (art. 25 LIRPF): dividendos, intereses y
recompensas del bróker (saveback, stockperk), con su íntegro y sus retenciones.

- **Recompensas como intereses:** Trade Republic las declara en la casilla de intereses de
  cuentas con retención del 19 % (sus informes fiscales de 2025, periodos alemán y español). Se
  sigue ese criterio; la compra en la que se invierten entra con su coste.
- **Ya en el borrador:** lo que el pagador comunicó a la AEAT (`reportedToAeat`) se separa de lo
  que hay que añadir a mano. En Trade Republic, todo lo posterior al cambio de custodia a su
  sucursal española, que retiene e informa con los modelos 187, 189, 193 y 196.
- **Divisa:** cada cobro se convierte con el tipo del BCE del día de cobro (`fx-reference.ts`).
- **Procedencia (`ValueSource`):** cada cifra dice de dónde sale: `broker` (tal cual en el
  fichero), `derived` (aritmética sobre él), `market` (dividendo por acción de mercado),
  `estimate` (tipo legal del país, sin confirmar) o `manual`. Una estimación nunca se presenta
  como exacta: la pantalla la marca y cuenta aparte.

## `dividend-resolution.ts`

Reparte un dividendo importado en íntegro, retención en origen y retención española, por capas.

1. **Bróker** (`resolveFromBroker`). El export de Trade Republic cambia de significado según el
   periodo y el emisor; se distingue por la razón `tax/amount` (verificado contra sus informes
   fiscales de 2025: periodo español exacto al céntimo):
   - antes de la sucursal española, `amount` es el íntegro y `tax` la retención en origen;
   - después, España retiene el 19 % de lo cobrado neto de origen. Si `tax/amount` ≈ 19 %, lo
     abonado llegó neto de origen y `tax` es solo la española (ASML); si ≈ origen + 19 % del
     resto, `amount` es el íntegro y `tax` suma ambas (EE. UU. con W-8BEN, 15 %).
   - **Base del 19 %:** el neto de la retención en origen. Lo fijan las consultas DGT V2505-10 y
     V2506-10 (con la resolución del TEAC de 25/09/2008), que sustituyen el criterio anterior de
     V1491-08 (íntegro); la AEAT lo explica igual en "Obtención de dividendos procedentes de otro
     país" y es lo que aplica Trade Republic.
   - Deshacer un neto con un tipo supuesto (Países Bajos 15 %) es una **estimación**.
2. **Mercado** (`resolveWithMarket`): acciones × dividendo por acción de mercado (Yahoo, sin el
   ajuste por splits posteriores), en la divisa de pago. Si coincide con lo abonado, el bróker dio
   el íntegro; si es mayor, la diferencia es la retención en origen, sea cual sea el país. Se
   compara en la divisa de pago y lo derivado se pasa a euros con el cambio implícito del bróker,
   para que íntegro, retenciones y neto cuadren. Se descarta un dato menor que lo abonado o que
   implique una retención superior al 40 %. Solo se usa la cotización en la divisa de pago.
3. **Estimación** (`estimateWithStatutoryRate`): sin dato de mercado, el tipo que retiene por
   ley el país, con su fuente, marcado como estimación.

**No modela:** retenciones en origen recuperadas después (devoluciones de Suiza, Alemania…), ni
dividendos de valores sin dato de mercado en la divisa de pago (quedan como estimación o sin
saber, con aviso).

## `countries.ts`

Registro único, por país (ISO 3166-1 alfa-2) y **en %**, de los tipos sobre dividendos: el del
convenio (`treatyPct`), la retención que aplica de hecho el país (`statutory`, con su fuente) y la
que aplica el bróker (`brokerAppliedPct`). `TREATY_DIVIDEND_RATES` (en %),
`STATUTORY_DIVIDEND_WITHHOLDING` y la tabla del bróker de `dividend-resolution.ts` (en tanto por
uno) son vistas de este registro, cada una con su unidad en el borde. También fija
`SPAIN_SAVINGS_WITHHOLDING_PCT` (19 %, art. 90 RIRPF), que usan la resolución de dividendos y el
valor por defecto de las calculadoras.

## `withholding-rates.ts`

Retención que aplica de hecho cada país a los dividendos de una persona física residente en
España. Solo sirve para **estimar** la retención en origen cuando faltan el dato del bróker y el de
mercado; lo que sale de aquí se marca como estimación y la pantalla lo avisa.

- Fuentes por país en `countries.ts`: IRS, AEAT, Vero, avisos de emisoras y, sobre todo, PwC
  Worldwide Tax Summaries (fuente secundaria: confianza media). Las autoridades fiscales de
  Alemania, Suiza, Países Bajos, Italia, Noruega, Canadá y Japón no se pudieron consultar.
- Fuera: Irlanda (25 % o 0 % con declaración de no residente) y Australia (30 % o 0 % según el
  dividendo esté "franked"): el tipo depende de un dato que no tenemos.
- Distinto del convenio (`double-taxation.ts`): lo retenido por encima del convenio no se deduce en
  España y se reclama en origen (Suiza 35 % → 15 %, Alemania 26,375 % → 15 %).

## `tax-boxes.ts`

Casillas del modelo 100 con las que se presenta cada cifra. Cambian cada ejercicio: un año sin
tabla verificada se muestra sin números de casilla, nunca con los de otro año.

- **2025:** Orden HAC/277/2026, de 25 de marzo (BOE-A-2026-7041), números leídos del formulario
  del propio modelo; las de capital mobiliario y la 0597 contrastadas con el Manual práctico de
  Renta 2025. Acciones por entidad emisora (0326-0340: valor de transmisión 0328 y de adquisición
  0331, importes globales por entidad); fondos y ETF no sujetos a retención (2224-2236); IIC con
  retención (0310-0325, cuando el depositario español retiene en el reembolso); otros elementos
  patrimoniales (1624-1654).
- **Derivados:** el modelo no los nombra. Van en otros elementos patrimoniales: la DGT manda los
  warrants a "otras ganancias y pérdidas patrimoniales" (V1790-07) y Trade Republic los pone ahí en
  su informe fiscal. La clave del bloque (4) es por exclusión: confianza baja.
- **Fondos y ETF:** las IIC del art. 75.3.j RIRPF (ETF) van en 2224-2236 aunque el depositario
  haya retenido: el título del bloque 0310-0325 las excluye expresamente.
- **Doble imposición:** solo el importe global (0588); el detalle por país no está en la Orden.

## `savings-base.ts`

Integración y compensación de la base imponible del ahorro. Puro y sin texto: devuelve cifras y la traza de cada compensación.

- **Qué modela** (arts. 46, 48 y 49 LIRPF): dos grupos, ganancias y pérdidas
  patrimoniales por transmisión (art. 49.1.b) y rendimientos del capital mobiliario
  (art. 49.1.a). Un saldo negativo se compensa con el positivo del **otro** grupo con
  el límite del **25 %** de ese positivo (límite vigente desde 2018). Lo que no cabe
  queda pendiente **cuatro años** «en el mismo orden establecido en los párrafos
  anteriores» (art. 49.1): primero contra el positivo de su mismo grupo y después contra
  el del otro con el 25 %. Se compensa «en la cuantía máxima que permita cada uno de los
  ejercicios» (art. 49.2). Caducan los saldos con origen anterior a `ejercicio − 4`.
- **Orden aplicado** (Manual práctico de Renta 2025, cap. 12 y su caso práctico): primero el
  saldo negativo del propio ejercicio contra el otro grupo; después todos los pendientes contra
  su mismo grupo (sin límite porcentual), del más antiguo al más reciente; y por último, con lo
  que les quede, contra el otro grupo. El 25 % es un único cupo por grupo positivo (sobre su saldo
  positivo del ejercicio antes de compensar), compartido por el propio ejercicio y los arrastres
  («límite conjunto», según el manual). El orden entre pendientes del mismo grupo de años
  distintos no lo fija ninguna fuente: el más antiguo primero, para que caduque lo menos posible.
- La cuota de la base resultante la calcula `savingsTax` (`savings-tax.ts`).
- **No modela**: la reducción del art. 55 LIRPF (remanente que reduce la base del
  ahorro, art. 50.2), deducciones ni rentas exentas. Un test reproduce el caso práctico del
  capítulo 12 del Manual práctico de Renta 2025 (base del ahorro de 200 €).
- **Fuentes**: Ley 35/2006, arts. 46, 48, 49 y 50.2 (art. 49 en la redacción de la
  Ley 26/2014, de 27 de noviembre),
  https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764

## `savings-tax.ts`

La única implementación de la cuota de la escala del ahorro (`IRPF_AHORRO`, arts. 66 y 76 LIRPF).

- `savingsTax(base)`: cuota íntegra y tipo medio efectivo en % (`null` con base 0). La usa la
  base del ahorro del informe de la Renta (`savings-return.ts`).
- `estimateSavingsTax(gain)`: la cuota de una ganancia aislada (una pérdida da 0), con el tipo
  medio y el marginal; se apoya en `savingsTax`. La usan el simulador de venta y el resumen de
  `realised-gains.ts`.

## `report-inputs.ts`

Entradas del informe fiscal que comparten la web, la API (`TaxReturnService`) y el MCP, para que
los tres canales lo monten igual: `toRealisedGainsPositions` reparte las operaciones entre sus
posiciones y `referenceRatesRequest` une los tipos del BCE que necesitan ventas y cobros.

## `double-taxation.ts`

> Contraste de 2026-10-03: la tabla de la DGT es de 2018. Japón está al 5 % (BOE-A-2021-2977).
> Irlanda, 0 %: el art. 10.1.c) de su convenio exime en origen al residente en España (el 15 % de
> la tabla es la letra b, régimen de crédito fiscal); lo retenido allí no se deduce en España y se
> reclama a Revenue (formulario V2A), principio de la consulta V0220-12. Dinamarca (sin convenio desde 2009) e Islas Caimán no tienen
> convenio: se acredita todo lo pagado, con el límite del tipo medio. El tipo medio que se usa es
> el de la escala del ahorro; el del art. 80.2 es cuota líquida total × (cuota íntegra del ahorro /
> cuota íntegra total) / base liquidable del ahorro (ejemplo del Manual de Renta 2025, cap. 18), que
> exige la base general, que Sextante no conoce.

Deducción por doble imposición internacional (art. 80 LIRPF) para dividendos del
extranjero. Puro: los avisos son códigos (`origin_unknown`, `no_treaty_rate`,
`excess_withholding`) con país e importe.

- **Qué modela**: deducción total = mín(a) impuesto satisfecho en el extranjero, b) tipo
  medio efectivo × renta gravada en el extranjero), art. 80.1. Por país, lo
  acreditable es mín(retención, tipo del convenio × íntegro); la retención por encima
  del convenio se devuelve como `excessReclaimable` (se reclama en origen, no se
  deduce en España). El tipo medio se redondea a dos decimales (art. 80.2).
- **Tabla `TREATY_DIVIDEND_RATES`** (vista de `countries.ts`): tipo «General» de dividendos de la tabla de la DGT
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
