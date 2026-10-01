// Fuera de los componentes "use client" a propósito: un servidor que importa un valor de un
// módulo de cliente recibe una referencia de cliente, no el string.

/** Parámetro con el que "Añadir posición" (cabecera de la cartera) abre el alta en Posiciones. */
export const ADD_POSITION_PARAM = "nueva";

/** Enlace que abre el panel de alta de una posición. */
export const ADD_POSITION_HREF = `/portfolio/posiciones?${ADD_POSITION_PARAM}=1`;
