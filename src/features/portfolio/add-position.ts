// Kept outside "use client" modules: a server that imports from them gets a reference, not the string.

export const ADD_POSITION_PARAM = "nueva";

export const ADD_POSITION_HREF = `/portfolio/posiciones?${ADD_POSITION_PARAM}=1`;
