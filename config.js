const os = require("node:os");
const path = require("node:path");

const DEFAULT_REPORT_TIMEZONE = "America/Sao_Paulo";
const DEFAULT_REPORT_CITY = "Guarulhos";
const MIN_SESSION_SECRET_LENGTH = 32;

function isTruthy(value) {
  return typeof value === "string" && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function normalizeOptionalString(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeTeacherAccount(account, fallbackId) {
  const username = typeof account?.username === "string" ? account.username.trim() : "";
  const password = typeof account?.password === "string" ? account.password.trim() : "";
  const numericId = Number(account?.id);
  const displayName =
    typeof account?.displayName === "string" && account.displayName.trim()
      ? account.displayName.trim()
      : username;

  if (!username) {
    throw new Error("Cada professor precisa de um usuario.");
  }

  if (!password) {
    throw new Error(`O professor ${username} precisa de uma senha.`);
  }

  return {
    id: Number.isInteger(numericId) && numericId > 0 ? numericId : fallbackId,
    username,
    password,
    displayName,
  };
}

function assertUniqueTeacherAccounts(accounts) {
  const seenIds = new Set();
  const seenUsernames = new Set();

  for (const account of accounts) {
    if (seenIds.has(account.id)) {
      throw new Error(`Professor duplicado com id ${account.id}.`);
    }

    if (seenUsernames.has(account.username.toLowerCase())) {
      throw new Error(`Professor duplicado com usuario ${account.username}.`);
    }

    seenIds.add(account.id);
    seenUsernames.add(account.username.toLowerCase());
  }

  return accounts;
}

// Senhas apenas para desenvolvimento local e testes. Em producao as contas
// vem obrigatoriamente de TEACHER_ACCOUNTS (nunca de valores no codigo).
function getDevelopmentTeacherAccounts(env) {
  return assertUniqueTeacherAccounts([
    normalizeTeacherAccount(
      {
        id: 1,
        username: env.TEACHER_USERNAME || "Lucas Leria",
        password: env.TEACHER_PASSWORD || "dev-lucas",
      },
      1
    ),
    normalizeTeacherAccount(
      {
        id: 2,
        username: "Rosana",
        password: "dev-rosana",
      },
      2
    ),
  ]);
}

function getTeacherAccounts(env, isProductionDeployment) {
  const rawTeacherAccounts = env.TEACHER_ACCOUNTS;
  if (!rawTeacherAccounts) {
    if (isProductionDeployment) {
      throw new Error("TEACHER_ACCOUNTS obrigatoria em producao: configure as contas dos professores na Vercel.");
    }
    return getDevelopmentTeacherAccounts(env);
  }

  let parsedTeacherAccounts;
  try {
    parsedTeacherAccounts = JSON.parse(rawTeacherAccounts);
  } catch {
    throw new Error("TEACHER_ACCOUNTS precisa ser um JSON valido.");
  }

  if (!Array.isArray(parsedTeacherAccounts) || !parsedTeacherAccounts.length) {
    throw new Error("TEACHER_ACCOUNTS precisa conter pelo menos um professor.");
  }

  return assertUniqueTeacherAccounts(
    parsedTeacherAccounts.map((account, index) => normalizeTeacherAccount(account, index + 1))
  );
}

function getRuntimeConfig(env = process.env) {
  const isVercel = isTruthy(env.VERCEL) || Boolean(env.VERCEL_URL);
  const isProduction = env.NODE_ENV === "production";
  const vercelEnvironment = env.VERCEL_ENV || "";
  const databaseUrl = env.DATABASE_URL || env.POSTGRES_URL || "";
  const databaseProvider = databaseUrl ? "postgres" : "sqlite";
  const isProductionDeployment = isProduction || (isVercel && vercelEnvironment === "production");
  const teacherAccounts = getTeacherAccounts(env, isProductionDeployment);
  const sessionSecret = normalizeOptionalString(env.SESSION_SECRET, "");
  if (isProductionDeployment && sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error(`SESSION_SECRET obrigatoria em producao, com pelo menos ${MIN_SESSION_SECRET_LENGTH} caracteres.`);
  }
  const databaseFilename =
    env.DATABASE_FILE ||
    (isVercel
      ? path.join(os.tmpdir(), "points-codex-production.sqlite")
      : path.join(__dirname, "data", "points.sqlite"));

  return {
    isProduction,
    isVercel,
    vercelEnvironment,
    isVercelProduction: isVercel && vercelEnvironment === "production",
    databaseProvider,
    databaseUrl,
    databaseFilename,
    teacherAccounts,
    teacherUsername: teacherAccounts[0].username,
    teacherPassword: teacherAccounts[0].password,
    sessionSecret: sessionSecret || "points-codex-development-secret",
    academicRankingEnabled: isTruthy(env.ACADEMIC_RANKING_ENABLED),
    reportTimezone: normalizeOptionalString(env.REPORT_TIMEZONE, DEFAULT_REPORT_TIMEZONE),
    reportCity: normalizeOptionalString(env.REPORT_CITY, DEFAULT_REPORT_CITY),
  };
}

module.exports = {
  DEFAULT_REPORT_CITY,
  DEFAULT_REPORT_TIMEZONE,
  getRuntimeConfig,
};
