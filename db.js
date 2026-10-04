const { getRuntimeConfig } = require("./config");
const { buildClassLabel, slugifyName } = require("./db-common");
const { createPostgresStore } = require("./db-postgres");
const { createSqliteStore } = require("./db-sqlite");

function resolveTeacherAccounts(options, runtimeConfig) {
  if (Array.isArray(options.teacherAccounts) && options.teacherAccounts.length) {
    return options.teacherAccounts;
  }

  if (options.professorUsername || options.professorPassword) {
    return [
      {
        id: 1,
        username: options.professorUsername || runtimeConfig.teacherUsername,
        password: options.professorPassword || runtimeConfig.teacherPassword,
      },
    ];
  }

  return runtimeConfig.teacherAccounts;
}

function createDatabase(options = {}) {
  const runtimeConfig = getRuntimeConfig();
  const provider = options.provider || runtimeConfig.databaseProvider;
  const teacherAccounts = resolveTeacherAccounts(options, runtimeConfig);

  if (provider === "postgres") {
    const connectionString = options.connectionString || runtimeConfig.databaseUrl;
    if (!connectionString) {
      throw new Error("DATABASE_URL nao configurada para o banco persistente.");
    }

    return createPostgresStore({
      connectionString,
      teacherAccounts,
    });
  }

  if (runtimeConfig.isVercelProduction) {
    throw new Error("DATABASE_URL obrigatoria em producao na Vercel para evitar perda de dados.");
  }

  return createSqliteStore({
    filename: options.filename || runtimeConfig.databaseFilename,
    teacherAccounts,
  });
}

module.exports = {
  createDatabase,
  slugifyName,
  buildClassLabel,
};
