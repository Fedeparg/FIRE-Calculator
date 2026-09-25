---
title: "Cómo funciona el simulador FIRE Monte Carlo"
---

La [calculadora FIRE](/calculadoras/independencia-financiera) supone que el mercado da **exactamente la misma rentabilidad cada año**. La realidad no es así: hay años del +25 % y años del −30 %, y **el orden en que llegan importa**. Este simulador responde a la pregunta que de verdad interesa: **¿con qué probabilidad llego a FIRE y el dinero me dura toda la jubilación?**

**Qué es un Monte Carlo.** En lugar de calcular un único futuro, se simulan **5.000 vidas financieras**. Cada una sigue una secuencia aleatoria de rentabilidades anuales con la media y la volatilidad que indiques. Después se cuenta cuántas salen bien. Cada vida pasa por dos fases:

1. **Acumulación.** Tu patrimonio crece con la rentabilidad del año y tu ahorro hasta alcanzar el número FIRE (gasto anual ÷ tasa de retiro).
2. **Retiro.** A partir de ahí dejas de aportar y retiras tu gasto anual durante los años de retiro que hayas elegido. Si en algún momento no llega para cubrir un año, esa vida fracasa.

**Cómo leer los resultados.**

- **Probabilidad de éxito**: vidas que llegan a FIRE y no se quedan sin dinero, sobre el total. Un 85 % significa que en 15 de cada 100 escenarios algo sale mal, bien porque no llegas o bien porque el dinero se acaba antes de tiempo.
- **Años hasta FIRE**: el valor mediano y el rango en el que cae el 80 % central de los escenarios.
- **El abanico** muestra cómo evoluciona tu patrimonio. La banda clara recoge el 80 % de los escenarios; la oscura, el 50 % central.

**Ejemplo trabajado** (valores por defecto). Con 24.000 € de gasto anual, 20.000 € invertidos, 800 €/mes de ahorro, un 5 % de rentabilidad real media, una volatilidad del 15 %, retiro del 4 % y 40 años de jubilación:

- Sin volatilidad llegarías en **28 años**, y con un 5 % constante el dinero no se acabaría nunca.
- Con volatilidad, la mediana pasa a **29 años** (entre 21 y 41 en el 80 % central) y la probabilidad de éxito baja a **alrededor del 71 %**.

**Por qué la volatilidad empeora el resultado aunque la media sea la misma.** Perder un 20 % y ganar después un 20 % no te deja igual: te deja en un 96 %. Cuanto más oscila la rentabilidad, más crece la cartera típica por debajo de la media (es el *arrastre de la volatilidad*). Además está el [**riesgo de secuencia**](/aprende/riesgo-secuencia-retornos): una caída fuerte justo al empezar a retirar obliga a vender barato, y esa parte de la cartera ya no se recupera cuando el mercado rebota.

**[La regla del 4 %](/aprende/regla-del-4).** Viene del *estudio Trinity* (1998), que comprobó con datos históricos de EE. UU. que retirar un 4 % el primer año, ajustado por inflación, aguantaba 30 años en la gran mayoría de los periodos. Para jubilaciones más largas, como las de FIRE, conviene bajar la tasa de retiro o aceptar más riesgo. Prueba con 50 años de retiro y un 3,5 % para verlo.

**Limitaciones del modelo.**

- Las rentabilidades de cada año son **independientes** entre sí y siguen una distribución lognormal. Los mercados reales tienen rachas y crisis concretas que este modelo no reproduce.
- Todo está en **euros de hoy** (términos reales), así que la rentabilidad que introduzcas debe estar descontada la inflación.
- No incluye **impuestos ni comisiones**. Al vender para retirar dinero, la plusvalía tributa en la base del ahorro. Si quieres un margen, baja la rentabilidad.
- El gasto es fijo. En la vida real puedes ajustarlo en los años malos, y eso mejora mucho la probabilidad de éxito.
- Los escenarios usan una semilla fija, así que los mismos datos dan siempre el mismo resultado.

Es una herramienta para entender el riesgo, no una predicción ni un consejo de inversión.
