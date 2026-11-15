const express = require("express");
const { DEMO_PROFESSOR_ID, getDemoStore } = require("../demo-seed");
const { renderStudentView } = require("../views");
const { createProfessorRouter } = require("./professor");

const READ_ONLY_MESSAGE = "Modo visitante: as acoes estao desativadas nesta demonstracao.";
const VISITOR_BANNER = `
    <div class="visitor-banner" role="status">
      <strong>Modo visitante</strong>
      <span>Dados ficticios, somente para visualizacao. Nenhuma alteracao e salva.</span>
      <a href="/logout">Sair</a>
    </div>`;

function registerVisitorEntry(app, auth) {
  const enter = (req, res) => {
    auth.setVisitor(res);
    return res.redirect(303, "/dashboard");
  };
  app.get("/demo", enter);
  app.post("/visitor", enter);
}

// Volta para a pagina de onde veio (mesmo site), com o aviso de modo somente leitura.
function readOnlyRedirect(req) {
  let target = "/dashboard";
  try {
    const referer = new URL(req.get("referer") || "");
    if (referer.host === req.get("host")) {
      referer.searchParams.delete("message");
      referer.searchParams.delete("error");
      target = `${referer.pathname}${referer.search}`;
    }
  } catch {
    // Sem referer valido: dashboard.
  }
  return `${target}${target.includes("?") ? "&" : "?"}error=${encodeURIComponent(READ_ONLY_MESSAGE)}`;
}

function blockWrites(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD") {
    return next();
  }
  return res.redirect(303, readOnlyRedirect(req));
}

function markVisitorPages(req, res, next) {
  const send = res.send.bind(res);
  res.send = (body) => {
    if (typeof body === "string" && body.startsWith("<!DOCTYPE html>")) {
      body = body.replace(/<body([^>]*)>/, `<body$1 data-visitor="true">${VISITOR_BANNER}`);
    }
    return send(body);
  };
  return next();
}

function buildVisitorRouter(auth, runtimeConfig, getStore) {
  const store = getStore();
  const router = express.Router();
  router.use(blockWrites);
  router.use(markVisitorPages);

  // O login de aluno e um POST (bloqueado); o visitante ve direto a area do aluno ficticio.
  router.get(["/student/:token", "/student/:token/view"], async (req, res) => {
    const summary = await store.getStudentSummaryByToken(req.params.token);
    if (!summary) {
      return res.status(404).send("Aluno nao encontrado.");
    }
    return res.send(renderStudentView(summary));
  });
  router.get("/student/:token/logout", (req, res) => res.redirect("/visualizations"));

  router.use(createProfessorRouter(store, auth, { ...runtimeConfig, academicRankingEnabled: true }));
  return router;
}

function createVisitorBranch(auth, runtimeConfig, { getStore = getDemoStore } = {}) {
  let router = null;
  return (req, res, next) => {
    if (!req.auth || req.auth.role !== "visitor") {
      return next();
    }
    router = router || buildVisitorRouter(auth, runtimeConfig, getStore);
    req.auth = { role: "professor", professorId: DEMO_PROFESSOR_ID, visitor: true };
    // Nunca segue para os routers reais: rota desconhecida do visitante termina em 404 aqui,
    // senao cairia nas rotas reais com professorId 1 (que la e um professor de verdade).
    return router(req, res, (error) => (error ? next(error) : res.status(404).send("Pagina nao encontrada.")));
  };
}

module.exports = {
  READ_ONLY_MESSAGE,
  createVisitorBranch,
  registerVisitorEntry,
};
