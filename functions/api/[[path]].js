const { DB } = globalThis;

/* =====================================================
   HELPERS
   ===================================================== */

const json = (data, status = 200) => {
    return new Response(
        JSON.stringify(data),
        {
            status,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods":
                    "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers":
                    "Content-Type, Authorization"
            }
        }
    );
};

const errorResponse = (
    message,
    status = 400,
    extra = {}
) => {
    return json(
        {
            success: false,
            message,
            ...extra
        },
        status
    );
};

const cleanString = (
    value,
    maxLength = 500
) => {
    if (
        value === undefined ||
        value === null
    ) {
        return "";
    }

    return String(value)
        .trim()
        .slice(0, maxLength);
};

const positiveInt = (value) => {
    const number = Number(value);

    if (
        !Number.isInteger(number) ||
        number <= 0
    ) {
        return null;
    }

    return number;
};

const numberOrNull = (value) => {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return null;
    }

    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : null;
};

const slugify = (value) => {
    return cleanString(value, 300)
        .toLowerCase()
        .normalize("NFKD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .replace(
            /[^a-z0-9]+/g,
            "-"
        )
        .replace(
            /^-+|-+$/g,
            "");
};

const readJson = async (request) => {
    try {
        return await request.json();
    } catch {
        return null;
    }
};


/* =====================================================
   PASSWORD HASHING
   ===================================================== */

const textEncoder =
    new TextEncoder();

const textDecoder =
    new TextDecoder();

const bytesToHex = (bytes) => {
    return Array.from(bytes)
        .map(
            byte =>
                byte
                    .toString(16)
                    .padStart(2, "0")
        )
        .join("");
};

const hexToBytes = (hex) => {
    const bytes =
        new Uint8Array(
            hex.length / 2
        );

    for (
        let i = 0;
        i < bytes.length;
        i++
    ) {
        bytes[i] =
            parseInt(
                hex.slice(
                    i * 2,
                    i * 2 + 2
                ),
                16
            );
    }

    return bytes;
};

const base64ToBytes = (base64) => {
    const binaryString =
        atob(base64);
    const bytes =
        new Uint8Array(
            binaryString.length
        );
    for (
        let i = 0;
        i < binaryString.length;
        i++
    ) {
        bytes[i] =
            binaryString.charCodeAt(i);
    }
    return bytes;
};


const verifyPassword = async (
    password,
    stored
) => {

    try {

        const storedStr =
            String(stored || "");

        const parts =
            storedStr.split("$");

        let iterations, salt, expected;

        /* ---- Format 1: pbkdf2$sha256$100000$<hex_salt>$<hex_hash> ---- */
        if (
            parts.length === 5 &&
            parts[0] === "pbkdf2" &&
            parts[1] === "sha256"
        ) {
            iterations =
                Number(parts[2]);
            salt =
                hexToBytes(parts[3]);
            expected =
                hexToBytes(parts[4]);
        }

        /* ---- Format 2: pbkdf2$100000$<base64_salt>$<base64_hash> ---- */
        /* ---- Format 3: pbkdf2$1000$<base64_salt>$<base64_hash>  ---- */
        else if (
            parts.length === 4 &&
            parts[0] === "pbkdf2"
        ) {
            iterations =
                Number(parts[1]);
            salt =
                base64ToBytes(parts[2]);
            expected =
                base64ToBytes(parts[3]);
        }

        else {
            return false;
        }

        if (
            !iterations ||
            iterations <= 0
        ) {
            return false;
        }

        const key =
            await crypto.subtle.importKey(
                "raw",
                textEncoder.encode(password),
                {
                    name: "PBKDF2"
                },
                false,
                ["deriveBits"]
            );

        const bits =
            await crypto.subtle.deriveBits(
                {
                    name: "PBKDF2",
                    salt,
                    iterations,
                    hash: "SHA-256"
                },
                key,
                256
            );

        const actual =
            new Uint8Array(bits);

        if (
            actual.length !==
            expected.length
        ) {
            return false;
        }

        let result = 0;

        for (
            let i = 0;
            i < actual.length;
            i++
        ) {
            result |=
                actual[i] ^
                expected[i];
        }

        return result === 0;

    } catch {
        return false;
    }
};

        let result = 0;

        for (
            let i = 0;
            i < actual.length;
            i++
        ) {
            result |=
                actual[i] ^
                expected[i];
        }

        return result === 0;

    } catch {
        return false;
    }
};


/* =====================================================
   DATABASE HELPERS
   ===================================================== */

const ensureExtraTables = async (
    db
) => {

    await db.prepare(`
        CREATE TABLE IF NOT EXISTS story_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            author_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            slug TEXT,
            description TEXT,
            cover_url TEXT,
            language TEXT,
            category_id INTEGER,
            originality_declaration INTEGER DEFAULT 0,
            status TEXT DEFAULT 'pending',
            admin_note TEXT,
            reviewed_by INTEGER,
            reviewed_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `).run();

    await db.prepare(`
        CREATE TABLE IF NOT EXISTS author_earnings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            author_id INTEGER NOT NULL,
            story_id INTEGER,
            episode_id INTEGER,
            gross_amount REAL DEFAULT 0,
            author_amount REAL DEFAULT 0,
            platform_amount REAL DEFAULT 0,
            source TEXT,
            status TEXT DEFAULT 'available',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `).run();

    await db.prepare(`
        CREATE TABLE IF NOT EXISTS withdrawals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            author_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            status TEXT DEFAULT 'pending',
            payment_method TEXT,
            payment_account TEXT,
            admin_note TEXT,
            reviewed_by INTEGER,
            reviewed_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `).run();

    await db.prepare(`
        CREATE TABLE IF NOT EXISTS recommendations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            author_id INTEGER NOT NULL,
            story_id INTEGER,
            amount REAL DEFAULT 0,
            author_amount REAL DEFAULT 0,
            platform_amount REAL DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `).run();

    await db.prepare(`
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `).run();
};


const getUser = async (
    db,
    userId
) => {

    const id =
        positiveInt(userId);

    if (!id) {
        return null;
    }

    return await db
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
        .bind(id)
        .first();
};


const getReader = async (
    db,
    readerId
) => {

    const id =
        positiveInt(readerId);

    if (!id) {
        return null;
    }

    return await db
        .prepare(`
            SELECT *
            FROM users
            WHERE id = ?
              AND (
                    role = 'reader'
                    OR role IS NULL
                    OR role = ''
              )
            LIMIT 1
        `)
        .bind(id)
        .first();
};


const getAuthor = async (
    db,
    authorId
) => {

    const id =
        positiveInt(authorId);

    if (!id) {
        return null;
    }

    return await db
        .prepare(`
            SELECT *
            FROM authors
            WHERE id = ?
            LIMIT 1
        `)
        .bind(id)
        .first();
};


const getAuthorByUserId = async (
    db,
    userId
) => {

    const id =
        positiveInt(userId);

    if (!id) {
        return null;
    }

    return await db
        .prepare(`
            SELECT *
            FROM authors
            WHERE user_id = ?
            LIMIT 1
        `)
        .bind(id)
        .first();
};


const getAdmin = async (
    db,
    adminId
) => {

    const id =
        positiveInt(adminId);

    if (!id) {
        return null;
    }

    try {

        return await db
            .prepare(`
                SELECT *
                FROM admins
                WHERE id = ?
                LIMIT 1
            `)
            .bind(id)
            .first();

    } catch {
        return null;
    }
};


const requireAdmin = async (
    db,
    adminId
) => {

    const admin =
        await getAdmin(
            db,
            adminId
        );

    if (!admin) {
        return {
            ok: false,
            response:
                errorResponse(
                    "Admin account not found",
                    404
                )
        };
    }

    if (
        admin.status &&
        String(admin.status)
            .toLowerCase() !==
        "active"
    ) {
        return {
            ok: false,
            response:
                errorResponse(
                    "Admin account is not active",
                    403
                )
        };
    }

    return {
        ok: true,
        admin
    };
};


/* =====================================================
   MAIN HANDLER
   ===================================================== */

export async function onRequest(
    context
) {

    const {
        request,
        env
    } = context;

    const db =
        env.D1 ?? env.DB;

    if (!db) {
        return errorResponse(
            "D1 database binding not found",
            500
        );
    }

    const url =
        new URL(request.url);

    const path =
        url.pathname
            .replace(
                /^\/api/,
                ""
            )
            .replace(
                /\/+$/,
                ""
            ) || "/";

    const method =
        request.method.toUpperCase();


    /* OPTIONS */

    if (method === "OPTIONS") {
        return new Response(
            null,
            {
                status: 204,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods":
                        "GET, POST, PUT, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers":
                        "Content-Type, Authorization"
                }
            }
        );
    }


    try {
        await ensureExtraTables(db);
    } catch (error) {
        return errorResponse(
            "Database initialization failed",
            500,
            {
                error:
                    error?.message ||
                    String(error)
            }
        );
    }


    /* HEALTH */

    if (
        method === "GET" &&
        path === "/health"
    ) {
        return json({
            success: true,
            message:
                "Net Simulizi API is running",
            service:
                "netsimulizi-api",
            version:
                "3.0",
            account_structure: {
                users: "readers",
                authors: "authors",
                admins: "admins"
            }
        });
    }


    /* TEST */

    if (
        method === "GET" &&
        path === "/test"
    ) {
        return json({
            success: true,
            message:
                "Net Simulizi API test successful"
        });
    }


    /* DB TEST */

    if (
        method === "GET" &&
        path === "/db-test"
    ) {
        try {
            const result =
                await db
                    .prepare(`
                        SELECT
                            1 AS ok
                    `)
                    .first();
            return json({
                success: true,
                database:
                    result?.ok === 1
                        ? "connected"
                        : "unknown"
            });
        } catch (error) {
            return errorResponse(
                "Database test failed",
                500,
                {
                    error:
                        error?.message ||
                        String(error)
                }
            );
        }
    }


    /* STORIES TEST */

    if (
        method === "GET" &&
        path === "/stories-test"
    ) {
        try {
            const result =
                await db
                    .prepare(`
                        SELECT
                            COUNT(*) AS total
                        FROM stories
                    `)
                    .first();
            return json({
                success: true,
                total:
                    Number(
                        result?.total || 0
                    )
            });
        } catch (error) {
            return errorResponse(
                "Stories test failed",
                500,
                {
                    error:
                        error?.message ||
                        String(error)
                }
            );
        }
    }


    /* =================================================
       GET ROUTES
       ================================================= */

    if (method === "GET") {

        /* CATEGORIES */
        if (path === "/categories") {
            try {
                const result = await db.prepare(`SELECT * FROM categories ORDER BY name ASC`).all();
                return json({ success: true, categories: result.results || [] });
            } catch (error) {
                return errorResponse("Failed to load categories", 500, { error: error?.message || String(error) });
            }
        }

        /* GENRES */
        if (path === "/genres") {
            try {
                const result = await db.prepare(`SELECT * FROM categories ORDER BY name ASC`).all();
                return json({ success: true, genres: result.results || [] });
            } catch (error) {
                return errorResponse("Failed to load genres", 500);
            }
        }

        /* STORIES */
        if (path === "/stories") {
            const categoryId = positiveInt(url.searchParams.get("category_id"));
            const language = cleanString(url.searchParams.get("language"), 50);
            const status = cleanString(url.searchParams.get("status"), 50);
            try {
                let query = `
                    SELECT stories.*, authors.display_name AS author_name, categories.name AS category_name
                    FROM stories
                    LEFT JOIN authors ON stories.author_id = authors.id
                    LEFT JOIN categories ON stories.category_id = categories.id
                    WHERE 1 = 1
                `;
                const params = [];
                if (categoryId) { query += ` AND stories.category_id = ?`; params.push(categoryId); }
                if (language) { query += ` AND stories.language = ?`; params.push(language); }
                if (status) { query += ` AND stories.status = ?`; params.push(status); }
                else { query += ` AND (stories.status = 'published' OR stories.status IS NULL)`; }
                query += ` ORDER BY stories.created_at DESC`;
                const result = await db.prepare(query).bind(...params).all();
                return json({ success: true, stories: result.results || [] });
            } catch (error) {
                return errorResponse("Failed to load stories", 500, { error: error?.message || String(error) });
            }
        }

        /* STORY DETAIL */
        if (path.startsWith("/stories/") && !path.endsWith("/episodes")) {
            const parts = path.split("/").filter(Boolean);
            const storyId = positiveInt(parts[1]);
            if (parts.length !== 2 || !storyId) return errorResponse("Invalid story ID", 400);
            try {
                const story = await db.prepare(`
                    SELECT stories.*, authors.display_name AS author_name, categories.name AS category_name
                    FROM stories LEFT JOIN authors ON stories.author_id = authors.id
                    LEFT JOIN categories ON stories.category_id = categories.id
                    WHERE stories.id = ? LIMIT 1
                `).bind(storyId).first();
                if (!story) return errorResponse("Story not found", 404);
                return json({ success: true, story });
            } catch (error) {
                return errorResponse("Failed to load story", 500);
            }
        }

        /* STORY EPISODES */
        if (path.startsWith("/stories/") && path.endsWith("/episodes")) {
            const parts = path.split("/").filter(Boolean);
            const storyId = positiveInt(parts[1]);
            if (parts.length !== 3 || parts[2] !== "episodes" || !storyId) return errorResponse("Invalid story ID", 400);
            try {
                const result = await db.prepare(`SELECT * FROM episodes WHERE story_id = ? ORDER BY episode_number ASC, id ASC`).bind(storyId).all();
                return json({ success: true, episodes: result.results || [] });
            } catch (error) {
                return errorResponse("Failed to load episodes", 500);
            }
        }

        /* AUTHORS */
        if (path === "/authors") {
            try {
                const result = await db.prepare(`
                    SELECT authors.*, users.username, users.email,
                        (SELECT COUNT(*) FROM stories WHERE stories.author_id = authors.id) AS story_count,
                        (SELECT COALESCE(SUM(author_amount), 0) FROM author_earnings WHERE author_earnings.author_id = authors.id) AS earnings
                    FROM authors LEFT JOIN users ON authors.user_id = users.id
                    ORDER BY authors.created_at DESC
                `).all();
                return json({ success: true, authors: result.results || [] });
            } catch (error) {
                return errorResponse("Failed to load authors", 500, { error: error?.message || String(error) });
            }
        }

        /* AUTHOR DETAIL */
        if (path.startsWith("/authors/")) {
            const parts = path.split("/").filter(Boolean);
            const authorId = positiveInt(parts[1]);
            if (parts.length !== 2 || !authorId) return errorResponse("Invalid author ID", 400);
            try {
                const author = await db.prepare(`
                    SELECT authors.*, users.username, users.email
                    FROM authors LEFT JOIN users ON authors.user_id = users.id
                    WHERE authors.id = ? LIMIT 1
                `).bind(authorId).first();
                if (!author) return errorResponse("Author not found", 404);
                return json({ success: true, author });
            } catch {
                return errorResponse("Failed to load author", 500);
            }
        }

        /* PROFILE */
        if (path.startsWith("/profile/")) {
            const parts = path.split("/").filter(Boolean);
            const userId = positiveInt(parts[1]);
            if (parts.length !== 2 || !userId) return errorResponse("Invalid user ID", 400);
            const user = await getUser(db, userId);
            if (!user) return errorResponse("User not found", 404);
            return json({ success: true, user });
        }

        /* BOOKMARKS */
        if (path.startsWith("/bookmarks/")) {
            const parts = path.split("/").filter(Boolean);
            const userId = positiveInt(parts[1]);
            if (parts.length !== 2 || !userId) return errorResponse("Invalid user ID", 400);
            try {
                const result = await db.prepare(`
                    SELECT bookmarks.*, stories.title, stories.slug, stories.description, stories.cover_url, stories.language, stories.readers_count,
                        authors.id AS author_id, authors.display_name AS author_name, categories.name AS category_name
                    FROM bookmarks INNER JOIN stories ON bookmarks.story_id = stories.id
                    LEFT JOIN authors ON stories.author_id = authors.id
                    LEFT JOIN categories ON stories.category_id = categories.id
                    WHERE bookmarks.user_id = ? ORDER BY bookmarks.created_at DESC
                `).bind(userId).all();
                return json({ success: true, bookmarks: result.results || [] });
            } catch {
                return errorResponse("Failed to load bookmarks", 500);
            }
        }

        /* READING PROGRESS */
        if (path.startsWith("/reading-progress/")) {
            const parts = path.split("/").filter(Boolean);
            const userId = positiveInt(parts[1]);
            const storyId = positiveInt(parts[2]);
            if (parts.length !== 3 || !userId || !storyId) return errorResponse("Invalid user ID or story ID", 400);
            try {
                const progress = await db.prepare(`SELECT * FROM reading_progress WHERE user_id = ? AND story_id = ? LIMIT 1`).bind(userId, storyId).first();
                return json({ success: true, progress: progress || null });
            } catch {
                return errorResponse("Failed to load reading progress", 500);
            }
        }

        /* READING HISTORY */
        if (path.startsWith("/reading-history/")) {
            const parts = path.split("/").filter(Boolean);
            const userId = positiveInt(parts[1]);
            if (parts.length !== 2 || !userId) return errorResponse("Invalid user ID", 400);
            try {
                const result = await db.prepare(`
                    SELECT reading_progress.*, stories.title, stories.slug, stories.cover_url, stories.language, authors.display_name AS author_name
                    FROM reading_progress INNER JOIN stories ON reading_progress.story_id = stories.id
                    LEFT JOIN authors ON stories.author_id = authors.id
                    WHERE reading_progress.user_id = ? ORDER BY reading_progress.updated_at DESC
                `).bind(userId).all();
                return json({ success: true, history: result.results || [] });
            } catch {
                return errorResponse("Failed to load reading history", 500);
            }
        }

        /* AUTHOR STORIES */
        if (path.startsWith("/author/stories/")) {
            const parts = path.split("/").filter(Boolean);
            const authorId = positiveInt(parts[2]);
            if (parts.length !== 3 || !authorId) return errorResponse("Invalid author ID", 400);
            const author = await getAuthor(db, authorId);
            if (!author) return errorResponse("Author not found", 404);
            try {
                const result = await db.prepare(`SELECT * FROM stories WHERE author_id = ? ORDER BY created_at DESC`).bind(author.id).all();
                return json({ success: true, stories: result.results || [] });
            } catch {
                return errorResponse("Failed to load author stories", 500);
            }
        }

        /* AUTHOR SUBMISSIONS */
        if (path.startsWith("/author/submissions/")) {
            const parts = path.split("/").filter(Boolean);
            const authorId = positiveInt(parts[2]);
            if (parts.length !== 3 || !authorId) return errorResponse("Invalid author ID", 400);
            const author = await getAuthor(db, authorId);
            if (!author) return errorResponse("Author not found", 404);
            try {
                const result = await db.prepare(`SELECT * FROM story_submissions WHERE author_id = ? ORDER BY created_at DESC`).bind(author.id).all();
                return json({ success: true, submissions: result.results || [] });
            } catch {
                return errorResponse("Failed to load submissions", 500);
            }
        }

        /* WALLET */
        if (path.startsWith("/wallet/")) {
            const parts = path.split("/").filter(Boolean);
            const authorId = positiveInt(parts[1]);
            if (parts.length !== 2 || !authorId) return errorResponse("Invalid author ID", 400);
            const author = await getAuthor(db, authorId);
            if (!author) return errorResponse("Author not found", 404);
            try {
                const earnings = await db.prepare(`
                    SELECT COALESCE(SUM(author_amount), 0) AS total_earnings,
                        COALESCE(SUM(CASE WHEN status = 'available' THEN author_amount ELSE 0 END), 0) AS available_balance,
                        COALESCE(SUM(CASE WHEN status = 'paid' THEN author_amount ELSE 0 END), 0) AS paid_earnings
                    FROM author_earnings WHERE author_id = ?
                `).bind(author.id).first();
                const recommendations = await db.prepare(`SELECT COALESCE(SUM(author_amount), 0) AS total FROM recommendations WHERE author_id = ?`).bind(author.id).first();
                const withdrawals = await db.prepare(`
                    SELECT COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) AS pending,
                        COALESCE(SUM(CASE WHEN status = 'approved' OR status = 'paid' THEN amount ELSE 0 END), 0) AS withdrawn
                    FROM withdrawals WHERE author_id = ?
                `).bind(author.id).first();
                const available = Number(earnings?.available_balance || 0);
                const pending = Number(withdrawals?.pending || 0);
                const withdrawable = Math.max(0, available - pending);
                return json({ success: true, wallet: {
                    author_id: author.id,
                    total_earnings: Number(earnings?.total_earnings || 0),
                    available_balance: available,
                    pending_withdrawals: pending,
                    withdrawn: Number(withdrawals?.withdrawn || 0),
                    recommendations: Number(recommendations?.total || 0),
                    withdrawable,
                    minimum_withdrawal: 50000,
                    can_withdraw: withdrawable >= 50000
                }});
            } catch (error) {
                return errorResponse("Failed to load wallet", 500, { error: error?.message || String(error) });
            }
        }

        /* WITHDRAWALS */
        if (path.startsWith("/withdrawals/")) {
            const parts = path.split("/").filter(Boolean);
            const authorId = positiveInt(parts[1]);
            if (parts.length !== 2 || !authorId) return errorResponse("Invalid author ID", 400);
            try {
                const result = await db.prepare(`SELECT * FROM withdrawals WHERE author_id = ? ORDER BY created_at DESC`).bind(authorId).all();
                return json({ success: true, withdrawals: result.results || [] });
            } catch {
                return errorResponse("Failed to load withdrawals", 500);
            }
        }

        /* ADMIN SUBMISSIONS */
        if (path === "/admin/submissions") {
            const adminId = positiveInt(url.searchParams.get("admin_id"));
            const auth = await requireAdmin(db, adminId);
            if (!auth.ok) return auth.response;
            try {
                const result = await db.prepare(`
                    SELECT story_submissions.*, authors.display_name AS author_name
                    FROM story_submissions LEFT JOIN authors ON story_submissions.author_id = authors.id
                    WHERE story_submissions.status = 'pending' ORDER BY story_submissions.created_at DESC
                `).all();
                return json({ success: true, submissions: result.results || [] });
            } catch {
                return errorResponse("Failed to load admin submissions", 500);
            }
        }

        /* ADMIN WITHDRAWALS */
        if (path === "/admin/withdrawals") {
            const adminId = positiveInt(url.searchParams.get("admin_id"));
            const auth = await requireAdmin(db, adminId);
            if (!auth.ok) return auth.response;
            try {
                const result = await db.prepare(`
                    SELECT withdrawals.*, authors.display_name AS author_name
                    FROM withdrawals LEFT JOIN authors ON withdrawals.author_id = authors.id
                    WHERE withdrawals.status = 'pending' ORDER BY withdrawals.created_at ASC
                `).all();
                return json({ success: true, withdrawals: result.results || [] });
            } catch {
                return errorResponse("Failed to load admin withdrawals", 500);
            }
        }

        /* ADMIN STATS */
        if (path === "/admin/stats") {
            const adminId = positiveInt(url.searchParams.get("admin_id"));
            const auth = await requireAdmin(db, adminId);
            if (!auth.ok) return auth.response;
            try {
                const users = await db.prepare(`SELECT COUNT(*) AS total FROM users`).first();
                const authors = await db.prepare(`SELECT COUNT(*) AS total FROM authors`).first();
                const stories = await db.prepare(`SELECT COUNT(*) AS total FROM stories`).first();
                const published = await db.prepare(`SELECT COUNT(*) AS total FROM stories WHERE status = 'published'`).first();
                const submissions = await db.prepare(`SELECT COUNT(*) AS total FROM story_submissions WHERE status = 'pending'`).first();
                const withdrawals = await db.prepare(`SELECT COUNT(*) AS total FROM withdrawals WHERE status = 'pending'`).first();
                return json({ success: true, stats: {
                    readers: Number(users?.total || 0),
                    users: Number(users?.total || 0),
                    authors: Number(authors?.total || 0),
                    stories: Number(stories?.total || 0),
                    published_stories: Number(published?.total || 0),
                    pending_submissions: Number(submissions?.total || 0),
                    pending_withdrawals: Number(withdrawals?.total || 0)
                }});
            } catch (error) {
                return errorResponse("Failed to load admin statistics", 500, { error: error?.message || String(error) });
            }
        }

        return errorResponse("Endpoint not found", 404);
    }


    /* =================================================
       POST ROUTES
       ================================================= */

    if (method === "POST") {

        const body = await readJson(request);
        if (!body) return errorResponse("Invalid JSON request", 400);


        /* =============================================
           LOGIN (READER + ADMIN)
           ============================================= */

        if (path === "/login") {

            const login = cleanString(body.login || body.email || body.username, 200);
            const password = String(body.password || "");

            if (!login || !password) {
                return errorResponse("Login and password are required", 400);
            }

            try {
                const user = await db.prepare(`
                    SELECT * FROM users
                    WHERE LOWER(username) = LOWER(?)
                       OR LOWER(email) = LOWER(?)
                    LIMIT 1
                `).bind(login, login).first();

                if (!user) {
                    return errorResponse("Invalid login credentials", 401);
                }

                const valid = await verifyPassword(password, user.password_hash);

                if (!valid) {
                    return errorResponse("Invalid login credentials", 401);
                }

                if (String(user.status || "").toLowerCase() !== "active") {
                    return errorResponse("Account is not active", 403);
                }

                const role = String(user.role || "").toLowerCase();

                /* ---- READER LOGIN ---- */
                if (role === "reader" || role === "" || role === null) {
                    return json({
                        success: true,
                        user: {
                            id: user.id,
                            username: user.username,
                            email: user.email,
                            role: "reader",
                            status: user.status
                        }
                    });
                }

                /* ---- ADMIN LOGIN ---- */
                if (role === "admin") {
                    const admin = await db.prepare(`
                        SELECT * FROM admins WHERE user_id = ? LIMIT 1
                    `).bind(user.id).first();

                    if (!admin) {
                        return errorResponse("Admin account not found", 404);
                    }

                    if (String(admin.status).toLowerCase() !== "active") {
                        return errorResponse("Admin account is not active", 403);
                    }

                    return json({
                        success: true,
                        user: {
                            id: user.id,
                            admin_id: admin.id,
                            username: user.username,
                            email: user.email,
                            role: "admin",
                            status: user.status
                        }
                    });
                }

                /* ---- AUTHOR LOGIN ---- */
                if (role === "author") {
                    return errorResponse("Please use the author login page", 403);
                }

                return errorResponse("Invalid login credentials", 401);

            } catch (error) {
                return errorResponse("Login failed", 500, { error: error?.message || String(error) });
            }
        }


        /* =============================================
           AUTHOR LOGIN
           ============================================= */

        if (path === "/author/login") {
            const login = cleanString(body.login || body.email || body.username, 200);
            const password = String(body.password || "");
            if (!login || !password) return errorResponse("Login and password are required", 400);
            try {
                const user = await db.prepare(`
                    SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1
                `).bind(login, login.toLowerCase()).first();
                if (!user) return errorResponse("Invalid login credentials", 401);
                const valid = await verifyPassword(password, user.password_hash);
                if (!valid) return errorResponse("Invalid login credentials", 401);
                const author = await getAuthorByUserId(db, user.id);
                if (!author) return errorResponse("Author profile not found", 404);
                if (String(author.approval_status || "").toLowerCase() !== "approved") {
                    return errorResponse("Author account is pending approval", 403, { approval_status: author.approval_status || "pending" });
                }
                return json({ success: true, author: {
                    id: author.id, user_id: author.user_id, username: user.username, email: user.email,
                    display_name: author.display_name, approval_status: author.approval_status
                }});
            } catch (error) {
                return errorResponse("Author login failed", 500, { error: error?.message || String(error) });
            }
        }


        /* =============================================
           REGISTER READER
           ============================================= */

        if (path === "/register") {
            const username = cleanString(body.username, 100);
            const email = cleanString(body.email, 200).toLowerCase();
            const password = String(body.password || "");
            if (!username || !email || !password) return errorResponse("Username, email and password are required", 400);
            if (password.length < 8) return errorResponse("Password must be at least 8 characters", 400);
            try {
                const existing = await db.prepare(`SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1`).bind(username, email).first();
                if (existing) return errorResponse("Username or email already exists", 409);
                const passwordHash = await hashPassword(password);
                const result = await db.prepare(`
                    INSERT INTO users (username, email, password_hash, role, status)
                    VALUES (?, ?, ?, 'reader', 'active')
                `).bind(username, email, passwordHash).run();
                const userId = result.meta.last_row_id;
                return json({ success: true, message: "Reader registered successfully", user: { id: userId, username, email, role: "reader", status: "active" } }, 201);
            } catch (error) {
                return errorResponse("Registration failed", 500, { error: error?.message || String(error) });
            }
        }


        /* =============================================
           BOOKMARK
           ============================================= */

        if (path === "/bookmarks") {
            const userId = positiveInt(body.user_id || body.reader_id);
            const storyId = positiveInt(body.story_id);
            if (!userId || !storyId) return errorResponse("User ID and story ID are required", 400);
            try {
                const existing = await db.prepare(`SELECT id FROM bookmarks WHERE user_id = ? AND story_id = ? LIMIT 1`).bind(userId, storyId).first();
                if (existing) return json({ success: true, message: "Bookmark already exists", bookmark_id: existing.id });
                const result = await db.prepare(`INSERT INTO bookmarks (user_id, story_id) VALUES (?, ?)`).bind(userId, storyId).run();
                return json({ success: true, message: "Bookmark added successfully", bookmark_id: result.meta.last_row_id }, 201);
            } catch (error) {
                return errorResponse("Failed to add bookmark", 500, { error: error?.message || String(error) });
            }
        }


        /* =============================================
           READING PROGRESS
           ============================================= */

        if (path === "/reading-progress") {
            const userId = positiveInt(body.user_id || body.reader_id);
            const storyId = positiveInt(body.story_id);
            const episodeId = numberOrNull(body.episode_id);
            const progressPercent = numberOrNull(body.progress_percent ?? body.progress);
            if (!userId || !storyId) return errorResponse("User ID and story ID are required", 400);
            const progress = Math.min(100, Math.max(0, Number(progressPercent || 0)));
            try {
                const existing = await db.prepare(`SELECT id FROM reading_progress WHERE user_id = ? AND story_id = ? LIMIT 1`).bind(userId, storyId).first();
                if (existing) {
                    await db.prepare(`UPDATE reading_progress SET episode_id = ?, progress_percent = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(episodeId, progress, existing.id).run();
                } else {
                    await db.prepare(`INSERT INTO reading_progress (user_id, story_id, episode_id, progress_percent, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).bind(userId, storyId, episodeId, progress).run();
                }
                return json({ success: true, message: "Reading progress saved" });
            } catch (error) {
                return errorResponse("Failed to save reading progress", 500, { error: error?.message || String(error) });
            }
        }


        /* =============================================
           AUTHOR CREATE STORY
           ============================================= */

        if (path === "/author/stories") {
            const userId = positiveInt(body.user_id);
            const title = cleanString(body.title, 300);
            const description = cleanString(body.description, 10000);
            const language = cleanString(body.language, 50);
            const categoryId = positiveInt(body.category_id);
            const coverUrl = cleanString(body.cover_url, 1000);
            const originality = body.originality_declaration === true || body.originality_declaration === 1 || body.originality_declaration === "1" || body.originality_declaration === "true";
            if (!userId || !title || !language) return errorResponse("User ID, title and language are required", 400);
            if (!originality) return errorResponse("Originality declaration is required", 400);
            const author = await getAuthorByUserId(db, userId);
            if (!author) return errorResponse("Author profile not found", 404);
            try {
                const slug = slugify(title);
                const result = await db.prepare(`
                    INSERT INTO story_submissions (author_id, title, slug, description, cover_url, language, category_id, originality_declaration, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'pending')
                `).bind(author.id, title, slug, description || null, coverUrl || null, language, categoryId).run();
                return json({ success: true, message: "Story submitted successfully and is pending approval", submission_id: result.meta.last_row_id, status: "pending" }, 201);
            } catch (error) {
                return errorResponse("Failed to submit story", 500, { error: error?.message || String(error) });
            }
        }


        /* =============================================
           ADMIN CREATE AUTHOR
           ============================================= */

        if (path === "/admin/authors/create") {
            const adminId = positiveInt(body.admin_id);
            const username = cleanString(body.username, 100);
            const email = cleanString(body.email, 200).toLowerCase();
            const password = String(body.password || "");
            const displayName = cleanString(body.display_name, 200);
            const bio = cleanString(body.bio, 5000);
            const auth = await requireAdmin(db, adminId);
            if (!auth.ok) return auth.response;
            if (!username || !email || !password || !displayName) return errorResponse("username, email, password and display_name are required", 400);
            if (password.length < 8) return errorResponse("Password must be at least 8 characters", 400);
            try {
                const existingUser = await db.prepare(`SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1`).bind(username, email).first();
                if (existingUser) return errorResponse("Username or email already exists", 409);
                const passwordHash = await hashPassword(password);
                const userResult = await db.prepare(`
                    INSERT INTO users (username, email, password_hash, role, status)
                    VALUES (?, ?, ?, 'author', 'active')
                `).bind(username, email, passwordHash).run();
                const userId = userResult.meta.last_row_id;
                if (!userId) return errorResponse("Failed to create author user account", 500);
                try {
                    const authorResult = await db.prepare(`
                        INSERT INTO authors (user_id, display_name, bio, approval_status)
                        VALUES (?, ?, ?, 'pending')
                    `).bind(userId, displayName, bio || null).run();
                    const authorId = authorResult.meta.last_row_id;
                    if (!authorId) {
                        await db.prepare(`DELETE FROM users WHERE id = ?`).bind(userId).run();
                        return errorResponse("Failed to create author profile", 500);
                    }
                    return json({ success: true, message: "Author created successfully and is pending approval", author: { id: authorId, user_id: userId, username, email, display_name: displayName, approval_status: "pending" } }, 201);
                } catch (authorError) {
                    try { await db.prepare(`DELETE FROM users WHERE id = ?`).bind(userId).run(); } catch {}
                    throw authorError;
                }
            } catch (error) {
                return errorResponse(error?.message || "Failed to create author", 500);
            }
        }


        /* =============================================
           ADMIN APPROVE AUTHOR
           ============================================= */

        if (path === "/admin/authors/approve") {
            const adminId = positiveInt(body.admin_id);
            const authorId = positiveInt(body.author_id);
            const auth = await requireAdmin(db, adminId);
            if (!auth.ok) return auth.response;
            if (!authorId) return errorResponse("author_id is required", 400);
            try {
                const author = await db.prepare(`SELECT id, user_id, display_name, approval_status FROM authors WHERE id = ? LIMIT 1`).bind(authorId).first();
                if (!author) return errorResponse("Author not found", 404);
                if (String(author.approval_status || "").toLowerCase() === "approved") return errorResponse("Author is already approved", 409);
                await db.prepare(`UPDATE authors SET approval_status = 'approved', approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(authorId).run();
                return json({ success: true, message: "Author approved successfully", author: { id: author.id, user_id: author.user_id, display_name: author.display_name, approval_status: "approved" } });
            } catch (error) {
                return errorResponse(error?.message || "Failed to approve author", 500);
            }
        }


        /* =============================================
           ADMIN APPROVE SUBMISSION
           ============================================= */

        if (path === "/admin/submissions/approve") {
            const adminId = positiveInt(body.admin_id);
            const submissionId = positiveInt(body.submission_id);
            const auth = await requireAdmin(db, adminId);
            if (!auth.ok) return auth.response;
            if (!submissionId) return errorResponse("Invalid submission ID", 400);
            try {
                const submission = await db.prepare(`SELECT * FROM story_submissions WHERE id = ? LIMIT 1`).bind(submissionId).first();
                if (!submission) return errorResponse("Submission not found", 404);
                if (String(submission.status).toLowerCase() !== "pending") return errorResponse("Submission is not pending", 409);
                const storySlug = submission.slug || slugify(submission.title);
                const storyResult = await db.prepare(`
                    INSERT INTO stories (title, slug, description, cover_url, language, author_id, category_id, status, visibility, readers_count, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'published', 'public', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `).bind(submission.title, storySlug, submission.description, submission.cover_url, submission.language, submission.author_id, submission.category_id).run();
                const storyId = storyResult.meta.last_row_id;
                await db.prepare(`UPDATE story_submissions SET status = 'approved', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(adminId, submissionId).run();
                return json({ success: true, message: "Submission approved and story published", story_id: storyId, submission_id: submissionId, status: "published" });
            } catch (error) {
                return errorResponse(error?.message || "Failed to approve submission", 500);
            }
        }


        /* =============================================
           ADMIN REJECT SUBMISSION
           ============================================= */

        if (path === "/admin/submissions/reject") {
            const adminId = positiveInt(body.admin_id);
            const submissionId = positiveInt(body.submission_id);
            const note = cleanString(body.admin_note, 5000);
            const auth = await requireAdmin(db, adminId);
            if (!auth.ok) return auth.response;
            if (!submissionId) return errorResponse("Invalid submission ID", 400);
            try {
                const result = await db.prepare(`
                    UPDATE story_submissions SET status = 'rejected', admin_note = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
                `).bind(note, adminId, submissionId).run();
                if (result.meta.changes === 0) return errorResponse("Submission not found", 404);
                return json({ success: true, message: "Submission rejected", submission_id: submissionId, status: "rejected" });
            } catch {
                return errorResponse("Failed to reject submission", 500);
            }
        }


        /* =============================================
           AUTHOR CREATE EPISODE
           ============================================= */

        if (path === "/author/episodes") {
            const userId = positiveInt(body.user_id);
            const storyId = positiveInt(body.story_id);
            const title = cleanString(body.title, 300);
            const content = cleanString(body.content, 1000000);
            const episodeNumber = positiveInt(body.episode_number);
            if (!userId || !storyId) return errorResponse("User ID and story ID are required", 400);
            if (!title || !content) return errorResponse("Episode title and content are required", 400);
            const author = await getAuthorByUserId(db, userId);
            if (!author) return errorResponse("Author profile not found", 404);
            try {
                const story = await db.prepare(`SELECT id, author_id FROM stories WHERE id = ? LIMIT 1`).bind(storyId).first();
                if (!story) return errorResponse("Story not found", 404);
                if (Number(story.author_id) !== Number(author.id)) return errorResponse("You do not own this story", 403);
                let number = episodeNumber;
                if (!number) {
                    const last = await db.prepare(`SELECT MAX(episode_number) AS max_episode FROM episodes WHERE story_id = ?`).bind(storyId).first();
                    number = Number(last?.max_episode || 0) + 1;
                }
                const isFree = body.is_free === false || body.is_free === 0 ? 0 : 1;
                let price = Number(body.price || 0);
                if (!Number.isFinite(price) || price < 0) price = 0;
                const result = await db.prepare(`
                    INSERT INTO episodes (story_id, episode_number, title, content, is_free, price, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `).bind(storyId, number, title, content, isFree, price).run();
                return json({ success: true, message: "Episode created successfully", episode_id: result.meta.last_row_id, episode_number: number }, 201);
            } catch (error) {
                return errorResponse("Failed to create episode", 500, { error: error?.message || String(error) });
            }
        }


        /* =============================================
           AUTHOR EARNINGS
           ============================================= */

        if (path === "/author/earnings") {
            const authorId = positiveInt(body.author_id);
            const gross = Number(body.amount || 0);
            if (!authorId || !Number.isFinite(gross) || gross <= 0) return errorResponse("Valid author_id and amount are required", 400);
            const authorAmount = Number((gross * 0.70).toFixed(2));
            const platformAmount = Number((gross * 0.30).toFixed(2));
            try {
                const author = await getAuthor(db, authorId);
                if (!author) return errorResponse("Author not found", 404);
                const result = await db.prepare(`
                    INSERT INTO author_earnings (author_id, story_id, episode_id, gross_amount, author_amount, platform_amount, source, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'available')
                `).bind(authorId, positiveInt(body.story_id), positiveInt(body.episode_id), gross, authorAmount, platformAmount, cleanString(body.source, 100) || "sale").run();
                return json({ success: true, earning_id: result.meta.last_row_id, gross_amount: gross, author_amount: authorAmount, platform_amount: platformAmount }, 201);
            } catch (error) {
                return errorResponse("Failed to record earnings", 500, { error: error?.message || String(error) });
            }
        }


        /* =============================================
           RECOMMENDATION
           ============================================= */

        if (path === "/recommendations") {
            const authorId = positiveInt(body.author_id);
            const gross = Number(body.amount || 0);
            if (!authorId || !Number.isFinite(gross) || gross <= 0) return errorResponse("Valid author_id and amount are required", 400);
            const authorAmount = Number((gross * 0.50).toFixed(2));
            const platformAmount = Number((gross * 0.50).toFixed(2));
            try {
                const author = await getAuthor(db, authorId);
                if (!author) return errorResponse("Author not found", 404);
                const result = await db.prepare(`
                    INSERT INTO recommendations (author_id, story_id, amount, author_amount, platform_amount)
                    VALUES (?, ?, ?, ?, ?)
                `).bind(authorId, positiveInt(body.story_id), gross, authorAmount, platformAmount).run();
                return json({ success: true, recommendation_id: result.meta.last_row_id, gross_amount: gross, author_amount: authorAmount, platform_amount: platformAmount }, 201);
            } catch (error) {
                return errorResponse("Failed to record recommendation", 500);
            }
        }


        /* =============================================
           WITHDRAW
           ============================================= */

        if (path === "/withdrawals") {
            const authorId = positiveInt(body.author_id);
            const amount = Number(body.amount || 0);
            if (!authorId || !Number.isFinite(amount) || amount <= 0) return errorResponse("Valid author_id and amount are required", 400);
            if (amount < 50000) return errorResponse("Minimum withdrawal is TSh 50,000", 400);
            try {
                const earnings = await db.prepare(`
                    SELECT COALESCE(SUM(CASE WHEN status = 'available' THEN author_amount ELSE 0 END), 0) AS available
                    FROM author_earnings WHERE author_id = ?
                `).bind(authorId).first();
                const pending = await db.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM withdrawals WHERE author_id = ? AND status = 'pending'`).bind(authorId).first();
                const available = Number(earnings?.available || 0);
                const pendingAmount = Number(pending?.total || 0);
                const withdrawable = Math.max(0, available - pendingAmount);
                if (amount > withdrawable) return errorResponse("Insufficient available balance", 400, { available_balance: withdrawable });
                const result = await db.prepare(`
                    INSERT INTO withdrawals (author_id, amount, status, payment_method, payment_account)
                    VALUES (?, ?, 'pending', ?, ?)
                `).bind(authorId, amount, cleanString(body.payment_method, 100), cleanString(body.payment_account, 300)).run();
                return json({ success: true, message: "Withdrawal request submitted", withdrawal_id: result.meta.last_row_id, amount, status: "pending" }, 201);
            } catch (error) {
                return errorResponse("Failed to create withdrawal", 500, { error: error?.message || String(error) });
            }
        }


        /* =============================================
           ADMIN APPROVE WITHDRAWAL
           ============================================= */

        if (path === "/admin/withdrawals/approve") {
            const adminId = positiveInt(body.admin_id);
            const withdrawalId = positiveInt(body.withdrawal_id);
            const auth = await requireAdmin(db, adminId);
            if (!auth.ok) return auth.response;
            if (!withdrawalId) return errorResponse("Invalid withdrawal ID", 400);
            try {
                const withdrawal = await db.prepare(`SELECT * FROM withdrawals WHERE id = ? LIMIT 1`).bind(withdrawalId).first();
                if (!withdrawal) return errorResponse("Withdrawal not found", 404);
                if (String(withdrawal.status).toLowerCase() !== "pending") return errorResponse("Withdrawal is not pending", 409);
                const earnings = await db.prepare(`SELECT * FROM author_earnings WHERE author_id = ? AND status = 'available' ORDER BY id ASC`).bind(withdrawal.author_id).all();
                let remaining = Number(withdrawal.amount);
                const rows = earnings.results || [];
                let availableTotal = 0;
                for (const row of rows) availableTotal += Number(row.author_amount || 0);
                if (remaining > availableTotal) return errorResponse("Insufficient earnings for withdrawal", 400);
                for (const row of rows) {
                    if (remaining <= 0) break;
                    const rowAmount = Number(row.author_amount || 0);
                    if (rowAmount <= 0) continue;
                    if (rowAmount <= remaining) {
                        await db.prepare(`UPDATE author_earnings SET status = 'paid' WHERE id = ?`).bind(row.id).run();
                        remaining -= rowAmount;
                    } else {
                        const used = Number(remaining.toFixed(2));
                        const left = Number((rowAmount - used).toFixed(2));
                        await db.prepare(`UPDATE author_earnings SET author_amount = ?, gross_amount = ?, platform_amount = ? WHERE id = ?`).bind(used, used / 0.70, (used / 0.70) * 0.30, row.id).run();
                        await db.prepare(`
                            INSERT INTO author_earnings (author_id, story_id, episode_id, gross_amount, author_amount, platform_amount, source, status)
                            VALUES (?, ?, ?, ?, ?, ?, ?, 'available')
                        `).bind(row.author_id, row.story_id, row.episode_id, left / 0.70, left, (left / 0.70) * 0.30, "withdrawal_split").run();
                        remaining = 0;
                    }
                }
                await db.prepare(`UPDATE withdrawals SET status = 'approved', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(adminId, withdrawalId).run();
                return json({ success: true, message: "Withdrawal approved successfully", withdrawal_id: withdrawalId, status: "approved" });
            } catch (error) {
                return errorResponse("Failed to approve withdrawal", 500, { error: error?.message || String(error) });
            }
        }


        /* =============================================
           ADMIN REJECT WITHDRAWAL
           ============================================= */

        if (path === "/admin/withdrawals/reject") {
            const adminId = positiveInt(body.admin_id);
            const withdrawalId = positiveInt(body.withdrawal_id);
            const note = cleanString(body.admin_note, 5000);
            const auth = await requireAdmin(db, adminId);
            if (!auth.ok) return auth.response;
            if (!withdrawalId) return errorResponse("Invalid withdrawal ID", 400);
            try {
                const result = await db.prepare(`
                    UPDATE withdrawals SET status = 'rejected', admin_note = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'
                `).bind(note, adminId, withdrawalId).run();
                if (result.meta.changes === 0) return errorResponse("Pending withdrawal not found", 404);
                return json({ success: true, message: "Withdrawal rejected", withdrawal_id: withdrawalId, status: "rejected" });
            } catch {
                return errorResponse("Failed to reject withdrawal", 500);
            }
        }


        return errorResponse("Endpoint not found", 404);
    }


    /* =================================================
       PUT ROUTES
       ================================================= */

    if (method === "PUT") {
        const body = await readJson(request);
        if (!body) return errorResponse("Invalid JSON request", 400);

        /* PROFILE UPDATE */
        if (path.startsWith("/profile/")) {
            const parts = path.split("/").filter(Boolean);
            const userId = positiveInt(parts[1]);
            if (parts.length !== 2 || !userId) return errorResponse("Invalid user ID", 400);
            const username = cleanString(body.username, 100);
            const email = cleanString(body.email, 200).toLowerCase();
            try {
                const result = await db.prepare(`
                    UPDATE users SET username = COALESCE(NULLIF(?, ''), username), email = COALESCE(NULLIF(?, ''), email), updated_at = CURRENT_TIMESTAMP WHERE id = ?
                `).bind(username, email, userId).run();
                if (result.meta.changes === 0) return errorResponse("User not found", 404);
                return json({ success: true, message: "Profile updated successfully" });
            } catch (error) {
                return errorResponse("Failed to update profile", 500, { error: error?.message || String(error) });
            }
        }

        /* ADMIN STORY UPDATE */
        if (path.startsWith("/admin/stories/")) {
            const parts = path.split("/").filter(Boolean);
            const storyId = positiveInt(parts[2]);
            const adminId = positiveInt(body.admin_id);
            const auth = await requireAdmin(db, adminId);
            if (!auth.ok) return auth.response;
            if (!storyId) return errorResponse("Invalid story ID", 400);
            const status = cleanString(body.status, 50);
            const visibility = cleanString(body.visibility, 50);
            try {
                const result = await db.prepare(`
                    UPDATE stories SET status = COALESCE(NULLIF(?, ''), status), visibility = COALESCE(NULLIF(?, ''), visibility), updated_at = CURRENT_TIMESTAMP WHERE id = ?
                `).bind(status, visibility, storyId).run();
                if (result.meta.changes === 0) return errorResponse("Story not found", 404);
                return json({ success: true, message: "Story updated successfully" });
            } catch (error) {
                return errorResponse("Failed to update story", 500, { error: error?.message || String(error) });
            }
        }

        return errorResponse("Endpoint not found", 404);
    }


    /* =================================================
       DELETE ROUTES
       ================================================= */

    if (method === "DELETE") {

        /* REMOVE BOOKMARK */
        if (path.startsWith("/bookmarks/")) {
            const parts = path.split("/").filter(Boolean);
            const userId = positiveInt(parts[1]);
            const storyId = positiveInt(parts[2]);
            if (parts.length !== 3 || !userId || !storyId) return errorResponse("Invalid user ID or story ID", 400);
            try {
                const result = await db.prepare(`DELETE FROM bookmarks WHERE user_id = ? AND story_id = ?`).bind(userId, storyId).run();
                if (result.meta.changes === 0) return errorResponse("Bookmark not found", 404);
                return json({ success: true, message: "Bookmark removed successfully" });
            } catch {
                return errorResponse("Failed to remove bookmark", 500);
            }
        }

        /* ADMIN DELETE STORY */
        if (path.startsWith("/admin/stories/")) {
            const parts = path.split("/").filter(Boolean);
            const storyId = positiveInt(parts[2]);
            const adminId = positiveInt(url.searchParams.get("admin_id"));
            const auth = await requireAdmin(db, adminId);
            if (!auth.ok) return auth.response;
            if (!storyId) return errorResponse("Invalid story ID", 400);
            try {
                const result = await db.prepare(`UPDATE stories SET status = 'deleted', visibility = 'private', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(storyId).run();
                if (result.meta.changes === 0) return errorResponse("Story not found", 404);
                return json({ success: true, message: "Story removed successfully" });
            } catch (error) {
                return errorResponse("Failed to remove story", 500, { error: error?.message || String(error) });
            }
        }

        return errorResponse("Endpoint not found", 404);
    }


    /* METHOD NOT ALLOWED */

    return errorResponse("Method not allowed", 405);
}
