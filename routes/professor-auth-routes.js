const { verifyProfessor } = require("../auth");
const {
  buildKeys,
  isLoginBlocked,
  registerLoginFailure,
  registerLoginSuccess,
  WINDOW_MINUTES,
} = require("../login-throttle");
const { renderProfessorLogin } = require("../views");

function registerProfessorAuthRoutes(router, { store, auth }) {
  router.get("/", (req, res) => {
    if (req.auth && req.auth.role === "professor" && req.auth.professorId) {
      return res.redirect("/dashboard");
    }

    const error = {
      invalid: "Credenciais invalidas.",
      blocked: `Muitas tentativas. Aguarde ${WINDOW_MINUTES} minutos e tente novamente.`,
    }[req.query.error] || "";
    return res.send(renderProfessorLogin(error));
  });

  router.post("/login", async (req, res) => {
    const keys = buildKeys(`prof:${String(req.body.username || "").trim().toLowerCase()}`, req);
    if (await isLoginBlocked(store, keys)) {
      return res.redirect("/?error=blocked");
    }

    const professor = await verifyProfessor(store, req.body.username, req.body.password);
    if (!professor) {
      await registerLoginFailure(store, keys);
      return res.redirect("/?error=invalid");
    }

    await registerLoginSuccess(store, keys);
    auth.setProfessor(res, professor);
    return res.redirect("/dashboard");
  });

  router.get("/logout", (req, res) => {
    auth.clear(res);
    return res.redirect("/");
  });
}

module.exports = {
  registerProfessorAuthRoutes,
};
