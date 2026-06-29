-- Migración de DATOS (no de esquema): purga las resoluciones cripto mal cacheadas.
--
-- Antes, un ticker cripto suelto (p. ej. "BTC") se resolvía al PRIMER valor que cotizara en
-- Yahoo, que resulta ser un ETF real (~26 US$), no la cripto (~60 000 US$). Esas filas
-- erróneas quedaron cacheadas en `instruments` y, al ser cache-first, el resolver nunca las
-- reintenta. Las borramos para que el próximo refresco las re-resuelva con la nueva red de
-- seguridad cripto (ticker conocido -> "<T>-USD"). Solo toca las que NO apuntan ya al par
-- correcto: las bien resueltas se quedan intactas.
DELETE FROM "instruments"
WHERE "query" IN (
  'BTC','ETH','USDT','BNB','SOL','XRP','USDC','ADA','AVAX','DOGE',
  'DOT','TRX','LINK','MATIC','TON','SHIB','LTC','BCH','XLM','ATOM',
  'XMR','ETC','NEAR','ALGO','FIL','ICP','APT','ARB','OP','UNI'
)
AND ("symbol" IS DISTINCT FROM "query" || '-USD');
