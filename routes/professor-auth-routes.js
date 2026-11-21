const crypto = require("node:crypto");
const { verifyProfessor } = require("../auth");
const { hashPassword, safeEqual } = require("../password-hash");
const {
  buildKeys,
  isLoginBlocked,
  registerLoginFailure,
  registerLoginSuccess,
  WINDOW_MINUTES,
} = require("../login-throttle");
const { renderProfessorLogin, renderProfessorPasswordReset } = require("../views");

const MIN_NEW_PASSWORD_LENGTH = 8;
const MAX_NEW_PASSWORD_LENGTH = 200;

// Compara os digests para o tamanho do codigo digitado nao influenciar o tempo da comparacao.
function isValidResetCode(typed, configured) {
  const digest = (value) => crypto.createHash("sha256").update(String(value ?? "")).digest("hex");
  return safeEqual(digest(typed), digest(configured));
}

function registerProfessorAuthRoutes(router, { store, auth, runtimeConfig = {} }) {
  router.get("/", (req, res) => {
    if (req.auth && req.auth.role === "professor" && req.auth.professorId) {
      return res.redirect("/dashboard");
    }

    const error = {
      invalid: "Credenciais invalidas.",
      blocked: `Muitas tentativas. Aguarde ${WINDOW_MINUTES} minutos e tente novamente.`,
    }[req.query.error] || "";
    const message = req.query.message === "reset" ? "Senha alterada. Entre com a nova senha." : "";
    return res.send(renderProfessorLogin(error, message));
  });

  const renderReset = (errorMessage = "") =>
    renderProfessorPasswordReset({
      enabled: Boolean(runtimeConfig.passwordResetCode),
      errorMessage,
      minLength: MIN_NEW_PASSWORD_LENGTH,
    });

  router.get("/forgot-password", (req, res) => res.send(renderReset()));

  router.post("/forgot-password", async (req, res) => {
    if (!runtimeConfig.passwordResetCode) {
      return res.status(404).send(renderReset());
    }

    const username = String(req.body.username || "").trim();
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (password.length < MIN_NEW_PASSWORD_LENGTH || password.length > MAX_NEW_PASSWORD_LENGTH) {
      return res.status(400).send(renderReset(`A nova senha precisa ter entre ${MIN_NEW_PASSWORD_LENGTH} e ${MAX_NEW_PASSWORD_LENGTH} caracteres.`));
    }
    if (password !== req.body.confirmPassword) {
      return res.status(400).send(renderReset("As duas senhas nao conferem."));
    }

    const keys = buildKeys(`reset:${username.toLowerCase()}`, req);
    if (await isLoginBlocked(store, keys)) {
      return res.status(429).send(renderReset(`Muitas tentativas. Aguarde ${WINDOW_MINUTES} minutos e tente novamente.`));
    }

    const codeIsValid = isValidResetCode(req.body.code, runtimeConfig.passwordResetCode);
    const professor = codeIsValid ? await store.getProfessorByUsername(username) : null;
    const changed = professor ? await store.updateProfessorPassword(professor.id, hashPassword(password)) : false;
    if (!changed) {
      await registerLoginFailure(store, keys);
      return res.status(400).send(renderReset("Usuario ou codigo de recuperacao invalido."));
    }

    // A nova senha libera tambem o login que estava bloqueado por tentativas erradas.
    await store.clearLoginFailures([keys.accountKey, `prof:${username.toLowerCase()}`]);
    return res.redirect(303, "/?message=reset");
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
