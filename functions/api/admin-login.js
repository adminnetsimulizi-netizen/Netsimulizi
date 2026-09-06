const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });

const bytesToHex = (bytes) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const hexToBytes = (hex) => {
  const bytes = new Uint8Array(hex.length / 2);

  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  return bytes;
};

const hashPassword = async (password) => {
  const encoder = new TextEncoder();

  const salt = crypto.getRandomValues(
    new Uint8Array(16)
  );

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    key,
    256
  );

  return [
    "pbkdf2",
    "sha256",
    "100000",
    bytesToHex(salt),
    bytesToHex(new Uint8Array(bits))
  ].join("$");
};

const verifyPassword = async (password, stored) => {
  try {
    const parts = String(stored || "").split("$");

    if (
      parts.length !== 5 ||
      parts[0] !== "pbkdf2" ||
      parts[1] !== "sha256"
    ) {
      return false;
    }

    const iterations = Number(parts[2]);
    const salt = hexToBytes(parts[3]);
    const expected = hexToBytes(parts[4]);

    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations,
        hash: "SHA-256"
      },
      key,
      256
    );

    const actual = new Uint8Array(bits);

    if (actual.length !== expected.length) {
      return false;
    }

    let result = 0;

    for (let i = 0; i < actual.length; i++) {
      result |= actual[i] ^ expected[i];
    }

    return result === 0;
  } catch {
    return false;
  }
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }

  if (request.method !== "POST") {
    return json(
      {
        success: false,
        error: "Method not allowed"
      },
      405
    );
  }

  const db = env.D1 ?? env.DB;

  if (!db) {
    return json(
      {
        success: false,
        error: "D1 database binding not found"
      },
      500
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        success: false,
        error: "Invalid JSON"
      },
      400
    );
  }

  const login = String(
    body.login ||
    body.username ||
    body.email ||
    ""
  ).trim();

  const password = String(
    body.password || ""
  );

  if (!login || !password) {
    return json(
      {
        success: false,
        error: "Login and password are required"
      },
      400
    );
  }

  try {
    const user = await db
      .prepare(`
        SELECT *
        FROM users
        WHERE LOWER(username) = LOWER(?)
           OR LOWER(email) = LOWER(?)
        LIMIT 1
      `)
      .bind(login, login)
      .first();

    if (!user) {
      return json(
        {
          success: false,
          error: "Invalid login credentials"
        },
        401
      );
    }

    /* ADMIN CHECK — accepts both 'admin' and 'super_admin' roles, case-insensitive */
    const role = String(user.role || "").toLowerCase().trim();
    const isAdmin = role === "admin" || role === "super_admin";

    if (!isAdmin) {
      return json(
        {
          success: false,
          error: "Admin account required"
        },
        403
      );
    }

    if (
      String(user.status || "").toLowerCase() !== "active"
    ) {
      return json(
        {
          success: false,
          error: "Admin account is not active"
        },
        403
      );
    }

    let valid = await verifyPassword(
      password,
      user.password_hash
    );

    /*
     * Temporary migration:
     * The existing admin record currently contains
     * TEMP_ADMIN_PASSWORD instead of a PBKDF2 hash.
     *
     * If the user enters TEMP_ADMIN_PASSWORD,
     * convert it immediately to the secure PBKDF2 format.
     */
    if (
      !valid &&
      String(user.password_hash || "") ===
        "TEMP_ADMIN_PASSWORD" &&
      password === "TEMP_ADMIN_PASSWORD"
    ) {
      const newHash = await hashPassword(password);

      await db
        .prepare(`
          UPDATE users
          SET password_hash = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `)
        .bind(newHash, user.id)
        .run();

      valid = true;
    }

    if (!valid) {
      return json(
        {
          success: false,
          error: "Invalid login credentials"
        },
        401
      );
    }

    const admin = await db
      .prepare(`
        SELECT *
        FROM admins
        WHERE user_id = ?
        LIMIT 1
      `)
      .bind(user.id)
      .first();

    if (!admin) {
      return json(
        {
          success: false,
          error: "Admin account not found"
        },
        404
      );
    }

    if (
      String(admin.status || "").toLowerCase() !==
      "active"
    ) {
      return json(
        {
          success: false,
          error: "Admin account is not active"
        },
        403
      );
    }

    return json({
      success: true,
      message: "Admin login successful",
      user: {
        id: user.id,
        admin_id: admin.id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status
      }
    });
  } catch (error) {
    return json(
      {
        success: false,
        error: "Login failed",
        details: error?.message || String(error)
      },
      500
    );
  }
}
