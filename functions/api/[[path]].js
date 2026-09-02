function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        }
    });
}

function errorResponse(message, status = 400) {
    return json({
        success: false,
        message
    }, status);
}

async function readJson(request) {
    try {
        return await request.json();
    } catch {
        return null;
    }
}

/* =========================
   PASSWORD HASHING
========================= */

function bytesToBase64(bytes) {
    let binary = "";

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
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

    const salt = crypto.getRandomValues(
        new Uint8Array(16)
    );

    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        {
            name: "PBKDF2"
        },
        false,
        ["deriveBits"]
    );

const iterations = 1000;

    const hash = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt,
            iterations,
            hash: "SHA-256"
        },
        key,
        256
    );

    return `pbkdf2$${iterations}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(hash))}`;
}

async function verifyPassword(password, storedHash) {
    try {
        const parts = storedHash.split("$");

        if (parts.length !== 4) {
            return false;
        }

        const algorithm = parts[0];
        const iterations = Number(parts[1]);
        const salt = base64ToBytes(parts[2]);
        const originalHash = base64ToBytes(parts[3]);

        if (algorithm !== "pbkdf2") {
            return false;
        }

        if (!Number.isInteger(iterations) || iterations <= 0) {
            return false;
        }

        const encoder = new TextEncoder();

        const key = await crypto.subtle.importKey(
            "raw",
            encoder.encode(password),
            {
                name: "PBKDF2"
            },
            false,
            ["deriveBits"]
        );

        const hash = await crypto.subtle.deriveBits(
            {
                name: "PBKDF2",
                salt,
                iterations,
                hash: "SHA-256"
            },
            key,
            256
        );

        const newHash = new Uint8Array(hash);

        if (newHash.length !== originalHash.length) {
            return false;
        }

        let difference = 0;

        for (let i = 0; i < newHash.length; i++) {
            difference |= newHash[i] ^ originalHash[i];
        }

        return difference === 0;

    } catch {
        return false;
    }
}

/* =========================
   MAIN API
========================= */

export async function onRequest(context) {

    const {
        request,
        env
    } = context;

    /* =========================
       CORS PREFLIGHT
    ========================= */

    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            }
        });
    }

    /* =========================
       GET REQUEST
    ========================= */

    if (request.method === "GET") {

        const url = new URL(request.url);

        let path = url.pathname;

        if (path.startsWith("/api")) {
            path = path.substring(4);
        }

        if (path === "") {
            path = "/";
        }

        /* =========================
           HEALTH
        ========================= */

        if (path === "/health") {
            return json({
                success: true,
                message: "Net Simulizi API is running",
                service: "netsimulizi-api"
            });
        }

        /* =========================
           TEST
        ========================= */

        if (path === "/test") {
            return json({
                success: true,
                message: "Net Simulizi API test successful"
            });
        }

        /* =========================
           DATABASE TEST
        ========================= */

        if (path === "/db-test") {

            try {

                const result = await env.D1
                    .prepare("SELECT 1 AS test")
                    .first();

                return json({
                    success: true,
                    message: "D1 database connection successful",
                    database: "netsimulizi",
                    result
                });

            } catch (error) {

                return errorResponse(
                    "D1 database connection failed",
                    500
                );
            }
        }

        /* =========================
           CATEGORIES
        ========================= */

        if (path === "/categories") {

            try {

                const result = await env.D1
                    .prepare(`
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
                        ORDER BY name ASC
                    `)
                    .all();

                return json({
                    success: true,
                    count: result.results.length,
                    categories: result.results
                });

            } catch (error) {

                return errorResponse(
                    "Failed to load categories",
                    500
                );
            }
        }

        /* =========================
           STORIES
        ========================= */

        if (path === "/stories") {

            try {

                const result = await env.D1
                    .prepare(`
                        SELECT
                            s.id,
                            s.author_id,
                            s.category_id,
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
                        LEFT JOIN authors a
                            ON s.author_id = a.id
                        LEFT JOIN categories c
                            ON s.category_id = c.id
                        WHERE s.status = 'published'
                        AND s.visibility = 'public'
                        ORDER BY s.created_at DESC
                    `)
                    .all();

                return json({
                    success: true,
                    count: result.results.length,
                    stories: result.results
                });

            } catch (error) {

                return errorResponse(
                    "Failed to load stories",
                    500
                );
            }
        }

        /* =========================
           SINGLE STORY
        ========================= */

        if (path.startsWith("/stories/")) {

            const parts = path.split("/").filter(Boolean);

            if (parts.length === 2) {

                const storyId = Number(parts[1]);

                if (!Number.isInteger(storyId)) {
                    return errorResponse(
                        "Invalid story ID",
                        400
                    );
                }

                try {

                    const story = await env.D1
                        .prepare(`
                            SELECT
                                s.id,
                                s.author_id,
                                s.category_id,
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
                            LEFT JOIN authors a
                                ON s.author_id = a.id
                            LEFT JOIN categories c
                                ON s.category_id = c.id
                            WHERE s.id = ?
                            AND s.status = 'published'
                            AND s.visibility = 'public'
                            LIMIT 1
                        `)
                        .bind(storyId)
                        .first();

                    if (!story) {
                        return errorResponse(
                            "Story not found",
                            404
                        );
                    }

                    return json({
                        success: true,
                        story
                    });

                } catch (error) {

                    return errorResponse(
                        "Failed to load story",
                        500
                    );
                }
            }

            /* =========================
               STORY EPISODES
            ========================= */

            if (
                parts.length === 3 &&
                parts[2] === "episodes"
            ) {

                const storyId = Number(parts[1]);

                if (!Number.isInteger(storyId)) {
                    return errorResponse(
                        "Invalid story ID",
                        400
                    );
                }

                try {

                    const story = await env.D1
                        .prepare(`
                            SELECT id, title
                            FROM stories
                            WHERE id = ?
                            AND status = 'published'
                            AND visibility = 'public'
                            LIMIT 1
                        `)
                        .bind(storyId)
                        .first();

                    if (!story) {
                        return errorResponse(
                            "Story not found",
                            404
                        );
                    }

                    const episodes = await env.D1
                        .prepare(`
                            SELECT
                                id,
                                story_id,
                                episode_number,
                                title,
                                content,
                                is_free,
                                price,
                                status,
                                created_at,
                                updated_at
                            FROM episodes
                            WHERE story_id = ?
                            AND status = 'published'
                            ORDER BY episode_number ASC
                        `)
                        .bind(storyId)
                        .all();

                    return json({
                        success: true,
                        story,
                        count: episodes.results.length,
                        episodes: episodes.results
                    });

                } catch (error) {

                    return errorResponse(
                        "Failed to load episodes",
                        500
                    );
                }
            }
        }

        return errorResponse(
            "Endpoint not found",
            404
        );
    }

    /* =========================
       POST REQUEST
    ========================= */

    if (request.method === "POST") {

        const url = new URL(request.url);

        let path = url.pathname;

        if (path.startsWith("/api")) {
            path = path.substring(4);
        }

        if (path === "") {
            path = "/";
        }

        /* =========================
           REGISTER
        ========================= */

     /* =========================
   REGISTER
========================= */

if (path === "/register") {

    const body = await readJson(request);

    if (!body) {
        return errorResponse(
            "Invalid JSON request",
            400
        );
    }

    let {
        username,
        email,
        password
    } = body;

    if (
        typeof username !== "string" ||
        typeof email !== "string" ||
        typeof password !== "string"
    ) {
        return errorResponse(
            "Username, email and password are required",
            400
        );
    }

    username = username.trim();
    email = email.trim().toLowerCase();

    if (username.length < 3) {
        return errorResponse(
            "Username must be at least 3 characters",
            400
        );
    }

    if (username.length > 30) {
        return errorResponse(
            "Username must not exceed 30 characters",
            400
        );
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return errorResponse(
            "Username can only contain letters, numbers and underscore",
            400
        );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return errorResponse(
            "Invalid email address",
            400
        );
    }

    if (password.length < 8) {
        return errorResponse(
            "Password must be at least 8 characters",
            400
        );
    }

    try {

        const existingUser = await env.D1
            .prepare(`
                SELECT id, username, email
                FROM users
                WHERE username = ? OR email = ?
                LIMIT 1
            `)
            .bind(username, email)
            .first();

        if (existingUser) {

            if (
                existingUser.username.toLowerCase() ===
                username.toLowerCase()
            ) {
                return errorResponse(
                    "Username already exists",
                    409
                );
            }

            if (
                existingUser.email.toLowerCase() ===
                email.toLowerCase()
            ) {
                return errorResponse(
                    "Email already exists",
                    409
                );
            }
        }

        const passwordHash = await hashPassword(password);

        const result = await env.D1
            .prepare(`
                INSERT INTO users (
                    username,
                    email,
                    password_hash,
                    role,
                    status
                )
                VALUES (?, ?, ?, 'reader', 'active')
            `)
            .bind(
                username,
                email,
                passwordHash
            )
            .run();

        return json({
            success: true,
            message: "Account created successfully",
            user: {
                id: result.meta.last_row_id,
                username,
                email,
                role: "reader",
                status: "active"
            }
        }, 201);

    } catch (error) {

        return errorResponse(
            "Registration failed: " + error.message,
            500
        );
    }
}
        /* =========================
           LOGIN
        ========================= */

        if (path === "/login") {

            const body = await readJson(request);

            if (!body) {
                return errorResponse(
                    "Invalid JSON request",
                    400
                );
            }

            let {
                login,
                password
            } = body;

            if (
                typeof login !== "string" ||
                typeof password !== "string"
            ) {
                return errorResponse(
                    "Login and password are required",
                    400
                );
            }

            login = login.trim();

            if (!login || !password) {
                return errorResponse(
                    "Login and password are required",
                    400
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
                            role,
                            status
                        FROM users
                        WHERE username = ?
                        OR email = ?
                        LIMIT 1
                    `)
                    .bind(
                        login,
                        login.toLowerCase()
                    )
                    .first();

                if (!user) {
                    return errorResponse(
                        "Invalid username/email or password",
                        401
                    );
                }

                if (user.status !== "active") {
                    return errorResponse(
                        "This account is not active",
                        403
                    );
                }

                const validPassword =
                    await verifyPassword(
                        password,
                        user.password_hash
                    );

                if (!validPassword) {
                    return errorResponse(
                        "Invalid username/email or password",
                        401
                    );
                }

                /* Never send password_hash */

                return json({
                    success: true,
                    message: "Login successful",
                    user: {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        role: user.role,
                        status: user.status
                    }
                });

            } catch (error) {

                return errorResponse(
                    "Login failed",
                    500
                );
            }
        }

        return errorResponse(
            "Endpoint not found",
            404
        );
    }

    return errorResponse(
        "Method not allowed",
        405
    );
}
