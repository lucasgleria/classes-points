const path = require("node:path");
const express = require("express");
const { createDatabase } = require("./db");
const { getRuntimeConfig } = require("./config");
const { createAuthToolkit } = require("./auth");
const { createProfessorRouter } = require("./routes/professor");
const { createStudentRouter } = require("./routes/student");
const { createVisitorBranch, registerVisitorEntry } = require("./routes/visitor");

function securityHeaders(req, res, next) {
  // Sem iframe (clickjacking), sem adivinhacao de tipo e sem vazar o token da URL do aluno no Referer.
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  return next();
}

// Camada extra contra CSRF alem do cookie SameSite=Lax: escrita so a partir do proprio site.
function rejectCrossSiteWrites(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return next();
  }
  const source = req.get("origin") || req.get("referer");
  if (!source) {
    return next();
  }
  try {
    if (new URL(source).host === req.get("host")) {
      return next();
    }
  } catch {
    // Origem invalida cai na recusa abaixo.
  }
  return res.status(403).send("Requisicao de outro site recusada.");
}

function createApp(options = {}) {
  const runtimeConfig = { ...getRuntimeConfig(), ...(options.runtimeConfig || {}) };
  const databaseOptions = {
    filename: runtimeConfig.databaseFilename,
    teacherAccounts: runtimeConfig.teacherAccounts,
    ...(options.database || {}),
  };
  const store = options.store || createDatabase(databaseOptions);
  const app = express();
  const sessionSecret = options.sessionSecret || runtimeConfig.sessionSecret;
  const auth = createAuthToolkit({
    secret: sessionSecret,
    secure: runtimeConfig.isProduction,
  });

  if (runtimeConfig.isProduction) {
    app.set("trust proxy", 1);
  }

  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use(rejectCrossSiteWrites);
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(auth.attachAuth);

  app.use(express.static(path.join(__dirname, "public")));
  registerVisitorEntry(app, auth);
  app.use(createVisitorBranch(auth, runtimeConfig, options.visitor));
  app.use(createProfessorRouter(store, auth, runtimeConfig));
  app.use(createStudentRouter(store, auth, runtimeConfig));

  app.use((err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }
    console.error(`Erro em ${req.method} ${req.path}:`, err);
    return res.status(500).send("Erro interno do servidor.");
  });

  return { app, store };
}

module.exports = {
  createApp,
};
