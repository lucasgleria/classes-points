const path = require("node:path");
const express = require("express");
const { createDatabase } = require("./db");
const { getRuntimeConfig } = require("./config");
const { createAuthToolkit } = require("./auth");
const { createProfessorRouter } = require("./routes/professor");
const { createStudentRouter } = require("./routes/student");

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

  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(auth.attachAuth);

  app.use(express.static(path.join(__dirname, "public")));
  app.use(createProfessorRouter(store, auth, runtimeConfig));
  app.use(createStudentRouter(store, auth, runtimeConfig));

  app.use((err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }
    return res.status(500).send("Erro interno do servidor.");
  });

  return { app, store };
}

module.exports = {
  createApp,
};
