#!/usr/bin/env node
/**
 * afocat-migrate MCP server
 * Tools:
 *   - php_lint        : `php -l` sobre archivo o carpeta (recursivo)
 *   - deprecation_scan: aplica knowledge/deprecation-rules.json a archivo/carpeta
 *   - db_schema       : introspeccion MySQL db_afocat (tablas, columnas, tablas dinamicas __SERIE_ANIO)
 *   - ftp_deploy      : sube archivo migrado al server prod via FTP/FTPS
 *
 * Config por variables de entorno (ver .env.example). Secretos NUNCA en codigo ni plugin.json.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Config ---
const PHP_BIN = process.env.AFOCAT_PHP_BIN || "php";
// Por defecto: la carpeta desde donde se lanzo Claude Code (el proyecto actual).
// Override explicito con AFOCAT_PROJECT_ROOT si se quiere apuntar a otra carpeta.
const PROJECT_ROOT = process.env.AFOCAT_PROJECT_ROOT || process.cwd();
const OCREND_INI =
  process.env.AFOCAT_OCREND_INI ||
  path.join(PROJECT_ROOT, "Ocrend", "Kernel", "Config", "Ocrend.ini.yml");
const RULES_PATH = path.join(__dirname, "..", "..", "knowledge", "deprecation-rules.json");

// --- Helpers ---
// Carpetas que nunca aportan codigo a migrar: deps + cache de Twig compilado.
// Sin excluir .cache el scan se infla ~2.5x con templates compilados Twig 2
// (que Twig 3 ni siquiera carga). Override: includeAll=true.
const SKIP_DIRS = ["vendor", "node_modules", ".git", ".cache"];
// Backups manuales tipo "Archivo (1).php", "Archivo (2).php" (FileZilla / copia-pega).
// Duplican findings y nunca son el archivo vivo.
const DUP_FILE_RE = / \(\d+\)\.php$/;

async function collectPhpFiles(target, opts = {}) {
  const { includeAll = false } = opts;
  const st = await stat(target);
  if (st.isFile()) return [target];
  const out = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!includeAll && SKIP_DIRS.includes(entry.name)) continue;
        await walk(full);
      } else if (entry.name.endsWith(".php")) {
        if (!includeAll && DUP_FILE_RE.test(entry.name)) continue;
        out.push(full);
      }
    }
  }
  await walk(target);
  return out;
}

function resolveTarget(p) {
  if (!p) return PROJECT_ROOT;
  return path.isAbsolute(p) ? p : path.join(PROJECT_ROOT, p);
}

// --- Tool implementations ---
async function phpLint(args) {
  const target = resolveTarget(args.path);
  const files = await collectPhpFiles(target, { includeAll: !!args.include_all });
  const results = [];
  for (const f of files) {
    try {
      const { stdout } = await execFileAsync(PHP_BIN, ["-l", f]);
      if (!/No syntax errors detected/.test(stdout)) {
        results.push({ file: f, ok: false, output: stdout.trim() });
      }
    } catch (e) {
      results.push({
        file: f,
        ok: false,
        output: ((e.stdout || "") + (e.stderr || "")).trim() || String(e),
      });
    }
  }
  const failed = results.filter((r) => !r.ok);
  return {
    scanned: files.length,
    failed: failed.length,
    errors: failed,
    summary:
      failed.length === 0
        ? `OK: ${files.length} archivo(s) sin errores de sintaxis`
        : `${failed.length}/${files.length} con errores`,
  };
}

async function deprecationScan(args) {
  const ruleset = JSON.parse(await readFile(RULES_PATH, "utf8"));
  const allRules = [
    ...ruleset.rules,
    ...(args.include_security ? ruleset.security_rules || [] : []),
  ];
  const compiled = allRules.map((r) => ({
    ...r,
    re: new RegExp(r.regex, "g"),
  }));

  const target = resolveTarget(args.path);
  const files = await collectPhpFiles(target, { includeAll: !!args.include_all });
  const minSev = args.severity || null; // fatal|warning|info|high|medium
  const sevOrder = { fatal: 4, high: 4, warning: 3, medium: 2, info: 1, low: 1 };

  const findings = [];
  for (const f of files) {
    const content = await readFile(f, "utf8");
    const lines = content.split(/\r?\n/);
    for (const rule of compiled) {
      if (minSev && (sevOrder[rule.severity] || 0) < (sevOrder[minSev] || 0))
        continue;
      lines.forEach((line, idx) => {
        rule.re.lastIndex = 0;
        if (rule.re.test(line)) {
          findings.push({
            file: f,
            line: idx + 1,
            id: rule.id,
            severity: rule.severity,
            message: rule.message,
            fix: rule.fix,
            auto_fixable: !!rule.auto_fixable,
            playbook: rule.playbook || null,
            snippet: line.trim().slice(0, 160),
          });
        }
      });
    }
  }
  const bySev = {};
  for (const fnd of findings) bySev[fnd.severity] = (bySev[fnd.severity] || 0) + 1;
  return {
    scanned: files.length,
    total_findings: findings.length,
    by_severity: bySev,
    findings: findings.slice(0, args.limit || 500),
    truncated: findings.length > (args.limit || 500),
  };
}

async function loadDbConfig() {
  const { parse } = await import("yaml");
  const raw = await readFile(OCREND_INI, "utf8");
  const cfg = parse(raw);
  const db = cfg.database || cfg.Database || {};
  return {
    host: db.host || "localhost",
    user: db.user,
    password: db.pass ?? db.password,
    database: db.name,
    port: Number(db.port) || 3306,
  };
}

async function dbSchema(args) {
  const mysql = (await import("mysql2/promise")).default;
  const conf = await loadDbConfig();
  const conn = await mysql.createConnection(conf);
  try {
    if (args.table) {
      const [cols] = await conn.query(
        "SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION",
        [conf.database, args.table]
      );
      return { table: args.table, columns: cols };
    }
    const [tables] = await conn.query(
      "SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME",
      [conf.database]
    );
    const names = tables.map((t) => t.TABLE_NAME);
    const dynamic = names.filter((n) => /^__[A-Z]{2}_\d{4}$|^__\w+_\d{4}$/.test(n));
    return {
      database: conf.database,
      total_tables: names.length,
      dynamic_cert_tables: dynamic,
      tables: args.verbose ? tables : names,
    };
  } finally {
    await conn.end();
  }
}

async function ftpDeploy(args) {
  const ftp = await import("basic-ftp");
  const host = process.env.AFOCAT_FTP_HOST;
  const user = process.env.AFOCAT_FTP_USER;
  const password = process.env.AFOCAT_FTP_PASS;
  const remoteRoot = process.env.AFOCAT_FTP_REMOTE_ROOT || "/";
  const secure = String(process.env.AFOCAT_FTP_SECURE || "false") === "true";

  if (!host || !user || !password) {
    throw new Error(
      "Faltan credenciales FTP. Definir AFOCAT_FTP_HOST/USER/PASS en .env (NO commitear)."
    );
  }
  const localPath = resolveTarget(args.local_path);
  const remotePath = args.remote_path
    ? args.remote_path
    : remoteRoot.replace(/\/$/, "") +
      "/" +
      path.relative(PROJECT_ROOT, localPath).split(path.sep).join("/");

  if (args.dry_run) {
    return {
      dry_run: true,
      would_upload: localPath,
      to: remotePath,
      host,
      secure,
    };
  }

  const client = new ftp.Client(15000);
  try {
    await client.access({ host, user, password, secure });
    const remoteDir = remotePath.substring(0, remotePath.lastIndexOf("/"));
    if (remoteDir) await client.ensureDir(remoteDir);
    await client.uploadFrom(localPath, remotePath);
    return { uploaded: localPath, to: remotePath, host };
  } finally {
    client.close();
  }
}

// --- Server wiring ---
const TOOLS = [
  {
    name: "php_lint",
    description:
      "Corre `php -l` sobre un archivo o carpeta (recursivo, ignora vendor/node_modules/.git/.cache y backups '* (N).php'). Devuelve solo los que fallan.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Ruta absoluta o relativa a AFOCAT_PROJECT_ROOT. Si se omite, escanea todo el proyecto.",
        },
        include_all: {
          type: "boolean",
          description:
            "Incluir tambien vendor/node_modules/.git/.cache y backups '* (N).php' (default false).",
        },
      },
    },
  },
  {
    name: "deprecation_scan",
    description:
      "Escanea patrones de incompatibilidad PHP 8.x (knowledge/deprecation-rules.json) en archivo/carpeta. Ignora vendor/node_modules/.git/.cache y backups '* (N).php'. Devuelve file:line, regla, severidad y fix.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Archivo o carpeta (rel a project root o absoluta)" },
        include_all: {
          type: "boolean",
          description:
            "Incluir tambien vendor/node_modules/.git/.cache y backups '* (N).php' (default false).",
        },
        severity: {
          type: "string",
          enum: ["fatal", "warning", "info", "high", "medium"],
          description: "Filtro: severidad minima a reportar",
        },
        include_security: {
          type: "boolean",
          description: "Incluir tambien security_rules (SQLi, XSS, hashes debiles, eval, unserialize)",
        },
        limit: { type: "number", description: "Max findings (default 500)" },
      },
    },
  },
  {
    name: "db_schema",
    description:
      "Introspeccion de MySQL db_afocat (credenciales leidas de Ocrend.ini.yml). Sin args: lista tablas + detecta tablas dinamicas __SERIE_ANIO. Con `table`: columnas de esa tabla.",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string", description: "Nombre de tabla para ver columnas" },
        verbose: { type: "boolean", description: "Incluir TABLE_ROWS en el listado" },
      },
    },
  },
  {
    name: "ftp_deploy",
    description:
      "Sube un archivo migrado al server prod via FTP/FTPS. Credenciales de .env. Usa dry_run:true para previsualizar la ruta remota sin subir.",
    inputSchema: {
      type: "object",
      properties: {
        local_path: { type: "string", description: "Archivo local a subir (rel a project root o absoluta)" },
        remote_path: {
          type: "string",
          description:
            "Ruta remota completa. Si se omite, se deriva de AFOCAT_FTP_REMOTE_ROOT + ruta relativa al project root.",
        },
        dry_run: { type: "boolean", description: "Solo mostrar que se subiria y a donde" },
      },
      required: ["local_path"],
    },
  },
];

const server = new Server(
  { name: "afocat-migrate", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    let result;
    switch (name) {
      case "php_lint":
        result = await phpLint(args);
        break;
      case "deprecation_scan":
        result = await deprecationScan(args);
        break;
      case "db_schema":
        result = await dbSchema(args);
        break;
      case "ftp_deploy":
        result = await ftpDeploy(args);
        break;
      default:
        throw new Error(`Tool desconocida: ${name}`);
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: "text", text: `ERROR (${name}): ${e.message}` }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("afocat-migrate MCP server iniciado (stdio)");
