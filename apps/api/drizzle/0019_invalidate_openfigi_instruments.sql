-- Migración de DATOS (no de esquema): purga las resoluciones ISIN → símbolo que vinieron de OpenFIGI.
--
-- Antes, el fallback de OpenFIGI probaba los tickers del ISIN con TODOS los sufijos europeos,
-- aunque OpenFIGI no listara el valor en esa bolsa, y aceptaba el primero que cotizara. Así
-- US0231351067 (Amazon) acabó en `AMZN.AS`, un ETP sobre Amazon a ~7 € en Ámsterdam. Ahora cada
-- ticker solo se prueba con el sufijo de la bolsa donde OpenFIGI lo lista. Como la caché es
-- permanente y cache-first, se borran todas las filas de ese origen (no se puede saber cuáles
-- eran erróneas sin consultar fuera) para que el arranque las re-resuelva. Es una caché global:
-- no toca posiciones, lotes ni snapshots de ningún usuario.
DELETE FROM "instruments" WHERE "source" = 'openfigi';
