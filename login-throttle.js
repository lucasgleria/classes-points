// Limite de tentativas de login guardado no banco: instancias serverless nao compartilham memoria.
const WINDOW_MINUTES = 15;
const ACCOUNT_LIMIT = 5;
const IP_LIMIT = 40;

function buildKeys(accountKey, req) {
  return { accountKey, ipKey: `ip:${req.ip || "desconhecido"}` };
}

async function isLoginBlocked(store, { accountKey, ipKey }) {
  const counts = await store.countRecentLoginFailures([accountKey, ipKey], WINDOW_MINUTES);
  return (counts[accountKey] || 0) >= ACCOUNT_LIMIT || (counts[ipKey] || 0) >= IP_LIMIT;
}

async function registerLoginFailure(store, { accountKey, ipKey }) {
  await store.recordLoginFailure([accountKey, ipKey]);
}

// Sucesso zera so a conta; o contador do IP continua valendo contra quem testa varias contas.
async function registerLoginSuccess(store, { accountKey }) {
  await store.clearLoginFailures([accountKey]);
}

module.exports = {
  ACCOUNT_LIMIT,
  WINDOW_MINUTES,
  buildKeys,
  isLoginBlocked,
  registerLoginFailure,
  registerLoginSuccess,
};
