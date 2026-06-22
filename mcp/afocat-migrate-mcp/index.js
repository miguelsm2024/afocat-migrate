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
const FRONTEND_RULES_PATH = path.join(__dirname, "..", "..", "knowledge", "frontend-rules.json");

// --- Helpers ---
// Carpetas que nunca aportan codigo a migrar: deps + cache de Twig compilado + builds.
// Sin excluir .cache el scan se infla ~2.5x con templates compilados Twig 2
// (que Twig 3 ni siquiera carga). Override: includeAll=true.
const SKIP_DIRS = [
  "vendor",
  "node_modules",
  ".git",
  ".cache",
  "dist",
  "build",
  "vendors", // libs frontend de themes admin (app-assets/vendors/*)
  "bower_components",
];
// Backups manuales tipo "Archivo (1).php", "Archivo (2).php" (FileZilla / copia-pega).
// Duplican findings y nunca son el archivo vivo.
const DUP_FILE_RE = / \(\d+\)\.php$/;
// Minificados: generados, no fuente. Disparan falsos positivos (todo en una linea).
const MIN_FILE_RE = /\.min\.(js|css)$/i;
// Librerias frontend de terceros (no son codigo del proyecto). Aunque no esten
// minificadas inflan el scan ~10x. Override: include_all=true.
const VENDOR_FILE_RE =
  /(^|[\\/])(jquery[.\-]|bootstrap[.\-]|popper|select2|datatables?|moment|chart(js)?[.\-]|d3[.\-]|echarts|flot|fullcalendar|swiper|slick|owl\.carousel|tinymce|ckeditor|dropzone|sweetalert|toastr|raphael|morris|underscore|lodash|modernizr|jquery-ui|datepicker|daterangepicker|nouislider|wizard|sparkline)/i;

// Extensiones por capa. PHP = back-compat; FRONTEND = capa nueva (incluye Twig).
const PHP_EXTS = [".php"];
const FRONTEND_EXTS = [".js", ".css", ".scss", ".html", ".htm", ".twig", ".phtml"];

// Recolector generico por extension. exts = lista de extensiones (con punto).
async function collectFiles(target, opts = {}) {
  const { includeAll = false, exts = PHP_EXTS } = opts;
  const st = await stat(target);
  if (st.isFile()) return [target];
  const out = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!includeAll && SKIP_DIRS.includes(entry.name)) continue;
        await walk(full);
      } else if (exts.some((e) => entry.name.toLowerCase().endsWith(e))) {
        if (!includeAll && DUP_FILE_RE.test(entry.name)) continue;
        if (!includeAll && MIN_FILE_RE.test(entry.name)) continue;
        if (!includeAll && VENDOR_FILE_RE.test(entry.name)) continue;
        out.push(full);
      }
    }
  }
  await walk(target);
  return out;
}

// Wrapper back-compat: el resto del codigo (php_lint, deprecation_scan) lo usa tal cual.
function collectPhpFiles(target, opts = {}) {
  return collectFiles(target, { ...opts, exts: PHP_EXTS });
}

// Heuristica: la linea es comentario puro (docblock, // , /* , {# twig).
// Evita falsos positivos al matchear codigo comentado o menciones en docblocks.
function isCommentLine(trimmed) {
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*/") ||
    trimmed.startsWith("{#")
  );
}

// Mapea un archivo a su lenguaje frontend por extension (para scoping de reglas).
function langOf(file) {
  const f = file.toLowerCase();
  if (f.endsWith(".js")) return "js";
  if (f.endsWith(".css") || f.endsWith(".scss")) return "css";
  if (f.endsWith(".twig")) return "twig";
  if (f.endsWith(".html") || f.endsWith(".htm") || f.endsWith(".phtml")) return "html";
  return "other";
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
        const t = line.trim();
        if (isCommentLine(t)) return; // skip comentarios puros (FP)
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
            snippet: t.slice(0, 160),
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

// Niveles de upgrade frontend: redesign incluye restructure incluye modernize.
const LEVEL_ORDER = { modernize: 1, restructure: 2, redesign: 3 };

async function frontendScan(args) {
  const ruleset = JSON.parse(await readFile(FRONTEND_RULES_PATH, "utf8"));
  const compiled = (ruleset.rules || []).map((r) => ({
    ...r,
    re: new RegExp(r.regex, "g"),
    applies_to: r.applies_to || [],
  }));

  const target = resolveTarget(args.path);
  const files = await collectFiles(target, {
    includeAll: !!args.include_all,
    exts: FRONTEND_EXTS,
  });

  const minSev = args.severity || null; // fatal|warning|info
  const sevOrder = { fatal: 3, warning: 2, info: 1 };
  // Nivel elegido: incluir reglas de ese nivel y los inferiores.
  const maxLevel = args.level ? LEVEL_ORDER[args.level] || 3 : 3;
  const langFilter = args.lang || null; // js|css|html|twig

  const findings = [];
  for (const f of files) {
    const lang = langOf(f);
    if (langFilter && lang !== langFilter) continue;
    const content = await readFile(f, "utf8");
    const lines = content.split(/\r?\n/);
    for (const rule of compiled) {
      // Scoping por lenguaje: la regla solo aplica a sus extensiones.
      if (rule.applies_to.length && !rule.applies_to.includes(lang)) continue;
      if (minSev && (sevOrder[rule.severity] || 0) < (sevOrder[minSev] || 0)) continue;
      if ((LEVEL_ORDER[rule.level] || 1) > maxLevel) continue;
      lines.forEach((line, idx) => {
        const t = line.trim();
        if (isCommentLine(t)) return; // skip comentarios puros (FP)
        rule.re.lastIndex = 0;
        if (rule.re.test(line)) {
          findings.push({
            file: f,
            line: idx + 1,
            lang,
            id: rule.id,
            severity: rule.severity,
            level: rule.level,
            category: rule.category || null,
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
  const byLevel = {};
  const byLang = {};
  const byCat = {};
  for (const fn of findings) {
    bySev[fn.severity] = (bySev[fn.severity] || 0) + 1;
    byLevel[fn.level] = (byLevel[fn.level] || 0) + 1;
    byLang[fn.lang] = (byLang[fn.lang] || 0) + 1;
    if (fn.category) byCat[fn.category] = (byCat[fn.category] || 0) + 1;
  }
  return {
    scanned: files.length,
    total_findings: findings.length,
    by_severity: bySev,
    by_level: byLevel,
    by_language: byLang,
    by_category: byCat,
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
    name: "frontend_scan",
    description:
      "Escanea frontend (.js/.css/.scss/.html/.htm/.twig/.phtml) con knowledge/frontend-rules.json. Ignora vendor/node_modules/.git/.cache/dist/build, minificados '*.min.js/.css' y backups '* (N)'. Reglas scopeadas por lenguaje y por nivel de upgrade. Devuelve file:line, regla, severidad, level, categoria, fix.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Archivo o carpeta (rel a project root o absoluta)" },
        include_all: {
          type: "boolean",
          description: "Incluir vendor/node_modules/.git/.cache/dist/build, minificados y backups (default false).",
        },
        level: {
          type: "string",
          enum: ["modernize", "restructure", "redesign"],
          description:
            "Nivel de upgrade: incluye reglas de ese nivel y los inferiores (redesign>restructure>modernize). Default redesign (todo).",
        },
        lang: {
          type: "string",
          enum: ["js", "css", "html", "twig"],
          description: "Filtrar por lenguaje frontend",
        },
        severity: {
          type: "string",
          enum: ["fatal", "warning", "info"],
          description: "Severidad minima a reportar",
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
      case "frontend_scan":
        result = await frontendScan(args);
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
