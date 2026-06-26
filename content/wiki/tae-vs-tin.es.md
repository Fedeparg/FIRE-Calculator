---
title: "TAE vs TIN (y APY): cómo comparar de verdad un producto financiero"
description: "El TIN es el tipo puro; la TAE incluye comisiones y la frecuencia de capitalización. Te explicamos ambos con ejemplos y por qué la TAE es la cifra que debes comparar entre bancos."
level: basico
keywords:
  - TAE
  - TIN
  - APY
  - capitalizacion
  - comparar
---

# TAE vs TIN (y APY)

Cuando contratas un depósito, una cuenta remunerada, una hipoteca o un préstamo,
verás dos porcentajes que parecen lo mismo pero **no lo son**: el **TIN** y la
**TAE**. Saber distinguirlos es lo que te permite comparar ofertas sin que te
engañen con un número bonito.

## TIN: el tipo de interés nominal

El **TIN (Tipo de Interés Nominal)** es el tipo "puro" del producto: el
porcentaje que se aplica al capital para calcular los intereses. **No incluye
comisiones, gastos ni la frecuencia con la que se pagan los intereses.** Es útil
para calcular cuotas o intereses, pero **no sirve para comparar** productos entre
sí, porque dos ofertas con el mismo TIN pueden costar (o rendir) cosas distintas.

## TAE: la tasa anual equivalente

La **TAE (Tasa Anual Equivalente)** es el coste o rendimiento **real anual** del
producto. Incluye:

- El **TIN**.
- Las **comisiones** y algunos gastos asociados.
- La **frecuencia de capitalización**, es decir, cada cuánto se pagan o se suman
  los intereses (mensual, trimestral, anual…).

Por eso la TAE es **el número que debes usar para comparar** productos del mismo
tipo entre distintos bancos. Y por construcción, en un depósito la TAE suele ser
algo **mayor** que el TIN (porque capitaliza), mientras que en un préstamo la TAE
es **mayor** que el TIN por culpa de las comisiones.

## Por qué la frecuencia de capitalización cambia el resultado

Imagina un depósito con un **TIN del 3 %**. Si los intereses se pagan **una vez
al año**, la TAE es justo 3 %. Pero si se pagan **cada mes** y se reinvierten, la
TAE sube un poco, porque empiezas a ganar intereses sobre los intereses:

```
TAE = (1 + TIN / m) ^ m − 1
```

donde **m** es el número de veces que se capitaliza al año. Con TIN 3 % y pago
mensual (m = 12):

> TAE = (1 + 0,03 / 12)¹² − 1 ≈ **3,04 %**

La diferencia es pequeña con tipos bajos, pero crece con tipos altos.

## ¿Y el APY? Es la TAE "a la americana"

Si lees blogs o productos internacionales (sobre todo de cripto o bancos
estadounidenses), verás el término **APY (Annual Percentage Yield)**. Es
exactamente el mismo concepto que la TAE de un producto de **ahorro**: el
rendimiento anual **ya con la capitalización incluida**. Su equivalente para
préstamos es el **APR**, parecido al TIN. En resumen: **APY ≈ TAE de ahorro** y
**APR ≈ TIN/TAE de préstamo**.

## Tabla rápida

| Concepto | ¿Incluye comisiones? | ¿Incluye capitalización? | ¿Para qué sirve? |
|----------|----------------------|--------------------------|------------------|
| **TIN**  | No                   | No                       | Calcular la cuota o el interés |
| **TAE**  | Sí                   | Sí                       | Comparar productos entre sí |
| **APY**  | (ahorro)             | Sí                       | Equivalente anglosajón de la TAE de ahorro |

## Lo que la TAE NO te cuenta en una hipoteca

La TAE es la mejor cifra para comparar, pero tiene un punto ciego importante: en
una **hipoteca variable**, la TAE que figura en la oferta se calcula **suponiendo
que el euríbor no cambia** durante toda la vida del préstamo. Es una foto fija de
un tipo que se moverá. Por eso, entre una fija y una variable, comparar solo las
TAE del primer año puede llevarte a una conclusión equivocada. Mira también el
**diferencial**, las vinculaciones (seguros, tarjetas) y qué pasa si suben los
tipos.

## Errores comunes

- **Comparar un depósito por TIN** cuando uno paga mensual y otro al vencimiento:
  rinden distinto pese al mismo TIN.
- **Fijarse en el TIN bajo de un préstamo** e ignorar comisiones de apertura o de
  estudio que la TAE sí recoge.
- **Tomar un "X % APY" de cripto como si fuera una TAE garantizada.** El concepto
  de cálculo es el mismo; el **riesgo** detrás, no.

Ante dos ofertas del mismo tipo, gana casi siempre la de **mejor TAE**, no la del
TIN más vistoso.
