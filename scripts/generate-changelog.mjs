#!/usr/bin/env node
// Genera `content/changelog/releases.json` a partir del histórico de git.
//
// POR QUÉ UN FICHERO GENERADO Y VERSIONADO, en vez de leer git en tiempo de build:
// `.dockerignore` excluye `.git` del contexto, así que la imagen de producción NO
// tiene histórico. Además, depender de git en el build ataría el contenido a cómo
// se haya clonado el repo (un clon superficial no tiene todos los commits).
//
// El fichero generado es la fuente que lee la página, y es EDITABLE: este script
// PRESERVA lo que ya haya escrito a mano (traducciones al inglés, resúmenes,
// destacados y entradas ocultas), casando por hash de commit. Es decir: se puede
// reejecutar sin perder el trabajo de curación.
//
//   node scripts/generate-changelog.mjs           # actualiza preservando lo curado
//   node scripts/generate-changelog.mjs --check    # falla si hay entregas sin traducir
//
// Convención: los mensajes de commit siguen conventional-commits en castellano
// (`feat(portfolio): …`). El tipo determina la categoría que pinta la página.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUTPUT = path.join(process.cwd(), 'content', 'changelog', 'releases.json');

/**
 * Tipos de conventional-commit que SÍ le importan a alguien que usa la web, y a
 * qué categoría de la interfaz corresponden. Lo que no está aquí (chore, docs,
 * test, refactor, ci…) es trabajo interno: se recoge igual, pero marcado como
 * `internal` para que la página pueda esconderlo tras un interruptor en vez de
 * enterrar las novedades de verdad entre fontanería.
 */
const CATEGORY_BY_TYPE = {
  feat: 'feature',
  fix: 'fix',
  perf: 'performance',
  release: 'milestone',
  seguridad: 'security',
};

/** Ámbitos que denotan seguridad aunque el tipo sea `fix`. */
const SECURITY_SCOPES = new Set(['seguridad', 'security', 'hardening', 'backup', 'docker']);

/** Commits de fontanería del repositorio que no aportan nada al lector. */
const INTERNAL_TYPES = new Set(['chore', 'docs', 'test', 'refactor', 'ci', 'build', 'style']);

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

/** Un commit del histórico, ya troceado. */
function parseCommit(line) {
  const [hash, date, subject] = line.split('\x1f');
  const match = /^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$/.exec(subject);
  if (!match) return { hash, date, type: null, scope: null, title: subject };
  return { hash, date, type: match[1].toLowerCase(), scope: match[2] ?? null, title: match[3] };
}

function categoryFor({ type, scope }) {
  if (scope && SECURITY_SCOPES.has(scope.toLowerCase()) && type === 'fix') return 'security';
  if (type && CATEGORY_BY_TYPE[type]) return CATEGORY_BY_TYPE[type];
  if (type && INTERNAL_TYPES.has(type)) return 'internal';
  return 'internal';
}

const commits = git([
  'log',
  '--no-merges',
  '--date=short',
  '--pretty=format:%H\x1f%ad\x1f%s',
  'main',
])
  .split('\n')
  .filter(Boolean)
  .map(parseCommit)
  // "Initial commit" no dice nada a nadie.
  .filter((c) => !/^initial commit$/i.test(c.title));

// Se agrupa por FECHA porque el despliegue es continuo: cada push a `main` que pasa
// CI llega a producción, así que "lo que se publicó ese día" es la unidad que el
// lector reconoce. No hay versiones semánticas que mostrar.
const byDate = new Map();
for (const commit of commits) {
  if (!byDate.has(commit.date)) byDate.set(commit.date, []);
  byDate.get(commit.date).push(commit);
}

/** Lo ya curado a mano, indexado por hash, para no perderlo al regenerar. */
const previous = fs.existsSync(OUTPUT)
  ? JSON.parse(fs.readFileSync(OUTPUT, 'utf8'))
  : { releases: [] };
const curatedEntries = new Map();
const curatedReleases = new Map();
for (const release of previous.releases ?? []) {
  curatedReleases.set(release.date, release);
  for (const entry of release.entries ?? []) curatedEntries.set(entry.hash, entry);
}

const releases = [...byDate.entries()]
  .sort((a, b) => (a[0] < b[0] ? 1 : -1))
  .map(([date, items]) => {
    const previousRelease = curatedReleases.get(date) ?? {};
    return {
      date,
      // Titular y resumen de la entrega: se escriben a mano (el script no inventa
      // prosa). Quedan vacíos hasta que alguien los rellene, y `--check` avisa.
      title: previousRelease.title ?? { es: '', en: '' },
      summary: previousRelease.summary ?? { es: '', en: '' },
      highlight: previousRelease.highlight ?? false,
      entries: items.map((commit) => {
        // OJO: el índice se construye con los hashes YA ACORTADOS que guarda el
        // fichero (8 caracteres), mientras que `git log %H` entrega los 40. Buscar
        // con el hash largo no casaba nunca, y como el resultado alimenta los
        // valores por defecto, una regeneración se llevaba por delante todas las
        // traducciones y categorías curadas a mano. Se acorta antes de buscar.
        const curated = curatedEntries.get(commit.hash.slice(0, 8)) ?? {};
        return {
          hash: commit.hash.slice(0, 8),
          type: commit.type,
          scope: commit.scope,
          category: curated.category ?? categoryFor(commit),
          // `es` sale del mensaje de commit; `en` se traduce a mano una sola vez.
          text: {
            es: curated.text?.es ?? commit.title,
            en: curated.text?.en ?? '',
          },
          hidden: curated.hidden ?? false,
        };
      }),
    };
  });

const output = { generatedFrom: 'git log main', releases };

if (process.argv.includes('--check')) {
  const missing = [];
  for (const release of releases) {
    if (!release.title.es || !release.title.en) missing.push(`${release.date}: falta el título`);
    for (const entry of release.entries) {
      if (!entry.hidden && !entry.text.en) missing.push(`${release.date} ${entry.hash}: falta la traducción al inglés`);
    }
  }
  if (missing.length) {
    console.error('Changelog incompleto:\n  ' + missing.join('\n  '));
    process.exit(1);
  }
  console.log(`Changelog completo: ${releases.length} entregas, ${commits.length} cambios.`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + '\n');
console.log(
  `Escrito ${path.relative(process.cwd(), OUTPUT)}: ${releases.length} entregas, ${commits.length} cambios.`,
);
