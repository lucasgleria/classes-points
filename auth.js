const crypto = require("node:crypto");

const AUTH_COOKIE_NAME = "points-codex.auth";
const AUTH_COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 8;

async function verifyProfessor(store, username, password) {
  const professor = await store.getProfessorByUsername(username);
  if (!professor || professor.password !== password) {
    return null;
  }
  return professor;
}

async function verifyStudent(store, token, username, password) {
  const student = await store.getStudentByUsernameAndToken(token, username);
  if (!student || student.password !== password) {
    return null;
  }
  return student;
}

function createAuthToolkit({ secret, secure }) {
  function sign(value) {
    return crypto.createHmac("sha256", secret).update(value).digest("base64url");
  }

  function serializeCookie(name, value, options = {}) {
    const parts = [`${name}=${encodeURIComponent(value)}`];

    if (options.maxAge !== undefined) {
      parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge / 1000))}`);
    }

    if (options.expires instanceof Date) {
      parts.push(`Expires=${options.expires.toUTCString()}`);
    }

    parts.push(`Path=${options.path || "/"}`);

    if (options.httpOnly) {
      parts.push("HttpOnly");
    }

    if (options.sameSite) {
      parts.push(`SameSite=${options.sameSite}`);
    }

    if (options.secure) {
      parts.push("Secure");
    }

    return parts.join("; ");
  }

  function parseCookies(headerValue) {
    if (!headerValue) {
      return {};
    }

    return headerValue.split(";").reduce((cookies, entry) => {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex === -1) {
        return cookies;
      }

      const name = entry.slice(0, separatorIndex).trim();
      const rawValue = entry.slice(separatorIndex + 1).trim();

      try {
        cookies[name] = decodeURIComponent(rawValue);
      } catch {
        cookies[name] = rawValue;
      }

      return cookies;
    }, {});
  }

  function safeEqual(left, right) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
  }

  function buildCookiePayload(payload) {
    return {
      ...payload,
      exp: Date.now() + AUTH_COOKIE_MAX_AGE_MS,
    };
  }

  function encodePayload(payload) {
    return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  }

  function decodePayload(encodedPayload) {
    return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  }

  function createSignedCookieValue(payload) {
    const encodedPayload = encodePayload(buildCookiePayload(payload));
    return `${encodedPayload}.${sign(encodedPayload)}`;
  }

  function readAuth(req) {
    const cookies = parseCookies(req.headers.cookie);
    const rawValue = cookies[AUTH_COOKIE_NAME];

    if (!rawValue) {
      return null;
    }

    const [encodedPayload, signature, ...rest] = rawValue.split(".");
    if (!encodedPayload || !signature || rest.length > 0) {
      return null;
    }

    const expectedSignature = sign(encodedPayload);
    if (!safeEqual(signature, expectedSignature)) {
      return null;
    }

    let payload;
    try {
      payload = decodePayload(encodedPayload);
    } catch {
      return null;
    }

    if (!payload || typeof payload !== "object" || typeof payload.exp !== "number") {
      return null;
    }

    if (payload.exp <= Date.now()) {
      return null;
    }

    return payload;
  }

  function writeCookie(res, payload) {
    const cookie = serializeCookie(AUTH_COOKIE_NAME, createSignedCookieValue(payload), {
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure,
      maxAge: AUTH_COOKIE_MAX_AGE_MS,
      expires: new Date(Date.now() + AUTH_COOKIE_MAX_AGE_MS),
    });

    res.setHeader("Set-Cookie", cookie);
  }

  return {
    attachAuth(req, res, next) {
      req.auth = readAuth(req);
      return next();
    },
    setProfessor(res, professor) {
      writeCookie(res, {
        role: "professor",
        professorId: professor.id,
      });
    },
    setStudent(res, student) {
      writeCookie(res, {
        role: "student",
        studentId: student.id,
        studentToken: student.token,
      });
    },
    clear(res) {
      res.setHeader(
        "Set-Cookie",
        serializeCookie(AUTH_COOKIE_NAME, "", {
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
          secure,
          maxAge: 0,
          expires: new Date(0),
        })
      );
    },
  };
}

function requireProfessor(req, res, next) {
  if (!req.auth || req.auth.role !== "professor" || !req.auth.professorId) {
    return res.redirect("/");
  }
  return next();
}

function requireStudent(req, res, next) {
  if (!req.auth || req.auth.role !== "student" || !req.auth.studentId || !req.auth.studentToken) {
    return res.redirect(`/student/${req.params.token}`);
  }
  if (req.auth.studentToken !== req.params.token) {
    return res.status(403).send("Acesso negado.");
  }
  return next();
}

module.exports = {
  createAuthToolkit,
  verifyProfessor,
  verifyStudent,
  requireProfessor,
  requireStudent,
};
