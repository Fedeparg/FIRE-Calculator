---
title: "Simulaciones Monte Carlo para FIRE: qué significa una probabilidad de éxito"
description: "Por qué un plan de independencia financiera se mide mejor en probabilidades que con una fecha, cómo leer un 85 % de éxito, la diferencia entre el modelo aleatorio y el histórico, y cómo usar la tabla de tasas de retiro."
level: avanzado
keywords:
  - monte carlo
  - probabilidad de exito
  - FIRE
  - datos historicos
  - tasa de retiro
  - bootstrap
---

# Simulaciones Monte Carlo: pensar tu plan en probabilidades

Una calculadora con rentabilidad fija te da **una fecha**: "llegas en 24 años". El
mercado no va a darte esa rentabilidad todos los años, y el **orden** de los años
buenos y malos cambia el resultado (es el [riesgo de
secuencia](/aprende/riesgo-secuencia-retornos)). Una simulación Monte Carlo ensaya
**miles de futuros posibles** y cuenta en cuántos sale bien.

## Cómo leer una probabilidad de éxito

En el [simulador](/calculadoras/simulador-montecarlo), una vida "sale bien" si
**llega al objetivo** y después el dinero **aguanta todos los años de retiro** que
hayas elegido.

- Un **85 %** no significa "casi seguro": en 15 de cada 100 futuros algo falla.
- Un **100 %** tampoco es una garantía: solo dice que ninguno de los futuros
  simulados falló con esos supuestos.
- Más útil que la cifra exacta es **cómo cambia** cuando tocas una palanca: ahorrar
  más, retirar menos, jubilarte un año más tarde.

Muchos planes FIRE apuntan a un 85-95 % y lo complementan con **flexibilidad**:
gastar algo menos en los años malos sube mucho la probabilidad real (ver
[estrategias de retirada dinámicas](/aprende/estrategias-retirada-dinamicas)).

## Dos formas de imaginar el futuro

**Modelo aleatorio.** Cada año se sortea una rentabilidad con la **media** y la
**volatilidad** que indiques. Es flexible (puedes modelar cualquier cartera) pero
trata cada año como independiente: no reproduce rachas como tres años seguidos de
caídas.

**Modelo histórico.** En lugar de sortear, se encadenan **tramos de 10 años reales**
del mercado de EE. UU. desde 1871 (datos de Robert J. Shiller), empezando cada tramo
en un año al azar. Así aparecen 1929-1932, la estanflación de 1973-1974 o 2008 **tal
como ocurrieron**, con sus rachas. Eliges qué parte va en acciones y el resto va en
bonos del Tesoro a 10 años, reequilibrando cada año.

Con los valores por defecto del simulador (24.000 € de gasto, 20.000 € invertidos,
800 €/mes, retiro del 4 % y 40 años de jubilación), el modelo aleatorio con un 5 %
real y un 15 % de volatilidad da **alrededor de un 70 %** de éxito, y el histórico
con una cartera 60/40 **alrededor de un 90 %**. La diferencia no es magia: la mezcla
60/40 en EE. UU. ha rendido de media algo más de un 6 % real, por encima del 5 %
prudente del modelo aleatorio.

**La trampa del histórico**: EE. UU. ha sido uno de los mejores mercados del mundo en
el último siglo y medio. Otros, como Japón desde 1990, lo pasaron mucho peor. Usa el
histórico para ver cómo se comporta tu plan ante **crisis reales**, no como promesa de
rentabilidad.

## La tabla de tasas de retiro

Debajo del abanico, el simulador muestra la probabilidad de éxito con tasas de
retiro del 3 % al 5 %, con el resto de datos iguales y **los mismos futuros
simulados**. Una tasa más alta baja el objetivo (llegas antes) pero exige más a la
cartera durante el retiro. Con los valores por defecto, pasar del 4 % al 3 % sube el
éxito de un 70 % a un 86 %: es la palanca más potente para jubilaciones largas (ver
[la regla del 4 %](/aprende/regla-del-4)).

## Sobre tu cartera real

En la [cartera](/portfolio), el bloque **Tu objetivo de independencia financiera**
hace la misma simulación **partiendo del valor real de tus inversiones**: no tienes
que teclear tu patrimonio. Guardas la volatilidad y los años de retiro con el
objetivo, y un enlace abre el simulador con los mismos datos para jugar con el
modelo histórico o la tabla.

## Lo que ninguna simulación sabe

- Todo va en **euros de hoy**: la rentabilidad que pongas debe estar descontada la
  inflación.
- No hay **impuestos ni comisiones**: si quieres margen, baja la rentabilidad.
- El gasto es **fijo** y no hay pensión pública ni ingresos extra.
- Los escenarios usan una **semilla fija**: los mismos datos dan siempre el mismo
  resultado, lo que permite comparar cambios sin ruido.

---

*Información educativa, no asesoramiento financiero. Las simulaciones describen
supuestos, no predicen el futuro.*
