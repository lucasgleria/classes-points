const express = require("express");
const { requireStudent, verifyStudent } = require("../auth");
const { renderStudentLogin, renderStudentView } = require("../views");
const {
  buildKeys,
  isLoginBlocked,
  registerLoginFailure,
  registerLoginSuccess,
  WINDOW_MINUTES,
} = require("../login-throttle");

function createStudentRouter(store, auth) {
  const router = express.Router();

  router.get("/student/:token", async (req, res) => {
    const student = await store.getStudentByToken(req.params.token);
    if (
      req.auth &&
      req.auth.role === "student" &&
      req.auth.studentId &&
      req.auth.studentToken === req.params.token &&
      student &&
      student.id === req.auth.studentId
    ) {
      return res.redirect(`/student/${req.params.token}/view`);
    }

    const error = {
      invalid: "Credenciais invalidas.",
      blocked: `Muitas tentativas. Aguarde ${WINDOW_MINUTES} minutos e tente novamente.`,
    }[req.query.error] || "";
    return res.send(renderStudentLogin(student, error));
  });

  router.post("/student/:token/login", async (req, res) => {
    const keys = buildKeys(`student:${req.params.token}`, req);
    if (await isLoginBlocked(store, keys)) {
      return res.redirect(`/student/${encodeURIComponent(req.params.token)}?error=blocked`);
    }

    const student = await verifyStudent(store, req.params.token, req.body.username, req.body.password);
    if (!student) {
      await registerLoginFailure(store, keys);
      return res.redirect(`/student/${encodeURIComponent(req.params.token)}?error=invalid`);
    }

    await registerLoginSuccess(store, keys);
    auth.setStudent(res, student);
    return res.redirect(`/student/${student.token}/view`);
  });

  router.get("/student/:token/view", requireStudent, async (req, res) => {
    const summary = await store.getStudentSummaryByToken(req.params.token);
    if (!summary || summary.student.id !== req.auth.studentId) {
      return res.status(403).send("Acesso negado.");
    }
    return res.send(renderStudentView(summary));
  });

  router.get("/student/:token/logout", (req, res) => {
    auth.clear(res);
    return res.redirect(`/student/${req.params.token}`);
  });

  return router;
}

module.exports = {
  createStudentRouter,
};
