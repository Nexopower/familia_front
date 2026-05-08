import fs from 'node:fs/promises';
import path from 'node:path';

import {
  RBAC_MANIFEST_VERSION,
  modules,
  modulePermissions,
  permissions,
} from './rbac.manifest.config.mjs';

function sortByKey(list, key) {
  return [...list].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
}

function uniq(list) {
  return Array.from(new Set(list));
}

function parseArgs(argv) {
  const args = { out: null, router: 'src/router.ts' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') {
      args.out = argv[i + 1] ?? null;
      i++;
    } else if (a === '--router') {
      args.router = argv[i + 1] ?? args.router;
      i++;
    }
  }
  return args;
}

function normalizeKey(key) {
  return String(key ?? '').trim().toUpperCase();
}

function validateConfig() {
  const moduleKeys = new Set(modules.map((m) => normalizeKey(m.key)));

  const permissionKeys = new Set(permissions.map((p) => String(p.clave).trim()));
  if (permissionKeys.size !== permissions.length) {
    throw new Error('Config inválida: hay claves de permiso duplicadas');
  }

  for (const [modKey, perms] of Object.entries(modulePermissions)) {
    if (!moduleKeys.has(normalizeKey(modKey))) {
      throw new Error(`Config inválida: módulo '${modKey}' no existe en modules`);
    }
    for (const permiso of perms) {
      if (!permissionKeys.has(String(permiso).trim())) {
        throw new Error(
          `Config inválida: permiso '${permiso}' (módulo ${modKey}) no existe en permissions`,
        );
      }
    }
  }
}

async function detectModuleKeysFromRouter(routerPath) {
  try {
    const content = await fs.readFile(routerPath, 'utf8');
    const re = /moduleKey\s*:\s*['\"]([A-Za-z0-9_]+)['\"]/g;
    const keys = [];
    for (;;) {
      const match = re.exec(content);
      if (!match) break;
      keys.push(normalizeKey(match[1]));
    }
    return uniq(keys);
  } catch {
    return [];
  }
}

async function main() {
  const args = parseArgs(process.argv);

  const projectRoot = process.cwd();
  const outPath = path.resolve(projectRoot, args.out ?? 'rbac.manifest.json');
  const routerPath = path.resolve(projectRoot, args.router);

  validateConfig();

  const routerModuleKeys = await detectModuleKeysFromRouter(routerPath);
  if (routerModuleKeys.length) {
    const known = new Set(modules.map((m) => normalizeKey(m.key)));
    const missing = routerModuleKeys.filter((k) => !known.has(k));
    if (missing.length) {
      throw new Error(
        `El router usa moduleKeys no declarados en manifest config: ${missing.join(', ')}`,
      );
    }
  }

  const manifest = {
    version: RBAC_MANIFEST_VERSION,
    generatedAt: new Date().toISOString(),
    modules: sortByKey(modules, 'key').map((m) => ({
      key: normalizeKey(m.key),
      nombre: String(m.nombre).trim(),
    })),
    modulePermissions: Object.fromEntries(
      Object.entries(modulePermissions)
        .map(([k, v]) => [normalizeKey(k), uniq(v.map((x) => String(x).trim()))])
        .sort((a, b) => a[0].localeCompare(b[0])),
    ),
    permissions: sortByKey(permissions, 'clave').map((p) => ({
      clave: String(p.clave).trim(),
      nombre: String(p.nombre).trim(),
      detalle: p.detalle ?? null,
      moduloKey: normalizeKey(p.moduloKey),
    })),
  };

  await fs.writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  process.stdout.write(`OK: manifest generado en ${outPath}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err?.message ?? String(err)}\n`);
  process.exitCode = 1;
});
