/*
 * NET SIMULIZI API
 * Cloudflare Pages Functions + D1 + R2
 *
 * FILE:
 * functions/api/[[path]].js
 */

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS
  });
}

function errorResponse(message, status = 400, extra = {}) {
  return json({
    success: false,
    message,
    ...extra
  }, status);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function clean(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function now() {
  return new Date().toISOString();
}

function randomId(prefix = "") {
  return prefix + crypto.randomUUID();
}

/* =========================================================
   PASSWORD FUNCTIONS
========================================================= */

function bytesToBase64(bytes) {
  let binary = "";
  const arr = new Uint8Array(bytes);

  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }

  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function hashPassword(password) {
  const encoder = new TextEncoder();

  const salt = crypto.getRandomValues(new Uint8Array(16));

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 1000,
      hash: "SHA-256"
    },
    key,
    256
  );

  return {
    salt: bytesToBase64(salt),
    hash: bytesToBase64(bits)
  };
}

async function verifyPassword(password, storedHash, storedSalt) {
  try {
    const encoder = new TextEncoder();
    const salt = base64ToBytes(storedSalt);

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: 1000,
        hash: "SHA-256"
      },
      key,
      256
    );

    const result = bytesToBase64(bits);

    return result === storedHash;
  } catch {
    return false;
  }
}

/* =========================================================
   DATABASE HELPERS
========================================================= */

async function tableExists(db, table) {
  try {
    const result = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      )
      .bind(table)
      .first();

    return !!result;
  } catch {
    return false;
  }
}

async function safeFirst(db, sql, bindings = []) {
  try {
    return await db.prepare(sql).bind(...bindings).first();
  } catch {
    return null;
  }
}

async function safeAll(db, sql, bindings = []) {
  try {
    return await db.prepare(sql).bind(...bindings).all();
  } catch {
    return {
      results: [],
      success: false
    };
  }
}

async function safeRun(db, sql, bindings = []) {
  return await db.prepare(sql).bind(...bindings).run();
}

/* =========================================================
   AUTHORIZATION
========================================================= */

async function getUser(db, userId) {
  if (!userId) return null;

  return await safeFirst(
    db,
    `
      SELECT
        id,
        username,
        email,
        role,
        status,
        created_at,
        updated_at
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId]
  );
}

async function requireAdmin(db, userId) {
  const user = await getUser(db, userId);

  if (!user) {
    return {
      ok: false,
      response: errorResponse("User not found", 401)
    };
  }

  if (user.role !== "admin") {
    return {
      ok: false,
      response: errorResponse("Admin access required", 403)
    };
  }

  if (user.status && user.status !== "active") {
    return {
      ok: false,
      response: errorResponse("Account is not active", 403)
    };
  }

  return {
    ok: true,
    user
  };
}

/* =========================================================
   GET /api/health
========================================================= */

async function health(env) {
  return json({
    success: true,
    message: "Net Simulizi API is running",
    database: !!env.D1,
    storage: !!env.R2,
    time: now()
  });
}

/* =========================================================
   GET /api/test
========================================================= */

async function test(env) {
  return json({
    success: true,
    message: "Net Simulizi API test successful",
    D1: !!env.D1,
    R2: !!env.R2,
    C1: !!env.C1,
    S1: !!env.S1,
    time: now()
  });
}

/* =========================================================
   GET /api/db-test
========================================================= */

async function dbTest(env) {
  try {
    if (!env.D1) {
      return errorResponse("D1 binding not found", 500);
    }

    const result = await env.D1
      .prepare("SELECT 1 AS test")
      .first();

    return json({
      success: true,
      message: "D1 database connection successful",
      result
    });
  } catch (error) {
    return errorResponse(
      "D1 database connection failed",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   GET /api/categories
========================================================= */

async function categories(env, url) {
  try {
    const language = clean(url.searchParams.get("language"));

    let sql = `
      SELECT
        id,
        name,
        slug,
        language,
        status,
        created_at,
        updated_at
      FROM categories
      WHERE status = 'active'
    `;

    const bindings = [];

    if (language) {
      sql += " AND (language = ? OR language = 'both')";
      bindings.push(language);
    }

    sql += " ORDER BY name ASC";

    const result = await env.D1
      .prepare(sql)
      .bind(...bindings)
      .all();

    return json({
      success: true,
      categories: result.results || []
    });
  } catch (error) {
    return errorResponse(
      "Failed to load categories",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   GET /api/genres
========================================================= */

async function genres(env, url) {
  return categories(env, url);
}

/* =========================================================
   GET /api/authors
========================================================= */

async function authors(env, url) {
  try {
    const q = clean(url.searchParams.get("q"));

    let sql = `
      SELECT
        a.id,
        a.display_name,
        a.display_name AS name,
        a.display_name AS author_name
      FROM authors a
      WHERE 1=1
    `;

    const bindings = [];

    if (q) {
      sql += `
        AND (
          a.display_name LIKE ?
          OR a.display_name LIKE ?
        )
      `;

      bindings.push(`%${q}%`);
      bindings.push(`%${q}%`);
    }

    sql += " ORDER BY a.display_name ASC";

    const result = await env.D1
      .prepare(sql)
      .bind(...bindings)
      .all();

    return json({
      success: true,
      authors: result.results || []
    });
  } catch (error) {
    return errorResponse(
      "Failed to load authors",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   GET /api/authors/:id
========================================================= */

async function authorProfile(env, id) {
  try {
    const author = await env.D1
      .prepare(`
        SELECT
          a.id,
          a.display_name,
          a.display_name AS name,
          a.display_name AS author_name
        FROM authors a
        WHERE a.id = ?
        LIMIT 1
      `)
      .bind(id)
      .first();

    if (!author) {
      return errorResponse("Author not found", 404);
    }

    let stories = [];

    try {
      const result = await env.D1
        .prepare(`
          SELECT
            s.id,
            s.title,
            s.slug,
            s.description,
            s.cover_url,
            s.language,
            s.status,
            s.visibility,
            s.readers_count,
            s.created_at,
            s.updated_at,
            a.display_name AS author_name,
            c.name AS category_name
          FROM stories s
          LEFT JOIN authors a ON a.id = s.author_id
          LEFT JOIN categories c ON c.id = s.category_id
          WHERE s.author_id = ?
            AND s.status = 'published'
            AND (
              s.visibility = 'public'
              OR s.visibility IS NULL
            )
          ORDER BY s.created_at DESC
        `)
        .bind(id)
        .all();

      stories = result.results || [];
    } catch {
      stories = [];
    }

    return json({
      success: true,
      author,
      stories
    });
  } catch (error) {
    return errorResponse(
      "Failed to load author",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   STORIES
========================================================= */

async function stories(env, url) {
  try {
    const language = clean(url.searchParams.get("language"));
    const category = clean(url.searchParams.get("category"));
    const authorId = clean(url.searchParams.get("author_id"));
    const q = clean(url.searchParams.get("q"));
    const limitParam = parseInt(url.searchParams.get("limit") || "100");
    const limit = Math.min(
      Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 100,
      200
    );

    let sql = `
      SELECT
        s.id,
        s.title,
        s.slug,
        s.description,
        s.cover_url,
        s.language,
        s.status,
        s.visibility,
        s.readers_count,
        s.created_at,
        s.updated_at,
        s.author_id,
        s.category_id,
        a.display_name AS author_name,
        a.display_name AS author,
        c.name AS category_name,
        c.name AS category
      FROM stories s
      LEFT JOIN authors a ON a.id = s.author_id
      LEFT JOIN categories c ON c.id = s.category_id
      WHERE s.status = 'published'
        AND (
          s.visibility = 'public'
          OR s.visibility IS NULL
        )
    `;

    const bindings = [];

    if (language) {
      sql += " AND s.language = ?";
      bindings.push(language);
    }

    if (category) {
      sql += `
        AND (
          c.slug = ?
          OR CAST(c.id AS TEXT) = ?
        )
      `;

      bindings.push(category);
      bindings.push(category);
    }

    if (authorId) {
      sql += " AND s.author_id = ?";
      bindings.push(authorId);
    }

    if (q) {
      sql += `
        AND (
          s.title LIKE ?
          OR s.description LIKE ?
          OR a.display_name LIKE ?
        )
      `;

      bindings.push(`%${q}%`);
      bindings.push(`%${q}%`);
      bindings.push(`%${q}%`);
    }

    sql += `
      ORDER BY
        COALESCE(s.readers_count, 0) DESC,
        s.created_at DESC
      LIMIT ?
    `;

    bindings.push(limit);

    const result = await env.D1
      .prepare(sql)
      .bind(...bindings)
      .all();

    return json({
      success: true,
      stories: result.results || [],
      count: (result.results || []).length
    });
  } catch (error) {
    return errorResponse(
      "Failed to load stories",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   GET /api/stories/search
========================================================= */

async function storySearch(env, url) {
  return stories(env, url);
}

/* =========================================================
   GET /api/stories/trending
========================================================= */

async function trendingStories(env, url) {
  try {
    const limitParam = parseInt(url.searchParams.get("limit") || "20");
    const limit = Math.min(
      Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 20,
      100
    );

    const result = await env.D1
      .prepare(`
        SELECT
          s.id,
          s.title,
          s.slug,
          s.description,
          s.cover_url,
          s.language,
          s.status,
          s.visibility,
          s.readers_count,
          s.created_at,
          s.updated_at,
          a.display_name AS author_name,
          c.name AS category_name
        FROM stories s
        LEFT JOIN authors a ON a.id = s.author_id
        LEFT JOIN categories c ON c.id = s.category_id
        WHERE s.status = 'published'
          AND (
            s.visibility = 'public'
            OR s.visibility IS NULL
          )
        ORDER BY COALESCE(s.readers_count, 0) DESC
        LIMIT ?
      `)
      .bind(limit)
      .all();

    return json({
      success: true,
      stories: result.results || []
    });
  } catch (error) {
    return errorResponse(
      "Failed to load trending stories",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   GET /api/stories/:id
========================================================= */

async function storyDetail(env, id) {
  try {
    const story = await env.D1
      .prepare(`
        SELECT
          s.id,
          s.title,
          s.slug,
          s.description,
          s.cover_url,
          s.language,
          s.status,
          s.visibility,
          s.readers_count,
          s.author_id,
          s.category_id,
          s.created_at,
          s.updated_at,
          a.display_name AS author_name,
          a.display_name AS author,
          c.name AS category_name,
          c.name AS category
        FROM stories s
        LEFT JOIN authors a ON a.id = s.author_id
        LEFT JOIN categories c ON c.id = s.category_id
        WHERE s.id = ?
          AND s.status = 'published'
          AND (
            s.visibility = 'public'
            OR s.visibility IS NULL
          )
        LIMIT 1
      `)
      .bind(id)
      .first();

    if (!story) {
      return errorResponse("Story not found", 404);
    }

    return json({
      success: true,
      story
    });
  } catch (error) {
    return errorResponse(
      "Failed to load story",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   INCREASE STORY READERS
========================================================= */

async function increaseReaders(env, storyId) {
  try {
    await env.D1
      .prepare(`
        UPDATE stories
        SET readers_count = COALESCE(readers_count, 0) + 1
        WHERE id = ?
      `)
      .bind(storyId)
      .run();
  } catch {
    // Do not break reading if counter update fails.
  }
}

/* =========================================================
   GET /api/stories/:id/episodes
========================================================= */

async function storyEpisodes(env, storyId) {
  try {
    const result = await env.D1
      .prepare(`
        SELECT
          id,
          story_id,
          episode_number,
          title,
          slug,
          content,
          price,
          is_free,
          status,
          visibility,
          created_at,
          updated_at
        FROM episodes
        WHERE story_id = ?
          AND (
            status = 'published'
            OR status IS NULL
          )
        ORDER BY episode_number ASC, created_at ASC
      `)
      .bind(storyId)
      .all();

    return json({
      success: true,
      episodes: result.results || []
    });
  } catch (error) {
    return errorResponse(
      "Failed to load episodes",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   GET /api/stories/:id/episodes/:episodeId
========================================================= */

async function episodeDetail(env, storyId, episodeId) {
  try {
    const episode = await env.D1
      .prepare(`
        SELECT
          e.id,
          e.story_id,
          e.episode_number,
          e.title,
          e.slug,
          e.content,
          e.price,
          e.is_free,
          e.status,
          e.visibility,
          e.created_at,
          e.updated_at,
          s.title AS story_title
        FROM episodes e
        LEFT JOIN stories s ON s.id = e.story_id
        WHERE e.id = ?
          AND e.story_id = ?
          AND (
            e.status = 'published'
            OR e.status IS NULL
          )
        LIMIT 1
      `)
      .bind(episodeId, storyId)
      .first();

    if (!episode) {
      return errorResponse("Episode not found", 404);
    }

    await increaseReaders(env, storyId);

    return json({
      success: true,
      episode
    });
  } catch (error) {
    return errorResponse(
      "Failed to load episode",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   REGISTER
========================================================= */

async function register(env, body) {
  const username = clean(body.username);
  const email = clean(body.email).toLowerCase();
  const password = clean(body.password);

  if (!username || !email || !password) {
    return errorResponse(
      "Username, email and password are required"
    );
  }

  if (username.length < 3) {
    return errorResponse("Username must be at least 3 characters");
  }

  if (password.length < 6) {
    return errorResponse("Password must be at least 6 characters");
  }

  if (!email.includes("@")) {
    return errorResponse("Invalid email address");
  }

  try {
    const existing = await env.D1
      .prepare(`
        SELECT id
        FROM users
        WHERE username = ?
           OR email = ?
        LIMIT 1
      `)
      .bind(username, email)
      .first();

    if (existing) {
      return errorResponse(
        "Username or email already exists",
        409
      );
    }

    const { salt, hash } = await hashPassword(password);
    const id = randomId("user_");
    const timestamp = now();

    await env.D1
      .prepare(`
        INSERT INTO users (
          id,
          username,
          email,
          password_hash,
          password_salt,
          role,
          status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, 'reader', 'active', ?, ?)
      `)
      .bind(
        id,
        username,
        email,
        hash,
        salt,
        timestamp,
        timestamp
      )
      .run();

    return json({
      success: true,
      message: "Registration successful",
      user: {
        id,
        username,
        email,
        role: "reader",
        status: "active",
        created_at: timestamp,
        updated_at: timestamp
      }
    }, 201);

  } catch (error) {
    return errorResponse(
      "Registration failed",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   LOGIN
========================================================= */

async function login(env, body) {
  const loginValue = clean(body.login || body.username || body.email);
  const password = clean(body.password);

  if (!loginValue || !password) {
    return errorResponse(
      "Login and password are required"
    );
  }

  try {
    const user = await env.D1
      .prepare(`
        SELECT
          id,
          username,
          email,
          password_hash,
          password_salt,
          role,
          status,
          created_at,
          updated_at
        FROM users
        WHERE username = ?
           OR email = ?
        LIMIT 1
      `)
      .bind(loginValue, loginValue.toLowerCase())
      .first();

    if (!user) {
      return errorResponse(
        "Invalid username/email or password",
        401
      );
    }

    if (user.status && user.status !== "active") {
      return errorResponse(
        "Your account is not active",
        403
      );
    }

    const valid = await verifyPassword(
      password,
      user.password_hash,
      user.password_salt
    );

    if (!valid) {
      return errorResponse(
        "Invalid username/email or password",
        401
      );
    }

    delete user.password_hash;
    delete user.password_salt;

    return json({
      success: true,
      message: "Login successful",
      user
    });

  } catch (error) {
    return errorResponse(
      "Login failed",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   AUTHOR LOGIN
========================================================= */

async function authorLogin(env, body) {
  const response = await login(env, body);

  if (response.status !== 200) {
    return response;
  }

  const data = await response.json();

  if (!data.user || data.user.role !== "author") {
    return errorResponse(
      "This account is not an author account",
      403
    );
  }

  return json({
    ...data,
    message: "Author login successful"
  });
}

/* =========================================================
   PROFILE
========================================================= */

async function profile(env, userId) {
  try {
    const user = await env.D1
      .prepare(`
        SELECT
          id,
          username,
          email,
          role,
          status,
          created_at,
          updated_at
        FROM users
        WHERE id = ?
        LIMIT 1
      `)
      .bind(userId)
      .first();

    if (!user) {
      return errorResponse("User not found", 404);
    }

    return json({
      success: true,
      user
    });
  } catch (error) {
    return errorResponse(
      "Failed to load profile",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   UPDATE PROFILE
========================================================= */

async function updateProfile(env, userId, body) {
  const username = clean(body.username);
  const email = clean(body.email).toLowerCase();

  if (!username && !email) {
    return errorResponse("Nothing to update");
  }

  try {
    const user = await getUser(env.D1, userId);

    if (!user) {
      return errorResponse("User not found", 404);
    }

    const timestamp = now();

    if (username && email) {
      await env.D1
        .prepare(`
          UPDATE users
          SET username = ?,
              email = ?,
              updated_at = ?
          WHERE id = ?
        `)
        .bind(username, email, timestamp, userId)
        .run();
    } else if (username) {
      await env.D1
        .prepare(`
          UPDATE users
          SET username = ?,
              updated_at = ?
          WHERE id = ?
        `)
        .bind(username, timestamp, userId)
        .run();
    } else {
      await env.D1
        .prepare(`
          UPDATE users
          SET email = ?,
              updated_at = ?
          WHERE id = ?
        `)
        .bind(email, timestamp, userId)
        .run();
    }

    return profile(env, userId);
  } catch (error) {
    return errorResponse(
      "Failed to update profile",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   BOOKMARKS
========================================================= */

async function getBookmarks(env, userId) {
  try {
    const result = await env.D1
      .prepare(`
        SELECT
          b.id,
          b.user_id,
          b.story_id,
          b.created_at,
          s.title,
          s.slug,
          s.description,
          s.cover_url,
          s.language,
          s.readers_count,
          a.display_name AS author_name,
          c.name AS category_name
        FROM bookmarks b
        LEFT JOIN stories s ON s.id = b.story_id
        LEFT JOIN authors a ON a.id = s.author_id
        LEFT JOIN categories c ON c.id = s.category_id
        WHERE b.user_id = ?
        ORDER BY b.created_at DESC
      `)
      .bind(userId)
      .all();

    return json({
      success: true,
      bookmarks: result.results || []
    });
  } catch (error) {
    return errorResponse(
      "Failed to load bookmarks",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   ADD BOOKMARK
========================================================= */

async function addBookmark(env, body) {
  const userId = clean(body.user_id);
  const storyId = clean(body.story_id);

  if (!userId || !storyId) {
    return errorResponse(
      "user_id and story_id are required"
    );
  }

  try {
    const existing = await env.D1
      .prepare(`
        SELECT id
        FROM bookmarks
        WHERE user_id = ?
          AND story_id = ?
        LIMIT 1
      `)
      .bind(userId, storyId)
      .first();

    if (existing) {
      return json({
        success: true,
        already_bookmarked: true,
        bookmark_id: existing.id
      });
    }

    const id = randomId("bookmark_");

    await env.D1
      .prepare(`
        INSERT INTO bookmarks (
          id,
          user_id,
          story_id,
          created_at
        )
        VALUES (?, ?, ?, ?)
      `)
      .bind(
        id,
        userId,
        storyId,
        now()
      )
      .run();

    return json({
      success: true,
      message: "Bookmark added",
      bookmark_id: id
    }, 201);

  } catch (error) {
    if (
      String(error.message || "").includes("UNIQUE")
    ) {
      return json({
        success: true,
        already_bookmarked: true
      });
    }

    return errorResponse(
      "Failed to add bookmark",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   DELETE BOOKMARK
========================================================= */

async function deleteBookmark(env, userId, storyId) {
  try {
    await env.D1
      .prepare(`
        DELETE FROM bookmarks
        WHERE user_id = ?
          AND story_id = ?
      `)
      .bind(userId, storyId)
      .run();

    return json({
      success: true,
      message: "Bookmark removed"
    });
  } catch (error) {
    return errorResponse(
      "Failed to remove bookmark",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   READING PROGRESS
========================================================= */

async function getReadingProgress(env, userId, storyId) {
  try {
    const result = await env.D1
      .prepare(`
        SELECT
          rp.*,
          e.title AS episode_title,
          e.episode_number,
          s.title AS story_title
        FROM reading_progress rp
        LEFT JOIN episodes e ON e.id = rp.episode_id
        LEFT JOIN stories s ON s.id = rp.story_id
        WHERE rp.user_id = ?
          AND rp.story_id = ?
        LIMIT 1
      `)
      .bind(userId, storyId)
      .first();

    return json({
      success: true,
      progress: result || null
    });
  } catch (error) {
    return errorResponse(
      "Failed to load reading progress",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   SAVE READING PROGRESS
========================================================= */

async function saveReadingProgress(env, body) {
  const userId = clean(body.user_id);
  const storyId = clean(body.story_id);
  const episodeId = clean(body.episode_id);

  let progress = Number(body.progress ?? 0);

  if (!userId || !storyId || !episodeId) {
    return errorResponse(
      "user_id, story_id and episode_id are required"
    );
  }

  if (!Number.isFinite(progress)) {
    progress = 0;
  }

  progress = Math.max(0, Math.min(100, progress));

  try {
    const episode = await env.D1
      .prepare(`
        SELECT id
        FROM episodes
        WHERE id = ?
          AND story_id = ?
        LIMIT 1
      `)
      .bind(episodeId, storyId)
      .first();

    if (!episode) {
      return errorResponse(
        "Episode does not belong to this story",
        400
      );
    }

    const existing = await env.D1
      .prepare(`
        SELECT id
        FROM reading_progress
        WHERE user_id = ?
          AND story_id = ?
        LIMIT 1
      `)
      .bind(userId, storyId)
      .first();

    const timestamp = now();

    if (existing) {
      await env.D1
        .prepare(`
          UPDATE reading_progress
          SET episode_id = ?,
              progress = ?,
              updated_at = ?
          WHERE user_id = ?
            AND story_id = ?
        `)
        .bind(
          episodeId,
          progress,
          timestamp,
          userId,
          storyId
        )
        .run();
    } else {
      const id = randomId("progress_");

      await env.D1
        .prepare(`
          INSERT INTO reading_progress (
            id,
            user_id,
            story_id,
            episode_id,
            progress,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          id,
          userId,
          storyId,
          episodeId,
          progress,
          timestamp,
          timestamp
        )
        .run();
    }

    return json({
      success: true,
      message: "Reading progress saved",
      progress
    });

  } catch (error) {
    return errorResponse(
      "Failed to save reading progress",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   READING HISTORY
========================================================= */

async function readingHistory(env, userId) {
  try {
    const result = await env.D1
      .prepare(`
        SELECT
          rp.id,
          rp.user_id,
          rp.story_id,
          rp.episode_id,
          rp.progress,
          rp.created_at,
          rp.updated_at,
          s.title AS story_title,
          s.slug AS story_slug,
          s.cover_url,
          e.title AS episode_title,
          e.episode_number,
          a.display_name AS author_name
        FROM reading_progress rp
        LEFT JOIN stories s ON s.id = rp.story_id
        LEFT JOIN episodes e ON e.id = rp.episode_id
        LEFT JOIN authors a ON a.id = s.author_id
        WHERE rp.user_id = ?
        ORDER BY rp.updated_at DESC
      `)
      .bind(userId)
      .all();

    return json({
      success: true,
      history: result.results || []
    });
  } catch (error) {
    return errorResponse(
      "Failed to load reading history",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   AUTHOR DASHBOARD
========================================================= */

async function authorDashboard(env, userId) {
  try {
    const user = await getUser(env.D1, userId);

    if (!user || user.role !== "author") {
      return errorResponse(
        "Author account required",
        403
      );
    }

    const author = await env.D1
      .prepare(`
        SELECT
          id,
          display_name
        FROM authors
        WHERE user_id = ?
        LIMIT 1
      `)
      .bind(userId)
      .first();

    if (!author) {
      return errorResponse(
        "Author profile not found",
        404
      );
    }

    const storiesCount = await safeFirst(
      env.D1,
      `
        SELECT COUNT(*) AS count
        FROM stories
        WHERE author_id = ?
      `,
      [author.id]
    );

    const publishedCount = await safeFirst(
      env.D1,
      `
        SELECT COUNT(*) AS count
        FROM stories
        WHERE author_id = ?
          AND status = 'published'
      `,
      [author.id]
    );

    const readers = await safeFirst(
      env.D1,
      `
        SELECT COALESCE(SUM(readers_count), 0) AS readers
        FROM stories
        WHERE author_id = ?
      `,
      [author.id]
    );

    const episodes = await safeFirst(
      env.D1,
      `
        SELECT COUNT(*) AS count
        FROM episodes e
        INNER JOIN stories s ON s.id = e.story_id
        WHERE s.author_id = ?
      `,
      [author.id]
    );

    return json({
      success: true,
      author,
      stats: {
        stories: Number(storiesCount?.count || 0),
        published_stories: Number(publishedCount?.count || 0),
        readers: Number(readers?.readers || 0),
        episodes: Number(episodes?.count || 0)
      }
    });

  } catch (error) {
    return errorResponse(
      "Failed to load author dashboard",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   AUTHOR STORIES
========================================================= */

async function authorStories(env, userId) {
  try {
    const author = await env.D1
      .prepare(`
        SELECT id, display_name
        FROM authors
        WHERE user_id = ?
        LIMIT 1
      `)
      .bind(userId)
      .first();

    if (!author) {
      return errorResponse(
        "Author profile not found",
        404
      );
    }

    const result = await env.D1
      .prepare(`
        SELECT
          s.*,
          c.name AS category_name
        FROM stories s
        LEFT JOIN categories c ON c.id = s.category_id
        WHERE s.author_id = ?
        ORDER BY s.created_at DESC
      `)
      .bind(author.id)
      .all();

    return json({
      success: true,
      author,
      stories: result.results || []
    });
  } catch (error) {
    return errorResponse(
      "Failed to load author stories",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   AUTHOR EPISODES
========================================================= */

async function authorEpisodes(env, userId, storyId) {
  try {
    const author = await env.D1
      .prepare(`
        SELECT id
        FROM authors
        WHERE user_id = ?
        LIMIT 1
      `)
      .bind(userId)
      .first();

    if (!author) {
      return errorResponse(
        "Author profile not found",
        404
      );
    }

    const story = await env.D1
      .prepare(`
        SELECT id, title
        FROM stories
        WHERE id = ?
          AND author_id = ?
        LIMIT 1
      `)
      .bind(storyId, author.id)
      .first();

    if (!story) {
      return errorResponse(
        "Story not found or not owned by author",
        403
      );
    }

    const result = await env.D1
      .prepare(`
        SELECT *
        FROM episodes
        WHERE story_id = ?
        ORDER BY episode_number ASC, created_at ASC
      `)
      .bind(storyId)
      .all();

    return json({
      success: true,
      story,
      episodes: result.results || []
    });
  } catch (error) {
    return errorResponse(
      "Failed to load author episodes",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   AUTHOR CREATE STORY
========================================================= */

async function authorCreateStory(env, userId, body) {
  try {
    const author = await env.D1
      .prepare(`
        SELECT id, display_name
        FROM authors
        WHERE user_id = ?
        LIMIT 1
      `)
      .bind(userId)
      .first();

    if (!author) {
      return errorResponse(
        "Author profile not found",
        404
      );
    }

    const title = clean(body.title);
    const description = clean(body.description);
    const coverUrl = clean(body.cover_url);
    const language = clean(body.language) || "sw";
    const categoryId = clean(body.category_id);

    if (!title) {
      return errorResponse("Story title is required");
    }

    const id = randomId("story_");

    const slug =
      clean(body.slug) ||
      title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");

    const timestamp = now();

    await env.D1
      .prepare(`
        INSERT INTO stories (
          id,
          title,
          slug,
          description,
          cover_url,
          language,
          status,
          visibility,
          readers_count,
          author_id,
          category_id,
          created_at,
          updated_at
        )
        VALUES (
          ?, ?, ?, ?, ?, ?,
          'draft',
          'private',
          0,
          ?, ?, ?, ?
        )
      `)
      .bind(
        id,
        title,
        slug,
        description,
        coverUrl,
        language,
        author.id,
        categoryId || null,
        timestamp,
        timestamp
      )
      .run();

    return json({
      success: true,
      message: "Story created as draft",
      story_id: id
    }, 201);

  } catch (error) {
    return errorResponse(
      "Failed to create story",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   AUTHOR UPDATE STORY
========================================================= */

async function authorUpdateStory(env, userId, storyId, body) {
  try {
    const author = await env.D1
      .prepare(`
        SELECT id
        FROM authors
        WHERE user_id = ?
        LIMIT 1
      `)
      .bind(userId)
      .first();

    if (!author) {
      return errorResponse(
        "Author profile not found",
        404
      );
    }

    const story = await env.D1
      .prepare(`
        SELECT id
        FROM stories
        WHERE id = ?
          AND author_id = ?
        LIMIT 1
      `)
      .bind(storyId, author.id)
      .first();

    if (!story) {
      return errorResponse(
        "Story not found or not owned by author",
        403
      );
    }

    const title = clean(body.title);
    const description = clean(body.description);
    const coverUrl = clean(body.cover_url);
    const language = clean(body.language);
    const categoryId = clean(body.category_id);
    const timestamp = now();

    await env.D1
      .prepare(`
        UPDATE stories
        SET
          title = COALESCE(NULLIF(?, ''), title),
          description = COALESCE(NULLIF(?, ''), description),
          cover_url = COALESCE(NULLIF(?, ''), cover_url),
          language = COALESCE(NULLIF(?, ''), language),
          category_id = COALESCE(NULLIF(?, ''), category_id),
          updated_at = ?
        WHERE id = ?
          AND author_id = ?
      `)
      .bind(
        title,
        description,
        coverUrl,
        language,
        categoryId,
        timestamp,
        storyId,
        author.id
      )
      .run();

    return json({
      success: true,
      message: "Story updated"
    });

  } catch (error) {
    return errorResponse(
      "Failed to update story",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   AUTHOR CREATE EPISODE
========================================================= */

async function authorCreateEpisode(env, userId, storyId, body) {
  try {
    const author = await env.D1
      .prepare(`
        SELECT id
        FROM authors
        WHERE user_id = ?
        LIMIT 1
      `)
      .bind(userId)
      .first();

    if (!author) {
      return errorResponse(
        "Author profile not found",
        404
      );
    }

    const story = await env.D1
      .prepare(`
        SELECT id
        FROM stories
        WHERE id = ?
          AND author_id = ?
        LIMIT 1
      `)
      .bind(storyId, author.id)
      .first();

    if (!story) {
      return errorResponse(
        "Story not found or not owned by author",
        403
      );
    }

    const title = clean(body.title);
    const content = clean(body.content);
    const slug = clean(body.slug);
    const episodeNumber = Number(body.episode_number || 1);
    const price = Number(body.price || 0);
    const isFree =
      body.is_free === true ||
      body.is_free === 1 ||
      body.is_free === "1";

    if (!title || !content) {
      return errorResponse(
        "Episode title and content are required"
      );
    }

    const id = randomId("episode_");
    const timestamp = now();

    await env.D1
      .prepare(`
        INSERT INTO episodes (
          id,
          story_id,
          episode_number,
          title,
          slug,
          content,
          price,
          is_free,
          status,
          visibility,
          created_at,
          updated_at
        )
        VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          'draft',
          'private',
          ?, ?
        )
      `)
      .bind(
        id,
        storyId,
        episodeNumber,
        title,
        slug,
        content,
        price,
        isFree ? 1 : 0,
        timestamp,
        timestamp
      )
      .run();

    return json({
      success: true,
      message: "Episode created as draft",
      episode_id: id
    }, 201);

  } catch (error) {
    return errorResponse(
      "Failed to create episode",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   AUTHOR UPDATE EPISODE
========================================================= */

async function authorUpdateEpisode(env, userId, episodeId, body) {
  try {
    const author = await env.D1
      .prepare(`
        SELECT id
        FROM authors
        WHERE user_id = ?
        LIMIT 1
      `)
      .bind(userId)
      .first();

    if (!author) {
      return errorResponse(
        "Author profile not found",
        404
      );
    }

    const episode = await env.D1
      .prepare(`
        SELECT e.id
        FROM episodes e
        INNER JOIN stories s ON s.id = e.story_id
        WHERE e.id = ?
          AND s.author_id = ?
        LIMIT 1
      `)
      .bind(episodeId, author.id)
      .first();

    if (!episode) {
      return errorResponse(
        "Episode not found or not owned by author",
        403
      );
    }

    const title = clean(body.title);
    const content = clean(body.content);
    const price = Number(body.price || 0);
    const timestamp = now();

    await env.D1
      .prepare(`
        UPDATE episodes
        SET
          title = COALESCE(NULLIF(?, ''), title),
          content = COALESCE(NULLIF(?, ''), content),
          price = ?,
          updated_at = ?
        WHERE id = ?
      `)
      .bind(
        title,
        content,
        price,
        timestamp,
        episodeId
      )
      .run();

    return json({
      success: true,
      message: "Episode updated"
    });

  } catch (error) {
    return errorResponse(
      "Failed to update episode",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   AUTHOR DELETE EPISODE
========================================================= */

async function authorDeleteEpisode(env, userId, episodeId) {
  try {
    const author = await env.D1
      .prepare(`
        SELECT id
        FROM authors
        WHERE user_id = ?
        LIMIT 1
      `)
      .bind(userId)
      .first();

    if (!author) {
      return errorResponse(
        "Author profile not found",
        404
      );
    }

    const episode = await env.D1
      .prepare(`
        SELECT e.id
        FROM episodes e
        INNER JOIN stories s ON s.id = e.story_id
        WHERE e.id = ?
          AND s.author_id = ?
        LIMIT 1
      `)
      .bind(episodeId, author.id)
      .first();

    if (!episode) {
      return errorResponse(
        "Episode not found or not owned by author",
        403
      );
    }

    await env.D1
      .prepare(`
        DELETE FROM episodes
        WHERE id = ?
      `)
      .bind(episodeId)
      .run();

    return json({
      success: true,
      message: "Episode deleted"
    });

  } catch (error) {
    return errorResponse(
      "Failed to delete episode",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   ADMIN DASHBOARD
========================================================= */

async function adminDashboard(env, userId) {
  const auth = await requireAdmin(env.D1, userId);

  if (!auth.ok) return auth.response;

  try {
    const users = await safeFirst(
      env.D1,
      "SELECT COUNT(*) AS count FROM users"
    );

    const authors = await safeFirst(
      env.D1,
      "SELECT COUNT(*) AS count FROM authors"
    );

    const stories = await safeFirst(
      env.D1,
      "SELECT COUNT(*) AS count FROM stories"
    );

    const published = await safeFirst(
      env.D1,
      `
        SELECT COUNT(*) AS count
        FROM stories
        WHERE status = 'published'
      `
    );

    const episodes = await safeFirst(
      env.D1,
      "SELECT COUNT(*) AS count FROM episodes"
    );

    return json({
      success: true,
      stats: {
        users: Number(users?.count || 0),
        authors: Number(authors?.count || 0),
        stories: Number(stories?.count || 0),
        published_stories: Number(published?.count || 0),
        episodes: Number(episodes?.count || 0)
      }
    });
  } catch (error) {
    return errorResponse(
      "Failed to load admin dashboard",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   ADMIN USERS
========================================================= */

async function adminUsers(env, userId) {
  const auth = await requireAdmin(env.D1, userId);

  if (!auth.ok) return auth.response;

  try {
    const result = await env.D1
      .prepare(`
        SELECT
          id,
          username,
          email,
          role,
          status,
          created_at,
          updated_at
        FROM users
        ORDER BY created_at DESC
      `)
      .all();

    return json({
      success: true,
      users: result.results || []
    });
  } catch (error) {
    return errorResponse(
      "Failed to load users",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   ADMIN AUTHORS
========================================================= */

async function adminAuthors(env, userId) {
  const auth = await requireAdmin(env.D1, userId);

  if (!auth.ok) return auth.response;

  try {
    const result = await env.D1
      .prepare(`
        SELECT
          a.*,
          u.username,
          u.email,
          u.status AS user_status
        FROM authors a
        LEFT JOIN users u ON u.id = a.user_id
        ORDER BY a.display_name ASC
      `)
      .all();

    return json({
      success: true,
      authors: result.results || []
    });
  } catch (error) {
    return errorResponse(
      "Failed to load admin authors",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   ADMIN CREATE AUTHOR
========================================================= */

async function adminCreateAuthor(env, userId, body) {
  const auth = await requireAdmin(env.D1, userId);

  if (!auth.ok) return auth.response;

  const username = clean(body.username);
  const email = clean(body.email).toLowerCase();
  const password = clean(body.password);
  const displayName =
    clean(body.display_name) ||
    clean(body.name) ||
    username;

  if (!username || !email || !password || !displayName) {
    return errorResponse(
      "username, email, password and display_name are required"
    );
  }

  if (password.length < 6) {
    return errorResponse(
      "Password must be at least 6 characters"
    );
  }

  try {
    const existing = await env.D1
      .prepare(`
        SELECT id
        FROM users
        WHERE username = ?
           OR email = ?
        LIMIT 1
      `)
      .bind(username, email)
      .first();

    if (existing) {
      return errorResponse(
        "Username or email already exists",
        409
      );
    }

    const { salt, hash } = await hashPassword(password);

    const newUserId = randomId("user_");
    const authorId = randomId("author_");
    const timestamp = now();

    await env.D1
      .prepare(`
        INSERT INTO users (
          id,
          username,
          email,
          password_hash,
          password_salt,
          role,
          status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, 'author', 'active', ?, ?)
      `)
      .bind(
        newUserId,
        username,
        email,
        hash,
        salt,
        timestamp,
        timestamp
      )
      .run();

    await env.D1
      .prepare(`
        INSERT INTO authors (
          id,
          user_id,
          display_name
        )
        VALUES (?, ?, ?)
      `)
      .bind(
        authorId,
        newUserId,
        displayName
      )
      .run();

    return json({
      success: true,
      message: "Author account created",
      user: {
        id: newUserId,
        username,
        email,
        role: "author",
        status: "active"
      },
      author: {
        id: authorId,
        display_name: displayName
      }
    }, 201);

  } catch (error) {
    return errorResponse(
      "Failed to create author",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   ADMIN UPDATE USER STATUS
========================================================= */

async function adminUpdateUser(env, adminId, targetUserId, body) {
  const auth = await requireAdmin(env.D1, adminId);

  if (!auth.ok) return auth.response;

  const status = clean(body.status);

  if (!["active", "inactive", "suspended", "blocked"].includes(status)) {
    return errorResponse(
      "Invalid status"
    );
  }

  try {
    await env.D1
      .prepare(`
        UPDATE users
        SET status = ?,
            updated_at = ?
        WHERE id = ?
      `)
      .bind(
        status,
        now(),
        targetUserId
      )
      .run();

    return json({
      success: true,
      message: "User status updated"
    });
  } catch (error) {
    return errorResponse(
      "Failed to update user",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   ADMIN STORIES
========================================================= */

async function adminStories(env, userId, url) {
  const auth = await requireAdmin(env.D1, userId);

  if (!auth.ok) return auth.response;

  try {
    let sql = `
      SELECT
        s.*,
        a.display_name AS author_name,
        c.name AS category_name
      FROM stories s
      LEFT JOIN authors a ON a.id = s.author_id
      LEFT JOIN categories c ON c.id = s.category_id
    `;

    const status = clean(url.searchParams.get("status"));
    const bindings = [];

    if (status) {
      sql += " WHERE s.status = ?";
      bindings.push(status);
    }

    sql += " ORDER BY s.created_at DESC";

    const result = await env.D1
      .prepare(sql)
      .bind(...bindings)
      .all();

    return json({
      success: true,
      stories: result.results || []
    });
  } catch (error) {
    return errorResponse(
      "Failed to load admin stories",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   ADMIN PUBLISH STORY
========================================================= */

async function adminPublishStory(env, userId, storyId) {
  const auth = await requireAdmin(env.D1, userId);

  if (!auth.ok) return auth.response;

  try {
    await env.D1
      .prepare(`
        UPDATE stories
        SET
          status = 'published',
          visibility = 'public',
          updated_at = ?
        WHERE id = ?
      `)
      .bind(
        now(),
        storyId
      )
      .run();

    return json({
      success: true,
      message: "Story published"
    });
  } catch (error) {
    return errorResponse(
      "Failed to publish story",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   ADMIN REJECT STORY
========================================================= */

async function adminRejectStory(env, userId, storyId) {
  const auth = await requireAdmin(env.D1, userId);

  if (!auth.ok) return auth.response;

  try {
    await env.D1
      .prepare(`
        UPDATE stories
        SET
          status = 'rejected',
          visibility = 'private',
          updated_at = ?
        WHERE id = ?
      `)
      .bind(
        now(),
        storyId
      )
      .run();

    return json({
      success: true,
      message: "Story rejected"
    });
  } catch (error) {
    return errorResponse(
      "Failed to reject story",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   ADMIN PUBLISH EPISODE
========================================================= */

async function adminPublishEpisode(env, userId, episodeId) {
  const auth = await requireAdmin(env.D1, userId);

  if (!auth.ok) return auth.response;

  try {
    await env.D1
      .prepare(`
        UPDATE episodes
        SET
          status = 'published',
          visibility = 'public',
          updated_at = ?
        WHERE id = ?
      `)
      .bind(
        now(),
        episodeId
      )
      .run();

    return json({
      success: true,
      message: "Episode published"
    });
  } catch (error) {
    return errorResponse(
      "Failed to publish episode",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   ADMIN CATEGORIES
========================================================= */

async function adminCategories(env, userId) {
  const auth = await requireAdmin(env.D1, userId);

  if (!auth.ok) return auth.response;

  try {
    const result = await env.D1
      .prepare(`
        SELECT *
        FROM categories
        ORDER BY name ASC
      `)
      .all();

    return json({
      success: true,
      categories: result.results || []
    });
  } catch (error) {
    return errorResponse(
      "Failed to load categories",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   ADMIN CREATE CATEGORY
========================================================= */

async function adminCreateCategory(env, userId, body) {
  const auth = await requireAdmin(env.D1, userId);

  if (!auth.ok) return auth.response;

  const name = clean(body.name);
  const language = clean(body.language) || "both";

  if (!name) {
    return errorResponse("Category name is required");
  }

  const slug =
    clean(body.slug) ||
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");

  try {
    const id = randomId("category_");
    const timestamp = now();

    await env.D1
      .prepare(`
        INSERT INTO categories (
          id,
          name,
          slug,
          language,
          status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, 'active', ?, ?)
      `)
      .bind(
        id,
        name,
        slug,
        language,
        timestamp,
        timestamp
      )
      .run();

    return json({
      success: true,
      message: "Category created",
      category_id: id
    }, 201);

  } catch (error) {
    return errorResponse(
      "Failed to create category",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   ADMIN DELETE CATEGORY
========================================================= */

async function adminDeleteCategory(env, userId, categoryId) {
  const auth = await requireAdmin(env.D1, userId);

  if (!auth.ok) return auth.response;

  try {
    await env.D1
      .prepare(`
        UPDATE categories
        SET
          status = 'inactive',
          updated_at = ?
        WHERE id = ?
      `)
      .bind(
        now(),
        categoryId
      )
      .run();

    return json({
      success: true,
      message: "Category disabled"
    });
  } catch (error) {
    return errorResponse(
      "Failed to delete category",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   R2 TEST
========================================================= */

async function r2Test(env) {
  try {
    if (!env.R2) {
      return errorResponse(
        "R2 binding not found",
        500
      );
    }

    const objects = await env.R2.list({
      limit: 10
    });

    return json({
      success: true,
      message: "R2 connection successful",
      objects: objects.objects.map(obj => ({
        key: obj.key,
        size: obj.size,
        uploaded: obj.uploaded
      }))
    });
  } catch (error) {
    return errorResponse(
      "R2 connection failed",
      500,
      { error: error.message }
    );
  }
}

/* =========================================================
   MAIN FUNCTION
========================================================= */

export async function onRequest(context) {

  const {
    request,
    env
  } = context;

  const url = new URL(request.url);

  /*
   * Remove /api from path.
   *
   * Example:
   * /api/stories
   * becomes:
   * /stories
   */

  let path = url.pathname
    .replace(/^\/api/, "")
    .replace(/\/+$/, "");

  if (!path) {
    path = "/";
  }

  const method = request.method.toUpperCase();

  /* =======================================================
     CORS / OPTIONS
  ======================================================= */

  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: JSON_HEADERS
    });
  }

  /* =======================================================
     BASIC API CHECK
  ======================================================= */

  if (path === "/" || path === "") {
    return json({
      success: true,
      name: "Net Simulizi API",
      version: "1.0.0",
      message: "API is running"
    });
  }

  /* =======================================================
     GET ROUTES
  ======================================================= */

  if (method === "GET") {

    if (path === "/health") {
      return health(env);
    }

    if (path === "/test") {
      return test(env);
    }

    if (path === "/db-test") {
      return dbTest(env);
    }

    if (path === "/r2-test") {
      return r2Test(env);
    }

    if (path === "/categories") {
      return categories(env, url);
    }

    if (path === "/genres") {
      return genres(env, url);
    }

    if (path === "/authors") {
      return authors(env, url);
    }

    if (path.startsWith("/authors/")) {
      const parts = path.split("/").filter(Boolean);

      if (parts.length === 2) {
        return authorProfile(env, parts[1]);
      }
    }

    if (path === "/stories") {
      return stories(env, url);
    }

    if (path === "/stories/search") {
      return storySearch(env, url);
    }

    if (path === "/stories/trending") {
      return trendingStories(env, url);
    }

    if (path.startsWith("/stories/")) {

      const parts = path.split("/").filter(Boolean);

      /*
       * /stories/:id/episodes/:episodeId
       */

      if (
        parts.length === 4 &&
        parts[2] === "episodes"
      ) {
        return episodeDetail(
          env,
          parts[1],
          parts[3]
        );
      }

      /*
       * /stories/:id/episodes
       */

      if (
        parts.length === 3 &&
        parts[2] === "episodes"
      ) {
        return storyEpisodes(
          env,
          parts[1]
        );
      }

      /*
       * /stories/:id
       */

      if (parts.length === 2) {
        return storyDetail(
          env,
          parts[1]
        );
      }
    }

    if (path.startsWith("/profile/")) {
      const parts = path.split("/").filter(Boolean);

      if (parts.length === 2) {
        return profile(
          env,
          parts[1]
        );
      }
    }

    if (path.startsWith("/bookmarks/")) {
      const parts = path.split("/").filter(Boolean);

      if (parts.length === 2) {
        return getBookmarks(
          env,
          parts[1]
        );
      }
    }

    if (path.startsWith("/reading-progress/")) {
      const parts = path.split("/").filter(Boolean);

      if (parts.length === 3) {
        return getReadingProgress(
          env,
          parts[1],
          parts[2]
        );
      }
    }

    if (path.startsWith("/reading-history/")) {
      const parts = path.split("/").filter(Boolean);

      if (parts.length === 2) {
        return readingHistory(
          env,
          parts[1]
        );
      }
    }

    /* =====================================================
       AUTHOR GET ROUTES
    ===================================================== */

    if (path.startsWith("/author/")) {

      const parts = path.split("/").filter(Boolean);

      /*
       * /author/:userId/dashboard
       */

      if (
        parts.length === 3 &&
        parts[2] === "dashboard"
      ) {
        return authorDashboard(
          env,
          parts[1]
        );
      }

      /*
       * /author/:userId/stories
       */

      if (
        parts.length === 3 &&
        parts[2] === "stories"
      ) {
        return authorStories(
          env,
          parts[1]
        );
      }

      /*
       * /author/:userId/stories/:storyId/episodes
       */

      if (
        parts.length === 5 &&
        parts[2] === "stories" &&
        parts[4] === "episodes"
      ) {
        return authorEpisodes(
          env,
          parts[1],
          parts[3]
        );
      }
    }

    /* =====================================================
       ADMIN GET ROUTES
    ===================================================== */

    if (path === "/admin/dashboard") {
      const userId =
        clean(url.searchParams.get("user_id"));

      return adminDashboard(
        env,
        userId
      );
    }

    if (path === "/admin/users") {
      const userId =
        clean(url.searchParams.get("user_id"));

      return adminUsers(
        env,
        userId
      );
    }

    if (path === "/admin/authors") {
      const userId =
        clean(url.searchParams.get("user_id"));

      return adminAuthors(
        env,
        userId
      );
    }

    if (path === "/admin/categories") {
      const userId =
        clean(url.searchParams.get("user_id"));

      return adminCategories(
        env,
        userId
      );
    }

    if (path === "/admin/stories") {
      const userId =
        clean(url.searchParams.get("user_id"));

      return adminStories(
        env,
        userId,
        url
      );
    }
  }

  /* =======================================================
     POST ROUTES
  ======================================================= */

  if (method === "POST") {

    const body = await readJson(request);

    if (path === "/register") {
      return register(
        env,
        body
      );
    }

    if (path === "/login") {
      return login(
        env,
        body
      );
    }

    if (
      path === "/author/login" ||
      path === "/author-login"
    ) {
      return authorLogin(
        env,
        body
      );
    }

    if (path === "/bookmarks") {
      return addBookmark(
        env,
        body
      );
    }

    if (path === "/reading-progress") {
      return saveReadingProgress(
        env,
        body
      );
    }

    /* =====================================================
       AUTHOR POST
    ===================================================== */

    if (path.startsWith("/author/")) {

      const parts = path.split("/").filter(Boolean);

      /*
       * /author/:userId/stories
       */

      if (
        parts.length === 3 &&
        parts[2] === "stories"
      ) {
        return authorCreateStory(
          env,
          parts[1],
          body
        );
      }

      /*
       * /author/:userId/stories/:storyId/episodes
       */

      if (
        parts.length === 5 &&
        parts[2] === "stories" &&
        parts[4] === "episodes"
      ) {
        return authorCreateEpisode(
          env,
          parts[1],
          parts[3],
          body
        );
      }
    }

    /* =====================================================
       ADMIN POST
    ===================================================== */

    if (path === "/admin/authors") {
      const adminId =
        clean(body.user_id || body.admin_id);

      return adminCreateAuthor(
        env,
        adminId,
        body
      );
    }

    if (path === "/admin/categories") {
      const adminId =
        clean(body.user_id || body.admin_id);

      return adminCreateCategory(
        env,
        adminId,
        body
      );
    }

    if (path.startsWith("/admin/stories/")) {
      const parts = path.split("/").filter(Boolean);

      /*
       * /admin/stories/:id/publish
       */

      if (
        parts.length === 4 &&
        parts[3] === "publish"
      ) {
        return adminPublishStory(
          env,
          clean(body.user_id || body.admin_id),
          parts[2]
        );
      }

      /*
       * /admin/stories/:id/reject
       */

      if (
        parts.length === 4 &&
        parts[3] === "reject"
      ) {
        return adminRejectStory(
          env,
          clean(body.user_id || body.admin_id),
          parts[2]
        );
      }
    }

    if (path.startsWith("/admin/episodes/")) {
      const parts = path.split("/").filter(Boolean);

      if (
        parts.length === 4 &&
        parts[3] === "publish"
      ) {
        return adminPublishEpisode(
          env,
          clean(body.user_id || body.admin_id),
          parts[2]
        );
      }
    }
  }

  /* =======================================================
     PUT / PATCH
  ======================================================= */

  if (method === "PUT" || method === "PATCH") {

    const body = await readJson(request);

    /* =====================================================
       PROFILE
    ===================================================== */

    if (path.startsWith("/profile/")) {
      const parts = path.split("/").filter(Boolean);

      if (parts.length === 2) {
        return updateProfile(
          env,
          parts[1],
          body
        );
      }
    }

    /* =====================================================
       AUTHOR STORY
    ===================================================== */

    if (path.startsWith("/author/")) {

      const parts = path.split("/").filter(Boolean);

      /*
       * /author/:userId/stories/:storyId
       */

      if (
        parts.length === 4 &&
        parts[2] === "stories"
      ) {
        return authorUpdateStory(
          env,
          parts[1],
          parts[3],
          body
        );
      }

      /*
       * /author/:userId/episodes/:episodeId
       */

      if (
        parts.length === 4 &&
        parts[2] === "episodes"
      ) {
        return authorUpdateEpisode(
          env,
          parts[1],
          parts[3],
          body
        );
      }
    }

    /* =====================================================
       ADMIN USER
    ===================================================== */

    if (path.startsWith("/admin/users/")) {
      const parts = path.split("/").filter(Boolean);

      if (parts.length === 3) {
        return adminUpdateUser(
          env,
          clean(body.user_id || body.admin_id),
          parts[2],
          body
        );
      }
    }
  }

  /* =======================================================
     DELETE
  ======================================================= */

  if (method === "DELETE") {

    /* =====================================================
       BOOKMARK
    ===================================================== */

    if (path.startsWith("/bookmarks/")) {

      const parts = path.split("/").filter(Boolean);

      /*
       * /bookmarks/:userId/:storyId
       */

      if (parts.length === 3) {
        return deleteBookmark(
          env,
          parts[1],
          parts[2]
        );
      }
    }

    /* =====================================================
       AUTHOR EPISODE
    ===================================================== */

    if (path.startsWith("/author/")) {

      const parts = path.split("/").filter(Boolean);

      /*
       * /author/:userId/episodes/:episodeId
       */

      if (
        parts.length === 4 &&
        parts[2] === "episodes"
      ) {
        return authorDeleteEpisode(
          env,
          parts[1],
          parts[3]
        );
      }
    }

    /* =====================================================
       ADMIN CATEGORY
    ===================================================== */

    if (path.startsWith("/admin/categories/")) {

      const parts = path.split("/").filter(Boolean);

      if (parts.length === 3) {

        const userId =
          clean(
            new URL(request.url)
              .searchParams
              .get("user_id")
          );

        return adminDeleteCategory(
          env,
          userId,
          parts[2]
        );
      }
    }
  }

  /* =======================================================
     NOT FOUND
  ======================================================= */

  return errorResponse(
    "Endpoint not found",
    404,
    {
      path,
      method
    }
  );
}
