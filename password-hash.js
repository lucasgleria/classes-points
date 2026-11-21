const crypto = require("node:crypto");

const PREFIX = "scrypt";
const KEY_LENGTH = 32;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, KEY_LENGTH);
  return `${PREFIX}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

function isPasswordHash(stored) {
  return typeof stored === "string" && stored.startsWith(`${PREFIX}$`);
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

// Aceita o texto puro legado ate a proxima inicializacao gravar o hash.
function verifyPassword(password, stored) {
  if (typeof password !== "string" || typeof stored !== "string" || !stored) {
    return false;
  }
  if (!isPasswordHash(stored)) {
    return safeEqual(password, stored);
  }
  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) {
    return false;
  }
  const expected = Buffer.from(hash, "base64url");
  const actual = crypto.scryptSync(password, Buffer.from(salt, "base64url"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// Reaproveita o hash ja gravado quando a senha da configuracao nao mudou,
// para nao regravar (nem recalcular) a cada cold start.
const hashedInThisProcess = new Map();

function resolveStoredPassword(password, currentStored) {
  if (isPasswordHash(currentStored) && hashedInThisProcess.get(password) === currentStored) {
    return currentStored;
  }
  if (isPasswordHash(currentStored) && verifyPassword(password, currentStored)) {
    hashedInThisProcess.set(password, currentStored);
    return currentStored;
  }
  const hash = hashedInThisProcess.get(password) || hashPassword(password);
  hashedInThisProcess.set(password, hash);
  return hash;
}

// A senha trocada pelo "Esqueci minha senha" fica no banco. A da configuracao so volta a valer
// quando muda em TEACHER_ACCOUNTS, ou quando a conta estava desativada (senha vazia).
// configPassword guarda o hash da senha da configuracao que foi aplicada por ultimo.
function resolveProfessorPasswords(configuredPassword, stored = {}) {
  const configPassword = resolveStoredPassword(configuredPassword, stored.configPassword || stored.password);
  const keepChangedPassword = Boolean(stored.password) && stored.configPassword === configPassword;
  return { password: keepChangedPassword ? stored.password : configPassword, configPassword };
}

let dummyHash = null;

// Usuario inexistente ainda paga o custo de um scrypt, para o tempo de resposta nao revelar quem existe.
function verifyAgainstDummy(password) {
  dummyHash = dummyHash || hashPassword(crypto.randomBytes(16).toString("hex"));
  verifyPassword(String(password ?? ""), dummyHash);
  return false;
}

module.exports = {
  safeEqual,
  verifyAgainstDummy,
  hashPassword,
  isPasswordHash,
  resolveProfessorPasswords,
  resolveStoredPassword,
  verifyPassword,
};
