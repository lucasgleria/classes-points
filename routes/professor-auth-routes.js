const { verifyProfessor } = require("../auth");
const { renderProfessorLogin } = require("../views");

function registerProfessorAuthRoutes(router, { store, auth }) {
  router.get("/", (req, res) => {
    if (req.auth && req.auth.role === "professor" && req.auth.professorId) {
      return res.redirect("/dashboard");
    }

    const error = req.query.error === "invalid" ? "Credenciais invalidas." : "";
    return res.send(renderProfessorLogin(error));
  });

  router.post("/login", async (req, res) => {
    const professor = await verifyProfessor(store, req.body.username, req.body.password);
    if (!professor) {
      return res.redirect("/?error=invalid");
    }

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
