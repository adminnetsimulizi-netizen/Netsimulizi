// functions/api/[[path]].js

const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=UTF-8",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization"
        }
    });

const errorResponse = (message, status = 400, extra = {}) =>
    json({ success: false, message, ...extra }, status);

const readJson = async request => {
    try {
        return await request.json();
    } catch {
        return null;
    }
};

const cleanString = (value, max = 5000) =>
    String(value ?? "").trim().slice(0, max);

const positiveInt = value => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
};

const numberOrNull = value => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

const slugify = value =>
    cleanString(value, 200)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");


// =====================================================
// PASSWORD
// =====================================================

const bytesToBase64 = bytes => {
    let binary = "";
    const size = 0x8000;

    for (let i = 0; i < bytes.length; i += size) {
        binary += String.fromCharCode(
            ...bytes.subarray(i, i + size)
        );
    }

    return btoa(binary);
};

const base64ToBytes = value => {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
};

const hashPassword = async password => {
    const salt = crypto.getRandomValues(new Uint8Array(16));

    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const buffer = await crypto.subtle.deriveBits(
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
        100000,
        bytesToBase64(salt),
        bytesToBase64(new Uint8Array(buffer))
    ].join("$");
};

const verifyPassword = async (password, stored) => {
    try {
        const parts = String(stored || "").split("$");

        if (parts.length !== 4 || parts[0] !== "pbkdf2") {
            return false;
        }

        const iterations = Number(parts[1]);

        const key = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(password),
            "PBKDF2",
            false,
            ["deriveBits"]
        );

        const buffer = await crypto.subtle.deriveBits(
            {
                name: "PBKDF2",
                salt: base64ToBytes(parts[2]),
                iterations,
                hash: "SHA-256"
            },
            key,
            256
        );

        const actual = new Uint8Array(buffer);
        const expected = base64ToBytes(parts[3]);

        if (actual.length !== expected.length) {
            return false;
        }

        let difference = 0;

        for (let i = 0; i < actual.length; i++) {
            difference |= actual[i] ^ expected[i];
        }

        return difference === 0;
    } catch {
        return false;
    }
};


// =====================================================
// DATABASE HELPERS
// =====================================================

const ensureExtraTables = async db => {

    const tables = [

        `
        CREATE TABLE IF NOT EXISTS story_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            author_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            slug TEXT,
            language TEXT DEFAULT 'sw',
            category_id INTEGER,
            description TEXT,
            cover_url TEXT,
            tags TEXT,
            is_ongoing INTEGER DEFAULT 1,
            is_paid INTEGER DEFAULT 0,
            status TEXT DEFAULT 'pending',
            originality_declared INTEGER DEFAULT 0,
            admin_note TEXT,
            reviewed_by INTEGER,
            reviewed_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        `,

        `
        CREATE TABLE IF NOT EXISTS author_earnings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            author_id INTEGER NOT NULL,
            story_id INTEGER,
            episode_id INTEGER,
            source_type TEXT DEFAULT 'story',
            gross_amount REAL DEFAULT 0,
            author_amount REAL DEFAULT 0,
            platform_amount REAL DEFAULT 0,
            status TEXT DEFAULT 'available',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        `,

        `
        CREATE TABLE IF NOT EXISTS withdrawals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            author_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            method TEXT,
            account_name TEXT,
            account_number TEXT,
            status TEXT DEFAULT 'pending',
            admin_note TEXT,
            processed_by INTEGER,
            processed_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        `,

        `
        CREATE TABLE IF NOT EXISTS recommendations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            story_id INTEGER NOT NULL,
            author_id INTEGER NOT NULL,
            gross_amount REAL DEFAULT 0,
            author_amount REAL DEFAULT 0,
            platform_amount REAL DEFAULT 0,
            status TEXT DEFAULT 'available',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        `
    ];

    for (const sql of tables) {
        try {
            await db.prepare(sql).run();
        } catch {
            // Existing tables are preserved.
        }
    }
};


// =====================================================
// READER
// users = READERS ONLY
// =====================================================

const getReader = async (db, readerId) => {
    const id = positiveInt(readerId);

    if (!id) return null;

    try {
        return await db.prepare(`
            SELECT
                id,
                username,
                email,
                status,
                created_at,
                updated_at
            FROM users
            WHERE id = ?
            LIMIT 1
        `).bind(id).first();
    } catch {
        return null;
    }
};


// =====================================================
// AUTHOR
// authors = AUTHORS ONLY
// =====================================================

const getAuthor = async (db, authorId) => {
    const id = positiveInt(authorId);

    if (!id) return null;

    try {
        return await db.prepare(`
            SELECT *
            FROM authors
            WHERE id = ?
            LIMIT 1
        `).bind(id).first();
    } catch {
        return null;
    }
};


// Compatibility name.
// IMPORTANT: value is now authors.id, NOT users.id.
const getAuthorByUserId = async (db, authorId) =>
    getAuthor(db, authorId);


// =====================================================
// ADMIN
// admins = ADMINS ONLY
// NO ADMIN TABLE IS CREATED HERE
// =====================================================

const getAdmin = async (db, adminId) => {
    const id = positiveInt(adminId);

    if (!id) return null;

    try {
        return await db.prepare(`
            SELECT *
            FROM admins
            WHERE id = ?
            LIMIT 1
        `).bind(id).first();
    } catch {
        return null;
    }
};

const requireAdmin = async (db, adminId) => {

    const admin = await getAdmin(db, adminId);

    if (!admin) {
        return {
            ok: false,
            response: errorResponse(
                "Admin account not found",
                404
            )
        };
    }

    if (
        admin.status &&
        String(admin.status).toLowerCase() !== "active"
    ) {
        return {
            ok: false,
            response: errorResponse(
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

// =====================================================
// MAIN
// =====================================================

export async function onRequest(context) {

    const { request, env } = context;

    // Prefer DB, but keep D1 compatibility.
    const db = env.DB || env.D1;

    if (!db) {
        return errorResponse(
            "D1 database binding not found",
            500
        );
    }

    const url = new URL(request.url);

    const path =
        url.pathname
            .replace(/^\/api/, "")
            .replace(/\/+$/, "") || "/";

    const method = request.method.toUpperCase();

    if (method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods":
                    "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers":
                    "Content-Type, Authorization"
            }
        });
    }

    try {
        await ensureExtraTables(db);
    } catch {
        // Existing database remains usable.
    }


    // =====================================================
    // GET
    // =====================================================

    if (method === "GET") {

        // -------------------------------------------------
        // HEALTH
        // -------------------------------------------------

        if (path === "/health") {
            return json({
                success: true,
                message: "Net Simulizi API is running",
                service: "netsimulizi-api",
                version: "3.0",
                account_structure: {
                    users: "readers",
                    authors: "authors",
                    admins: "admins"
                }
            });
        }


        // -------------------------------------------------
        // TEST
        // -------------------------------------------------

        if (path === "/test") {
            return json({
                success: true,
                message: "Net Simulizi API test successful"
            });
        }


        // -------------------------------------------------
        // DB TEST
        // -------------------------------------------------

        if (path === "/db-test") {
            try {
                const result = await db
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
                    500,
                    { error: error?.message || String(error) }
                );
            }
        }
     if (path === "/stories-test") {
    try {
        const result = await db
            .prepare("SELECT * FROM stories LIMIT 5")
            .all();

        return json({
            success: true,
            count: (result.results || []).length,
            stories: result.results || []
        });

    } catch (error) {
        return errorResponse(
            "Stories database test failed",
            500,
            {
                error: error?.message || String(error)
            }
        );
    }
}

        // -------------------------------------------------
        // CATEGORIES / GENRES
        // -------------------------------------------------

        if (
            path === "/categories" ||
            path === "/genres"
        ) {

            try {

                const language =
                    cleanString(
                        url.searchParams.get("language"),
                        20
                    );

                let sql = `
                    SELECT *
                    FROM categories
                    WHERE status = 'active'
                `;

                const params = [];

                if (language) {
                    sql += `
                        AND (
                            language = ?
                            OR language IS NULL
                            OR language = ''
                        )
                    `;

                    params.push(language);
                }

                sql += `
                    ORDER BY name ASC
                `;

                const result =
                    await db
                        .prepare(sql)
                        .bind(...params)
                        .all();

                return json({
                    success: true,
                    categories: result.results || [],
                    genres: result.results || []
                });

            } catch (error) {

                return errorResponse(
                    "Failed to load categories",
                    500,
                    { error: error?.message || String(error) }
                );
            }
        }


        // -------------------------------------------------
        // STORIES
        // -------------------------------------------------

     if (path === "/stories") {

    try {

        const language =
            cleanString(
                url.searchParams.get("language"),
                20
            );

        const search =
            cleanString(
                url.searchParams.get("search"),
                200
            );

        const authorId =
            positiveInt(
                url.searchParams.get("author_id")
            );

        let limit =
            Number(
                url.searchParams.get("limit") || 50
            );

        let offset =
            Number(
                url.searchParams.get("offset") || 0
            );

        if (!Number.isInteger(limit)) {
            limit = 50;
        }

        if (!Number.isInteger(offset)) {
            offset = 0;
        }

        limit = Math.min(
            Math.max(limit, 1),
            100
        );

        offset = Math.max(offset, 0);

        let sql = `
            SELECT
                stories.*,
                authors.id AS author_id,
                authors.display_name AS author_name
            FROM stories
            LEFT JOIN authors
                ON stories.author_id = authors.id
            WHERE 1 = 1
        `;

        const params = [];

        /*
         * Published stories.
         * NULL/empty status allowed temporarily
         * for existing database records.
         */
        sql += `
            AND (
                stories.status = 'published'
                OR stories.status IS NULL
                OR stories.status = ''
            )
        `;

        if (language) {

            sql += `
                AND stories.language = ?
            `;

            params.push(language);
        }

        if (authorId) {

            sql += `
                AND stories.author_id = ?
            `;

            params.push(authorId);
        }

        if (search) {

            sql += `
                AND (
                    LOWER(stories.title)
                    LIKE LOWER(?)

                    OR LOWER(
                        COALESCE(
                            stories.description,
                            ''
                        )
                    )
                    LIKE LOWER(?)
                )
            `;

            const term = `%${search}%`;

            params.push(
                term,
                term
            );
        }

        sql += `
            ORDER BY stories.id DESC
            LIMIT ? OFFSET ?
        `;

        params.push(
            limit,
            offset
        );

        const result =
            await db
                .prepare(sql)
                .bind(...params)
                .all();

        return json({

            success: true,

            stories:
                result.results || [],

            pagination: {

                limit,

                offset,

                count:
                    (result.results || []).length
            }

        });

    } catch (error) {

        return errorResponse(
            "Failed to load stories",
            500,
            {
                error:
                    error?.message ||
                    String(error)
            }
        );
    }
}


        // -------------------------------------------------
        // STORY EPISODES
        // -------------------------------------------------

        if (
            path.startsWith("/stories/") &&
            path.endsWith("/episodes")
        ) {

            const parts =
                path.split("/").filter(Boolean);

            const storyId =
                positiveInt(parts[1]);

            if (
                parts.length !== 3 ||
                parts[2] !== "episodes" ||
                !storyId
            ) {
                return errorResponse(
                    "Invalid story ID",
                    400
                );
            }

            try {

                const result =
                    await db
                        .prepare(`
                            SELECT *
                            FROM episodes
                            WHERE story_id = ?
                            AND status = 'published'
                            ORDER BY episode_number ASC
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
                    { error: error?.message || String(error) }
                );
            }
        }


        // -------------------------------------------------
        // STORY DETAILS
        // -------------------------------------------------

        if (path.startsWith("/stories/")) {

            const parts =
                path.split("/").filter(Boolean);

            const storyId =
                positiveInt(parts[1]);

            if (
                parts.length !== 2 ||
                !storyId
            ) {
                return errorResponse(
                    "Invalid story ID",
                    400
                );
            }

            try {

                const story =
                    await db
                        .prepare(`
                            SELECT
                                stories.*,
                                authors.id AS author_id,
                                authors.display_name AS author_name,
                                categories.id AS category_id,
                                categories.name AS category_name,
                                categories.slug AS category_slug
                            FROM stories
                            LEFT JOIN authors
                                ON stories.author_id = authors.id
                            LEFT JOIN categories
                                ON stories.category_id = categories.id
                            WHERE stories.id = ?
                            AND stories.status = 'published'
                            AND (
                                stories.visibility = 'public'
                                OR stories.visibility IS NULL
                                OR stories.visibility = ''
                            )
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
                    500,
                    { error: error?.message || String(error) }
                );
            }
        }


        // -------------------------------------------------
        // AUTHORS
        // -------------------------------------------------

        if (path === "/authors") {

            try {

                const search =
                    cleanString(
                        url.searchParams.get("search"),
                        200
                    );

                let sql = `
                    SELECT *
                    FROM authors
                `;

                const params = [];

                if (search) {
                    sql += `
                        WHERE LOWER(display_name)
                        LIKE LOWER(?)
                    `;

                    params.push(`%${search}%`);
                }

                sql += `
                    ORDER BY display_name ASC
                `;

                const result =
                    await db
                        .prepare(sql)
                        .bind(...params)
                        .all();

                return json({
                    success: true,
                    authors: result.results || []
                });

            } catch (error) {

                return errorResponse(
                    "Failed to load authors",
                    500,
                    { error: error?.message || String(error) }
                );
            }
        }


        // -------------------------------------------------
        // AUTHOR PROFILE
        // -------------------------------------------------

        if (path.startsWith("/authors/")) {

            const parts =
                path.split("/").filter(Boolean);

            const authorId =
                positiveInt(parts[1]);

            if (
                parts.length !== 2 ||
                !authorId
            ) {
                return errorResponse(
                    "Invalid author ID",
                    400
                );
            }

            const author =
                await getAuthor(db, authorId);

            if (!author) {
                return errorResponse(
                    "Author not found",
                    404
                );
            }

            return json({
                success: true,
                author
            });
        }


        // -------------------------------------------------
        // READER PROFILE
        // -------------------------------------------------

        if (path.startsWith("/profile/")) {

            const parts =
                path.split("/").filter(Boolean);

            const readerId =
                positiveInt(parts[1]);

            if (
                parts.length !== 2 ||
                !readerId
            ) {
                return errorResponse(
                    "Invalid reader ID",
                    400
                );
            }

            const reader =
                await getReader(db, readerId);

            if (!reader) {
                return errorResponse(
                    "Reader not found",
                    404
                );
            }

            return json({
                success: true,
                user: reader,
                reader
            });
        }


        // -------------------------------------------------
        // BOOKMARKS
        // -------------------------------------------------

        if (path.startsWith("/bookmarks/")) {

            const parts =
                path.split("/").filter(Boolean);

            const readerId =
                positiveInt(parts[1]);

            if (
                parts.length !== 2 ||
                !readerId
            ) {
                return errorResponse(
                    "Invalid reader ID",
                    400
                );
            }

            if (!(await getReader(db, readerId))) {
                return errorResponse(
                    "Reader not found",
                    404
                );
            }

            try {

                const result =
                    await db
                        .prepare(`
                            SELECT
                                bookmarks.*,
                                stories.title,
                                stories.slug,
                                stories.description,
                                stories.cover_url,
                                stories.language,
                                stories.readers_count,
                                authors.id AS author_id,
                                authors.display_name AS author_name,
                                categories.name AS category_name
                            FROM bookmarks
                            INNER JOIN stories
                                ON bookmarks.story_id = stories.id
                            LEFT JOIN authors
                                ON stories.author_id = authors.id
                            LEFT JOIN categories
                                ON stories.category_id = categories.id
                            WHERE bookmarks.user_id = ?
                            ORDER BY bookmarks.created_at DESC
                        `)
                        .bind(readerId)
                        .all();

                return json({
                    success: true,
                    bookmarks: result.results || []
                });

            } catch (error) {

                return errorResponse(
                    "Failed to load bookmarks",
                    500,
                    { error: error?.message || String(error) }
                );
            }
        }


        // -------------------------------------------------
        // READING PROGRESS
        // -------------------------------------------------

        if (
            path.startsWith("/reading-progress/")
        ) {

            const parts =
                path.split("/").filter(Boolean);

            const readerId =
                positiveInt(parts[1]);

            const storyId =
                positiveInt(parts[2]);

            if (
                parts.length !== 3 ||
                !readerId ||
                !storyId
            ) {
                return errorResponse(
                    "Invalid reader ID or story ID",
                    400
                );
            }

            try {

                const progress =
                    await db
                        .prepare(`
                            SELECT
                                reading_progress.*,
                                episodes.episode_number,
                                episodes.title AS episode_title,
                                stories.title AS story_title
                            FROM reading_progress
                            LEFT JOIN episodes
                                ON reading_progress.episode_id =
                                   episodes.id
                            INNER JOIN stories
                                ON reading_progress.story_id =
                                   stories.id
                            WHERE reading_progress.user_id = ?
                            AND reading_progress.story_id = ?
                            LIMIT 1
                        `)
                        .bind(readerId, storyId)
                        .first();

                return json({
                    success: true,
                    progress: progress || null
                });

            } catch (error) {

                return errorResponse(
                    "Failed to load reading progress",
                    500,
                    { error: error?.message || String(error) }
                );
            }
        }


        // -------------------------------------------------
        // READING HISTORY
        // -------------------------------------------------

        if (
            path.startsWith("/reading-history/")
        ) {

            const parts =
                path.split("/").filter(Boolean);

            const readerId =
                positiveInt(parts[1]);

            if (
                parts.length !== 2 ||
                !readerId
            ) {
                return errorResponse(
                    "Invalid reader ID",
                    400
                );
            }

            try {

                const result =
                    await db
                        .prepare(`
                            SELECT
                                reading_progress.*,
                                stories.title AS story_title,
                                stories.slug AS story_slug,
                                stories.cover_url,
                                episodes.episode_number,
                                episodes.title AS episode_title
                            FROM reading_progress
                            INNER JOIN stories
                                ON reading_progress.story_id =
                                   stories.id
                            LEFT JOIN episodes
                                ON reading_progress.episode_id =
                                   episodes.id
                            WHERE reading_progress.user_id = ?
                            ORDER BY reading_progress.last_read_at DESC
                        `)
                        .bind(readerId)
                        .all();

                return json({
                    success: true,
                    history: result.results || []
                });

            } catch (error) {

                return errorResponse(
                    "Failed to load reading history",
                    500,
                    { error: error?.message || String(error) }
                );
            }
        }


        // -------------------------------------------------
        // AUTHOR STORIES
        // URL ID = authors.id
        // -------------------------------------------------

        if (
            path.startsWith("/author/stories/")
        ) {

            const parts =
                path.split("/").filter(Boolean);

            const authorId =
                positiveInt(parts[2]);

            if (
                parts.length !== 3 ||
                !authorId
            ) {
                return errorResponse(
                    "Invalid author ID",
                    400
                );
            }

            const author =
                await getAuthor(db, authorId);

            if (!author) {
                return errorResponse(
                    "Author profile not found",
                    404
                );
            }

            try {

                const result =
                    await db
                        .prepare(`
                            SELECT
                                stories.*,
                                categories.name AS category_name
                            FROM stories
                            LEFT JOIN categories
                                ON stories.category_id =
                                   categories.id
                            WHERE stories.author_id = ?
                            ORDER BY stories.created_at DESC
                        `)
                        .bind(author.id)
                        .all();

                return json({
                    success: true,
                    stories: result.results || []
                });

            } catch (error) {

                return errorResponse(
                    "Failed to load author stories",
                    500,
                    { error: error?.message || String(error) }
                );
            }
        }


        // -------------------------------------------------
        // AUTHOR SUBMISSIONS
        // -------------------------------------------------

        if (
            path.startsWith("/author/submissions/")
        ) {

            const parts =
                path.split("/").filter(Boolean);

            const authorId =
                positiveInt(parts[2]);

            if (
                parts.length !== 3 ||
                !authorId
            ) {
                return errorResponse(
                    "Invalid author ID",
                    400
                );
            }

            if (!(await getAuthor(db, authorId))) {
                return errorResponse(
                    "Author profile not found",
                    404
                );
            }

            try {

                const result =
                    await db
                        .prepare(`
                            SELECT *
                            FROM story_submissions
                            WHERE author_id = ?
                            ORDER BY created_at DESC
                        `)
                        .bind(authorId)
                        .all();

                return json({
                    success: true,
                    submissions: result.results || []
                });

            } catch (error) {

                return errorResponse(
                    "Failed to load submissions",
                    500,
                    { error: error?.message || String(error) }
                );
            }
        }


        // -------------------------------------------------
        // AUTHOR WALLET
        // -------------------------------------------------

        if (path.startsWith("/wallet/")) {

            const parts =
                path.split("/").filter(Boolean);

            const authorId =
                positiveInt(parts[1]);

            if (
                parts.length !== 2 ||
                !authorId
            ) {
                return errorResponse(
                    "Invalid author ID",
                    400
                );
            }

            if (!(await getAuthor(db, authorId))) {
                return errorResponse(
                    "Author profile not found",
                    404
                );
            }

            try {

                const earnings =
                    await db
                        .prepare(`
                            SELECT
                                COALESCE(SUM(author_amount),0)
                                    AS total_earnings,

                                COALESCE(
                                    SUM(
                                        CASE
                                            WHEN status = 'available'
                                            THEN author_amount
                                            ELSE 0
                                        END
                                    ),0
                                ) AS available_balance,

                                COALESCE(
                                    SUM(
                                        CASE
                                            WHEN status = 'paid'
                                            THEN author_amount
                                            ELSE 0
                                        END
                                    ),0
                                ) AS paid_earnings
                            FROM author_earnings
                            WHERE author_id = ?
                        `)
                        .bind(authorId)
                        .first();

                const recommendations =
                    await db
                        .prepare(`
                            SELECT
                                COALESCE(
                                    SUM(author_amount),0
                                ) AS total
                            FROM recommendations
                            WHERE author_id = ?
                        `)
                        .bind(authorId)
                        .first();

                const withdrawals =
                    await db
                        .prepare(`
                            SELECT
                                COALESCE(
                                    SUM(
                                        CASE
                                            WHEN status = 'pending'
                                            THEN amount
                                            ELSE 0
                                        END
                                    ),0
                                ) AS pending,

                                COALESCE(
                                    SUM(
                                        CASE
                                            WHEN status IN
                                                ('approved','paid')
                                            THEN amount
                                            ELSE 0
                                        END
                                    ),0
                                ) AS withdrawn
                            FROM withdrawals
                            WHERE author_id = ?
                        `)
                        .bind(authorId)
                        .first();

                const available =
                    Number(
                        earnings?.available_balance || 0
                    );

                return json({
                    success: true,
                    wallet: {
                        total_earnings:
                            Number(
                                earnings?.total_earnings || 0
                            ),

                        available_balance:
                            available,

                        paid_earnings:
                            Number(
                                earnings?.paid_earnings || 0
                            ),

                        recommendation_earnings:
                            Number(
                                recommendations?.total || 0
                            ),

                        pending_withdrawals:
                            Number(
                                withdrawals?.pending || 0
                            ),

                        withdrawn:
                            Number(
                                withdrawals?.withdrawn || 0
                            ),

                        withdrawal_threshold:
                            50000,

                        can_withdraw:
                            available >= 50000
                    }
                });

            } catch (error) {

                return errorResponse(
                    "Failed to load wallet",
                    500,
                    { error: error?.message || String(error) }
                );
            }
        }


        // -------------------------------------------------
        // AUTHOR WITHDRAWAL HISTORY
        // -------------------------------------------------

        if (path.startsWith("/withdrawals/")) {

            const parts =
                path.split("/").filter(Boolean);

            const authorId =
                positiveInt(parts[1]);

            if (
                parts.length !== 2 ||
                !authorId
            ) {
                return errorResponse(
                    "Invalid author ID",
                    400
                );
            }

            if (!(await getAuthor(db, authorId))) {
                return errorResponse(
                    "Author profile not found",
                    404
                );
            }

            try {

                const result =
                    await db
                        .prepare(`
                            SELECT *
                            FROM withdrawals
                            WHERE author_id = ?
                            ORDER BY created_at DESC
                        `)
                        .bind(authorId)
                        .all();

                return json({
                    success: true,
                    withdrawals:
                        result.results || []
                });

            } catch (error) {

                return errorResponse(
                    "Failed to load withdrawals",
                    500,
                    { error: error?.message || String(error) }
                );
            }
        }


        // -------------------------------------------------
        // ADMIN SUBMISSIONS
        // -------------------------------------------------

        if (path === "/admin/submissions") {

            const adminId =
                positiveInt(
                    url.searchParams.get("admin_id")
                );

            const auth =
                await requireAdmin(db, adminId);

            if (!auth.ok) {
                return auth.response;
            }

            try {

                const status =
                    cleanString(
                        url.searchParams.get("status"),
                        50
                    );

                let sql = `
                    SELECT
                        story_submissions.*,
                        authors.display_name AS author_name
                    FROM story_submissions
                    LEFT JOIN authors
                        ON story_submissions.author_id =
                           authors.id
                `;

                const params = [];

                if (status) {
                    sql += `
                        WHERE story_submissions.status = ?
                    `;

                    params.push(status);
                }

                sql += `
                    ORDER BY story_submissions.created_at DESC
                `;

                const result =
                    await db
                        .prepare(sql)
                        .bind(...params)
                        .all();

                return json({
                    success: true,
                    submissions:
                        result.results || []
                });

            } catch (error) {

                return errorResponse(
                    "Failed to load admin submissions",
                    500,
                    { error: error?.message || String(error) }
                );
            }
        }


        // -------------------------------------------------
        // ADMIN WITHDRAWALS
        // -------------------------------------------------

        if (path === "/admin/withdrawals") {

            const adminId =
                positiveInt(
                    url.searchParams.get("admin_id")
                );

            const auth =
                await requireAdmin(db, adminId);

            if (!auth.ok) {
                return auth.response;
            }

            try {

                const result =
                    await db
                        .prepare(`
                            SELECT
                                withdrawals.*,
                                authors.display_name AS author_name
                            FROM withdrawals
                            LEFT JOIN authors
                                ON withdrawals.author_id =
                                   authors.id
                            ORDER BY withdrawals.created_at DESC
                        `)
                        .all();

                return json({
                    success: true,
                    withdrawals:
                        result.results || []
                });

            } catch (error) {

                return errorResponse(
                    "Failed to load admin withdrawals",
                    500,
                    { error: error?.message || String(error) }
                );
            }
        }


        // -------------------------------------------------
        // ADMIN STATS
        // -------------------------------------------------

        if (path === "/admin/stats") {

            const adminId =
                positiveInt(
                    url.searchParams.get("admin_id")
                );

            const auth =
                await requireAdmin(db, adminId);

            if (!auth.ok) {
                return auth.response;
            }

            try {

                const users =
                    await db
                        .prepare(
                            "SELECT COUNT(*) AS total FROM users"
                        )
                        .first();

                const authors =
                    await db
                        .prepare(
                            "SELECT COUNT(*) AS total FROM authors"
                        )
                        .first();

                const stories =
                    await db
                        .prepare(
                            "SELECT COUNT(*) AS total FROM stories"
                        )
                        .first();

                const published =
                    await db
                        .prepare(`
                            SELECT COUNT(*) AS total
                            FROM stories
                            WHERE status = 'published'
                        `)
                        .first();

                const submissions =
                    await db
                        .prepare(`
                            SELECT COUNT(*) AS total
                            FROM story_submissions
                            WHERE status = 'pending'
                        `)
                        .first();

                const withdrawals =
                    await db
                        .prepare(`
                            SELECT COUNT(*) AS total
                            FROM withdrawals
                            WHERE status = 'pending'
                        `)
                        .first();

                return json({
                    success: true,
                    stats: {
                        readers:
                            Number(users?.total || 0),

                        users:
                            Number(users?.total || 0),

                        authors:
                            Number(authors?.total || 0),

                        stories:
                            Number(stories?.total || 0),

                        published_stories:
                            Number(published?.total || 0),

                        pending_submissions:
                            Number(submissions?.total || 0),

                        pending_withdrawals:
                            Number(withdrawals?.total || 0)
                    }
                });

            } catch (error) {

                return errorResponse(
                    "Failed to load admin statistics",
                    500,
                    { error: error?.message || String(error) }
                );
            }
        }


        return errorResponse(
            "Endpoint not found",
            404
        );
    }


    // =====================================================
    // POST
    // =====================================================

    if (method === "POST") {

        const body = await readJson(request);

        if (!body) {
            return errorResponse(
                "Invalid JSON request",
                400
            );
        }

     // -------------------------------------------------
// AUTHOR LOGIN
// -------------------------------------------------

        if (path === "/author/login") {

            const login =
                cleanString(body.login, 200);

            const password =
                String(body.password || "");

            if (!login) {
                return errorResponse(
                    "Username or email is required",
                    400
                );
            }

            if (!password) {
                return errorResponse(
                    "Password is required",
                    400
                );
            }

            try {

                /*
                 * Author identity = authors.id
                 *
                 * Current database:
                 * authors.user_id -> users.id
                 */

                const author =
                    await db
                        .prepare(`
                            SELECT
                                authors.id,
                                authors.user_id,
                                authors.display_name,
                                authors.bio,
                                
                                authors.approval_status,

                                users.username,
                                users.email,
                                users.password_hash,
                                users.status AS user_status

                            FROM authors

                            INNER JOIN users
                                ON authors.user_id = users.id

                            WHERE
                                users.username = ?
                                OR users.email = ?

                            LIMIT 1
                        `)
                        .bind(
                            login,
                            login.toLowerCase()
                        )
                        .first();

                if (!author) {
                    return errorResponse(
                        "Invalid author username/email or password",
                        401
                    );
                }

                if (
                    author.user_status &&
                    String(author.user_status).toLowerCase() !== "active"
                ) {
                    return errorResponse(
                        "Author account is not active",
                        403
                    );
                }

                /*
                 * Author must be approved before login.
                 *
                 * Test Author currently has:
                 * approval_status = pending
                 *
                 * Therefore it will correctly return
                 * the pending message until approved.
                 */

                if (
                    author.approval_status &&
                    String(author.approval_status).toLowerCase() !== "approved"
                ) {
                    return errorResponse(
                        "Author account is pending approval",
                        403
                    );
                }

                const validPassword =
                    await verifyPassword(
                        password,
                        author.password_hash
                    );

                if (!validPassword) {
                    return errorResponse(
                        "Invalid author username/email or password",
                        401
                    );
                }

                return json({
                    success: true,

                    message:
                        "Author login successful",

                    author: {
                        id: author.id,
                        user_id: author.user_id,
                        username: author.username,
                        email: author.email,
                        display_name: author.display_name,
                        bio: author.bio,
                        avatar_url: author.avatar_url,
                        approval_status:
                            author.approval_status ||
                            "approved"
                    }
                });

            } catch (error) {

                console.error(
                    "Author login error:",
                    error
                );

                return errorResponse(
                    error?.message ||
                    String(error),
                    500,
                    {
                        error:
                            error?.message ||
                            String(error)
                    }
                );
            }
        }
        // -------------------------------------------------
        // READER REGISTER
        // -------------------------------------------------

        if (path === "/register") {

            const username =
                cleanString(body.username, 100);

            const email =
                cleanString(body.email, 200)
                    .toLowerCase();

            const password =
                String(body.password || "");

            if (!username) {
                return errorResponse(
                    "Username is required",
                    400
                );
            }

            if (!email) {
                return errorResponse(
                    "Email is required",
                    400
                );
            }

            if (password.length < 6) {
                return errorResponse(
                    "Password must be at least 6 characters",
                    400
                );
            }

            try {

                const existing =
                    await db
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

                const passwordHash =
                    await hashPassword(password);

                /*
                 * users = READERS ONLY.
                 *
                 * role haitumiki tena kwenye logic.
                 * Tunaiweka tu ikiwa legacy schema
                 * inailazimisha.
                 */

                let result;

                try {

                    result =
                        await db
                            .prepare(`
                                INSERT INTO users (
                                    username,
                                    email,
                                    password_hash,
                                    status
                                )
                                VALUES (?, ?, ?, 'active')
                            `)
                            .bind(
                                username,
                                email,
                                passwordHash
                            )
                            .run();

                } catch {

                    /*
                     * Compatibility kwa database ya zamani
                     * ambayo bado ina role NOT NULL.
                     *
                     * Hii haibadilishi architecture:
                     * users bado ni Readers pekee.
                     */

                    result =
                        await db
                            .prepare(`
                                INSERT INTO users (
                                    username,
                                    email,
                                    password_hash,
                                    role,
                                    status
                                )
                                VALUES (
                                    ?, ?, ?, 'reader', 'active'
                                )
                            `)
                            .bind(
                                username,
                                email,
                                passwordHash
                            )
                            .run();
                }

                return json({
                    success: true,
                    message:
                        "Reader registration successful",

                    user: {
                        id:
                            result.meta.last_row_id,

                        username,
                        email,

                        account_type:
                            "reader",

                        status:
                            "active"
                    }
                }, 201);

            } catch (error) {

                return errorResponse(
                    "Registration failed",
                    500,
                    { error: error?.message || String(error) }
                );
            }
        }


        // -------------------------------------------------
        // READER LOGIN
        // -------------------------------------------------

        if (path === "/login") {

            const login =
                cleanString(body.login, 200);

            const password =
                String(body.password || "");

            if (!login || !password) {
                return errorResponse(
                    "Username/email and password are required",
                    400
                );
            }

            try {

                const reader =
                    await db
                        .prepare(`
                            SELECT
                                id,
                                username,
                                email,
                                password_hash,
                                status,
                                created_at,
                                updated_at
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

                if (!reader) {
                    return errorResponse(
                        "Invalid username/email or password",
                        401
                    );
                }

                if (reader.status !== "active") {
                    return errorResponse(
                        "Your account is not active",
                        403
                    );
                }

                const valid =
                    await verifyPassword(
                        password,
                        reader.password_hash
                    );

                if (!valid) {
                    return errorResponse(
                        "Invalid username/email or password",
                        401
                    );
                }

                return json({
                    success: true,
                    message: "Login successful",

                    user: {
                        id: reader.id,
                        username: reader.username,
                        email: reader.email,
                        account_type: "reader",
                        status: reader.status,
                        created_at: reader.created_at,
                        updated_at: reader.updated_at
                    }
                });

            } catch (error) {

                return errorResponse(
                    "Login failed",
                    500,
                    { error: error?.message || String(error) }
                );
            }
        }


        // -------------------------------------------------
        // ADD BOOKMARK
        // -------------------------------------------------

        if (path === "/bookmarks") {

            const readerId =
                positiveInt(body.user_id);

            const storyId =
                positiveInt(body.story_id);

            if (!readerId || !storyId) {
                return errorResponse(
                    "Reader ID and story ID are required",
                    400
                );
            }

            if (!(await getReader(db, readerId))) {
                return errorResponse(
                    "Reader not found",
                    404
                );
            }

            try {

                const story =
                    await db
                        .prepare(`
                            SELECT id
                            FROM stories
                            WHERE id = ?
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

                /*
                 * Fix:
                 * UNIQUE(user_id, story_id)
                 * haitasababisha 500 tena.
                 */

                const existing =
                    await db
                        .prepare(`
                            SELECT id
                            FROM bookmarks
                            WHERE user_id = ?
                            AND story_id = ?
                            LIMIT 1
                        `)
                        .bind(readerId, storyId)
                        .first();

                if (existing) {
                    return json({
                        success: true,
                        message:
                            "Story already bookmarked",
                        bookmark_id:
                            existing.id
                    });
                }

                const result =
                    await db
                        .prepare(`
                            INSERT INTO bookmarks (
                                user_id,
                                story_id
                            )
                            VALUES (?, ?)
                        `)
                        .bind(readerId, storyId)
                        .run();

                return json({
                    success: true,
                    message:
                        "Story bookmarked successfully",
                    bookmark_id:
                        result.meta.last_row_id
                }, 201);

            } catch (error) {

                return errorResponse(
                    "Failed to add bookmark",
                    500,
                    { error: error?.message || String(error) }
                );
            }
        }


        // -------------------------------------------------
        // READING PROGRESS
        // -------------------------------------------------

        if (path === "/reading-progress") {

            const readerId =
                positiveInt(body.user_id);

            const storyId =
                positiveInt(body.story_id);

            const episodeId =
                positiveInt(body.episode_id);

            let progress =
                Number(body.progress_percent);

            if (!readerId || !storyId || !episodeId) {
                return errorResponse(
                    "Reader ID, story ID and episode ID are required",
                    400
                );
            }

            if (!Number.isFinite(progress)) {
                progress = 0;
            }

            progress =
                Math.max(
                    0,
                    Math.min(
                        100,
                        Math.round(progress)
                    )
                );

            try {

                const episode =
                    await db
                        .prepare(`
                            SELECT id
                            FROM episodes
                            WHERE id = ?
                            AND story_id = ?
                            LIMIT 1
                        `)
                        .bind(
                            episodeId,
                            storyId
                        )
                        .first();

                if (!episode) {
                    return errorResponse(
                        "Episode not found for this story",
                        404
                    );
                }

                await db
                    .prepare(`
                        INSERT INTO reading_progress (
                            user_id,
                            story_id,
                            episode_id,
                            progress_percent,
                            last_read_at
                        )
                        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(
                            user_id,
                            story_id
                        )
                        DO UPDATE SET
                            episode_id =
                                excluded.episode_id,
                            progress_percent =
                                excluded.progress_percent,
                            last_read_at =
                                CURRENT_TIMESTAMP
                    `)
                    .bind(
                        readerId,
                        storyId,
                        episodeId,
                        progress
                    )
                    .run();

                return json({
                    success: true,
                    message:
                        "Reading progress saved",
                    progress: {
                        user_id: readerId,
                        story_id: storyId,
                        episode_id: episodeId,
                        progress_percent: progress
                    }
                });

            } catch (error) {

                return errorResponse(
                    "Failed to save reading progress",
                    500,
                    { error: error?.message || String(error) }
                );
            }
        }


        // -------------------------------------------------
        // AUTHOR STORY SUBMISSION
        // -------------------------------------------------

        if (path === "/author/stories") {

            /*
             * author_id = authors.id
             *
             * user_id imeachwa kama compatibility tu.
             * Haifanyi lookup kwenye users.
             */

            const authorId =
                positiveInt(
                    body.author_id ||
                    body.user_id
                );

            if (!authorId) {
                return errorResponse(
                    "Author ID is required",
                    400
                );
            }

            const author =
                await getAuthor(db, authorId);

            if (!author) {
                return errorResponse(
                    "Author profile not found",
                    404
                );
            }

            if (
                author.status &&
                String(author.status).toLowerCase() !== "active"
            ) {
                return errorResponse(
                    "Author account is not active",
                    403
                );
            }

            const title =
                cleanString(body.title, 300);

            const description =
                cleanString(body.description, 10000);

            const language =
                cleanString(
                    body.language || "sw",
                    20
                );

            const categoryId =
                positiveInt(body.category_id);

            const coverUrl =
                cleanString(
                    body.cover_url ||
                    body.cover ||
                    "",
                    1000
                );

            const tags =
                cleanString(body.tags, 1000);

            const isOngoing =
                body.is_ongoing === false ||
                body.is_ongoing === 0
                    ? 0
                    : 1;

            const isPaid =
                body.is_paid === true ||
                body.is_paid === 1
                    ? 1
                    : 0;

            const originality =
                body.originality_declared === true ||
                body.originality_declared === 1 ||
                body.originality === true;

            if (!title) {
                return errorResponse(
                    "Story title is required",
                    400
                );
            }

            if (!originality) {
                return errorResponse(
                    "Originality declaration is required",
                    400
                );
            }

            try {

                const slug =
                    `${slugify(title)}-${Date.now()}`;

                const result =
                    await db
                        .prepare(`
                            INSERT INTO story_submissions (
                                author_id,
                                title,
                                slug,
                                language,
                                category_id,
                                description,
                                cover_url,
                                tags,
                                is_ongoing,
                                is_paid,
                                status,
                                originality_declared
                            )
                            VALUES (
                                ?, ?, ?, ?, ?, ?, ?, ?,
                                ?, ?, 'pending', 1
                            )
                        `)
                        .bind(
                            authorId,
                            title,
                            slug,
                            language,
                            categoryId,
                            description,
                            coverUrl,
                            tags,
                            isOngoing,
                            isPaid
                        )
                        .run();

                return json({
                    success: true,
                    message:
                        "Story submitted successfully",
                    submission_id:
                        result.meta.last_row_id,
                    status: "pending"
                }, 201);

            } catch (error) {

                return errorResponse(
                    "Failed to submit story",
                    500,
                    { error: error?.message || String(error) }
                );
            }
        }


        // -------------------------------------------------
        // ADMIN APPROVE STORY
        // -------------------------------------------------

        if (
            path === "/admin/submissions/approve"
        ) {

            const adminId =
                positiveInt(body.admin_id);

            const submissionId =
                positiveInt(body.submission_id);

            const auth =
                await requireAdmin(db, adminId);

            if (!auth.ok) {
                return auth.response;
            }

            if (!submissionId) {
                return errorResponse(
                    "Invalid submission ID",
                    400
                );
            }

            try {

                const submission =
                    await db
                        .prepare(`
                            SELECT *
                            FROM story_submissions
                            WHERE id = ?
                            LIMIT 1
                        `)
                        .bind(submissionId)
                        .first();

                if (!submission) {
                    return errorResponse(
                        "Submission not found",
                        404
                    );
                }

                if (submission.status === "approved") {
                    return errorResponse(
                        "Submission is already approved",
                        409
                    );
                }

                const author =
                    await getAuthor(
                        db,
                        submission.author_id
                    );

                if (!author) {
                    return errorResponse(
                        "Author not found",
                        404
                    );
                }

                const storyResult =
                    await db
                        .prepare(`
                            INSERT INTO stories (
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
                                ?, ?, ?, ?, ?, 'published',
                                'public', 0, ?, ?, 
                                CURRENT_TIMESTAMP,
                                CURRENT_TIMESTAMP
                            )
                        `)
                        .bind(
                            submission.title,
                            submission.slug,
                            submission.description,
                            submission.cover_url,
                            submission.language,
                            submission.author_id,
                            submission.category_id
                        )
                        .run();

                const storyId =
                    storyResult.meta.last_row_id;

                await db
                    .prepare(`
                        UPDATE story_submissions
                        SET
                            status = 'approved',
                            reviewed_by = ?,
                            reviewed_at = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `)
                    .bind(
                        adminId,
                        submissionId
                    )
                    .run();

                return json({
                    success: true,
                    message:
                        "Submission approved and story published",
                    story_id: storyId,
                    submission_id: submissionId,
                    status: "published"
                });

            } catch (error) {

                return errorResponse(
                    "Failed to approve submission",
                    500,
                    { error: error?.message || String(error) }
                );
            }
        }


        // -------------------------------------------------
        // ADMIN REJECT STORY
        // -------------------------------------------------

        if (
            path === "/admin/submissions/reject"
        ) {

            const adminId =
                positiveInt(body.admin_id);

            const submissionId =
                positiveInt(body.submission_id);

            const note =
                cleanString(
                    body.admin_note,
                    5000
                );

            const auth =
                await requireAdmin(db, adminId);

            if (!auth.ok) {
                return auth.response;
            }

            if (!submissionId) {
                return errorResponse(
                    "Invalid submission ID",
                    400
                );
            }

            try {

                const result =
                    await db
                        .prepare(`
                            UPDATE story_submissions
                            SET
                                status = 'rejected',
                                admin_note = ?,
                                reviewed_by = ?,
                                reviewed_at = CURRENT_TIMESTAMP,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = ?
                        `)
                        .bind(
                            note,
                            adminId,
                            submissionId
                        )
                        .run();

                if (!result.meta.changes) {
                    return errorResponse(
                        "Submission not found",
                        404
                    );
                }

                return json({
                    success: true,
                    message:
                        "Submission rejected",
                    submission_id:
                        submissionId,
                    status: "rejected"
                });

            } catch (error) {

                return errorResponse(
                    "Failed to reject submission",
                    500,
                    { error: error?.message || String(error) }
                );
            }
        }


        // -------------------------------------------------
        // AUTHOR CREATE EPISODE
        // -------------------------------------------------

        if (path === "/author/episodes") {

            const authorId =
                positiveInt(
                    body.author_id ||
                    body.user_id
                );

            const storyId =
                positiveInt(body.story_id);

            const title =
                cleanString(body.title, 300);

            const content =
                cleanString(body.content, 1000000);

            let episodeNumber =
                positiveInt(
                    body.episode_number
                );

            if (!authorId || !storyId) {
                return errorResponse(
                    "Author ID and story ID are required",
                    400
                );
            }

            if (!title || !content) {
                return errorResponse(
                    "Episode title and content are required",
                    400
                );
            }

            const author =
                await getAuthor(db, authorId);

            if (!author) {
                return errorResponse(
                    "Author profile not found",
                    404
                );
            }

            try {

                const story =
                    await db
                        .prepare(`
                            SELECT id, author_id
                            FROM stories
                            WHERE id = ?
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

                if (
                    Number(story.author_id) !==
                    Number(author.id)
                ) {
                    return errorResponse(
                        "You do not own this story",
                        403
                    );
                }

                if (!episodeNumber) {

                    const last =
                        await db
                            .prepare(`
                                SELECT
                                    MAX(episode_number)
                                    AS max_episode
                                FROM episodes
                                WHERE story_id = ?
                            `)
                            .bind(storyId)
                            .first();

                    episodeNumber =
                        Number(
                            last?.max_episode || 0
                        ) + 1;
                }

                const isFree =
                    body.is_free === false ||
                    body.is_free === 0
                        ? 0
                        : 1;

                let price =
                    Number(body.price || 0);

                if (
                    !Number.isFinite(price) ||
                    price < 0
                ) {
                    price = 0;
                }

                const result =
                    await db
                        .prepare(`
                            INSERT INTO episodes (
                                story_id,
                                episode_number,
                                title,
                                content,
                                is_free,
                                price,
                                status,
                                created_at,
                                updated_at
                            )
                            VALUES (
                                ?, ?, ?, ?, ?, ?,
                                'published',
                                CURRENT_TIMESTAMP,
                                CURRENT_TIMESTAMP
                            )
                        `)
                        .bind(
                            storyId,
                            episodeNumber,
                            title,
                            content,
                            isFree,
                            price
                        )
                        .run();

                return json({
                    success: true,
                    message:
                        "Episode created successfully",
                    episode_id:
                        result.meta.last_row_id
                }, 201);

            } catch (error) {

                return errorResponse(
                    "Failed to create episode",
                    500,
                    { error: error?.message || String(error) }
                );
            }
        }


        // -------------------------------------------------
        // AUTHOR EARNINGS
        // -------------------------------------------------

        if (path === "/author/earnings") {

            const authorId =
                positiveInt(
                    body.author_id ||
                    body.user_id
                );

            const gross =
                Number(body.amount || 0);

            if (!authorId) {
                return errorResponse(
                    "Author ID is required",
                    400
                );
            }

            if (
                !Number.isFinite(gross) ||
                gross <= 0
            ) {
                return errorResponse(
                    "Invalid earning amount",
                    400
                );
            }

            const author =
                await getAuthor(db, authorId);

            if (!author) {
                return errorResponse(
                    "Author profile not found",
                    404
                );
            }

            const sourceType =
                cleanString(
                    body.source_type || "story",
                    50
                );

            const recommendation =
                sourceType === "recommendation";

            const authorRate =
                recommendation ? 0.50 : 0.70;

            const platformRate =
                recommendation ? 0.50 : 0.30;

            const authorAmount =
                Math.round(
                    gross *
                    authorRate *
                    100
                ) / 100;

            const platformAmount =
                Math.round(
                    gross *
                    platformRate *
                    100
                ) / 100;

            try {

                if (recommendation) {

                    const storyId =
                        positiveInt(body.story_id);

                    if (!storyId) {
                        return errorResponse(
                            "Story ID is required for recommendation earnings",
                            400
                        );
                    }

                    await db
                        .prepare(`
                            INSERT INTO recommendations (
                                story_id,
                                author_id,
                                gross_amount,
                                author_amount,
                                platform_amount,
                                status
                            )
                            VALUES (?, ?, ?, ?, ?, 'available')
                        `)
                        .bind(
                            storyId,
                            author.id,
                            gross,
                            authorAmount,
                            platformAmount
                        )
                        .run();

                } else {

                    await db
                        .prepare(`
                            INSERT INTO author_earnings (
                                author_id,
                                story_id,
                                episode_id,
                                source_type,
                                gross_amount,
                                author_amount,
                                platform_amount,
                                status
                            )
                            VALUES (
                                ?, ?, ?, ?, ?, ?, ?, 'available'
                            )
                        `)
                        .bind(
                            author.id,
                            positiveInt(body.story_id),
                            positiveInt(body.episode_id),
                            sourceType,
                            gross,
                            authorAmount,
                            platformAmount
                        )
                        .run();
                }

                return json({
                    success: true,
                    message:
                        "Earning recorded",

                    distribution: {
                        gross_amount: gross,
                        author_rate: authorRate,
                        platform_rate: platformRate,
                        author_amount: authorAmount,
                        platform_amount: platformAmount
                    }
                });

            } catch (error) {

                return errorResponse(
                    "Failed to record earning",
                    500,
                    { error: error?.message || String(error) }
                );
            }
        }


        // -------------------------------------------------
        // AUTHOR WITHDRAWAL
        // -------------------------------------------------

             // -------------------------------------------------
        // ADMIN APPROVE WITHDRAWAL
        // -------------------------------------------------

        if (
            path === "/admin/withdrawals/approve"
        ) {

            const adminId =
                positiveInt(body.admin_id);

            const withdrawalId =
                positiveInt(body.withdrawal_id);

            const auth =
                await requireAdmin(db, adminId);

            if (!auth.ok) {
                return auth.response;
            }

            if (!withdrawalId) {
                return errorResponse(
                    "Invalid withdrawal ID",
                    400
                );
            }

            try {

                const withdrawal =
                    await db
                        .prepare(`
                            SELECT *
                            FROM withdrawals
                            WHERE id = ?
                            LIMIT 1
                        `)
                        .bind(withdrawalId)
                        .first();

                if (!withdrawal) {
                    return errorResponse(
                        "Withdrawal not found",
                        404
                    );
                }

                if (
                    String(withdrawal.status).toLowerCase() !==
                    "pending"
                ) {
                    return errorResponse(
                        "Withdrawal is not pending",
                        409
                    );
                }

                const withdrawalAmount =
                    Number(withdrawal.amount || 0);

                if (
                    !Number.isFinite(withdrawalAmount) ||
                    withdrawalAmount <= 0
                ) {
                    return errorResponse(
                        "Invalid withdrawal amount",
                        400
                    );
                }


                // -------------------------------------------------
                // GET AVAILABLE EARNINGS FIRST
                // IMPORTANT:
                // Hakuna earning itabadilishwa kabla ya
                // kuhakikisha balance inatosha.
                // -------------------------------------------------

                const balance =
                    await db
                        .prepare(`
                            SELECT
                                COALESCE(
                                    SUM(author_amount),
                                    0
                                ) AS available
                            FROM author_earnings
                            WHERE author_id = ?
                            AND status = 'available'
                        `)
                        .bind(withdrawal.author_id)
                        .first();

                const available =
                    Number(balance?.available || 0);


                if (available < withdrawalAmount) {

                    return errorResponse(
                        "Insufficient available earnings",
                        400,
                        {
                            available_balance: available,
                            withdrawal_amount:
                                withdrawalAmount
                        }
                    );
                }


                // -------------------------------------------------
                // GET AVAILABLE EARNINGS
                // Oldest earnings are consumed first.
                // -------------------------------------------------

                const earnings =
                    await db
                        .prepare(`
                            SELECT
                                id,
                                author_id,
                                story_id,
                                episode_id,
                                source_type,
                                gross_amount,
                                author_amount,
                                platform_amount
                            FROM author_earnings
                            WHERE author_id = ?
                            AND status = 'available'
                            AND author_amount > 0
                            ORDER BY created_at ASC, id ASC
                        `)
                        .bind(withdrawal.author_id)
                        .all();


                let remaining =
                    withdrawalAmount;

                const statements = [];


                // -------------------------------------------------
                // CONSUME EARNINGS
                //
                // Kama earning moja ni kubwa kuliko kiasi
                // kinachohitajika, tunaigawa.
                //
                // Mfano:
                // earning = 100,000
                // withdrawal = 50,000
                //
                // earning iliyopo:
                // 50,000 available
                //
                // earning mpya:
                // 50,000 paid
                // -------------------------------------------------

                for (
                    const earning
                    of (earnings.results || [])
                ) {

                    if (remaining <= 0) {
                        break;
                    }

                    const earningAmount =
                        Number(
                            earning.author_amount || 0
                        );

                    if (
                        !Number.isFinite(earningAmount) ||
                        earningAmount <= 0
                    ) {
                        continue;
                    }


                    const consume =
                        Math.min(
                            remaining,
                            earningAmount
                        );


                    // ---------------------------------------------
                    // EARNING INATUMIKA YOTE
                    // ---------------------------------------------

                    if (
                        consume >= earningAmount
                    ) {

                        statements.push(
                            db
                                .prepare(`
                                    UPDATE author_earnings
                                    SET status = 'paid'
                                    WHERE id = ?
                                    AND status = 'available'
                                `)
                                .bind(earning.id)
                        );

                    }

                    // ---------------------------------------------
                    // EARNING INATUMIKA SEHEMU TU
                    // ---------------------------------------------

                    else {

                        const ratio =
                            consume /
                            earningAmount;


                        const grossAmount =
                            Number(
                                earning.gross_amount || 0
                            );

                        const platformAmount =
                            Number(
                                earning.platform_amount || 0
                            );


                        const paidGross =
                            Math.round(
                                grossAmount *
                                ratio *
                                100
                            ) / 100;

                        const paidPlatform =
                            Math.round(
                                platformAmount *
                                ratio *
                                100
                            ) / 100;


                        const remainingGross =
                            Math.round(
                                (
                                    grossAmount -
                                    paidGross
                                ) *
                                100
                            ) / 100;

                        const remainingPlatform =
                            Math.round(
                                (
                                    platformAmount -
                                    paidPlatform
                                ) *
                                100
                            ) / 100;

                        const remainingAuthor =
                            Math.round(
                                (
                                    earningAmount -
                                    consume
                                ) *
                                100
                            ) / 100;


                        // Keep the unused balance on the
                        // original earning row.

                        statements.push(
                            db
                                .prepare(`
                                    UPDATE author_earnings
                                    SET
                                        gross_amount = ?,
                                        author_amount = ?,
                                        platform_amount = ?
                                    WHERE id = ?
                                    AND status = 'available'
                                `)
                                .bind(
                                    remainingGross,
                                    remainingAuthor,
                                    remainingPlatform,
                                    earning.id
                                )
                        );


                        // Create the consumed part
                        // as a separate paid earning.

                        statements.push(
                            db
                                .prepare(`
                                    INSERT INTO author_earnings (
                                        author_id,
                                        story_id,
                                        episode_id,
                                        source_type,
                                        gross_amount,
                                        author_amount,
                                        platform_amount,
                                        status
                                    )
                                    VALUES (
                                        ?, ?, ?, ?, ?, ?, ?, 'paid'
                                    )
                                `)
                                .bind(
                                    earning.author_id,
                                    earning.story_id,
                                    earning.episode_id,
                                    earning.source_type,
                                    paidGross,
                                    consume,
                                    paidPlatform
                                )
                        );
                    }


                    remaining =
                        Math.round(
                            (
                                remaining -
                                consume
                            ) *
                            100
                        ) / 100;
                }


                // Safety check.
                // Hii haipaswi kutokea kwa sababu
                // tulishafanya balance check juu.

                if (remaining > 0) {
                    return errorResponse(
                        "Unable to allocate earnings for this withdrawal",
                        400,
                        {
                            remaining_amount:
                                remaining
                        }
                    );
                }


                // -------------------------------------------------
                // APPROVE WITHDRAWAL
                // -------------------------------------------------

                statements.push(
                    db
                        .prepare(`
                            UPDATE withdrawals
                            SET
                                status = 'approved',
                                processed_by = ?,
                                processed_at = CURRENT_TIMESTAMP,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = ?
                            AND status = 'pending'
                        `)
                        .bind(
                            adminId,
                            withdrawalId
                        )
                );


                // -------------------------------------------------
                // EXECUTE ALL ACCOUNTING CHANGES TOGETHER
                // -------------------------------------------------

                await db.batch(statements);


                return json({
                    success: true,
                    message:
                        "Withdrawal approved",
                    withdrawal_id:
                        withdrawalId,
                    amount:
                        withdrawalAmount,
                    status:
                        "approved"
                });

            } catch (error) {

                console.error(
                    "Approve withdrawal error:",
                    error
                );

                return errorResponse(
                    "Failed to approve withdrawal",
                    500,
                    {
                        error:
                            error?.message ||
                            String(error)
                    }
                );
            }
        }


// =====================================================
// TEMP ADMIN PASSWORD RESET
// POST /api/admin/reset-password
// =====================================================

if (path === "/admin/reset-password") {

    const username =
        cleanString(body.username, 100);

    const newPassword =
        String(body.password || "");

    if (!username || !newPassword) {
        return errorResponse(
            "username and password are required",
            400
        );
    }

    if (newPassword.length < 8) {
        return errorResponse(
            "Password must be at least 8 characters",
            400
        );
    }

    try {

        const passwordHash =
            await hashPassword(newPassword);

        const result =
            await db
                .prepare(`
                    UPDATE users
                    SET
                        password_hash = ?,
                        status = 'active',
                        role = 'admin',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE username = 'admin'
                `)
                .bind(passwordHash)
                .run();

        if (!result.meta.changes) {
            return errorResponse(
                "Admin account not found",
                404
            );
        }

        return json({
            success: true,
            message: "Admin password reset successfully"
        });

    } catch (error) {

        return errorResponse(
            error?.message ||
            "Failed to reset admin password",
            500
        );
    }
}
        
        
         
        // =====================================================
// ADMIN CREATE AUTHOR
// POST /api/admin/authors/create
// =====================================================

if (path === "/admin/authors/create") {

    const adminId =
        positiveInt(body.admin_id);

    const username =
        cleanString(body.username, 100);

    const email =
        cleanString(body.email, 200).toLowerCase();

    const password =
        String(body.password || "");

    const displayName =
        cleanString(body.display_name, 200);

    const bio =
        cleanString(body.bio, 5000);

    const auth =
        await requireAdmin(db, adminId);

    if (!auth.ok) {
        return auth.response;
    }

    if (
        !username ||
        !email ||
        !password ||
        !displayName
    ) {
        return errorResponse(
            "username, email, password and display_name are required",
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

        const existingUser =
            await db
                .prepare(`
                    SELECT id
                    FROM users
                    WHERE username = ?
                       OR email = ?
                    LIMIT 1
                `)
                .bind(username, email)
                .first();

        if (existingUser) {
            return errorResponse(
                "Username or email already exists",
                409
            );
        }

        const passwordHash =
            await hashPassword(password);

        const userResult =
            await db
                .prepare(`
                    INSERT INTO users (
                        username,
                        email,
                        password_hash,
                        role,
                        status
                    )
                    VALUES (?, ?, ?, 'author', 'active')
                `)
                .bind(
                    username,
                    email,
                    passwordHash
                )
                .run();

        const userId =
            userResult.meta.last_row_id;

        if (!userId) {
            return errorResponse(
                "Failed to create author user account",
                500
            );
        }

        try {

            const authorResult =
                await db
                    .prepare(`
                        INSERT INTO authors (
                            user_id,
                            display_name,
                            bio,
                            approval_status
                        )
                        VALUES (?, ?, ?, 'pending')
                    `)
                    .bind(
                        userId,
                        displayName,
                        bio || null
                    )
                    .run();

            const authorId =
                authorResult.meta.last_row_id;

            if (!authorId) {

                await db
                    .prepare(`
                        DELETE FROM users
                        WHERE id = ?
                    `)
                    .bind(userId)
                    .run();

                return errorResponse(
                    "Failed to create author profile",
                    500
                );
            }

            return json({
                success: true,
                message:
                    "Author created successfully and is pending approval",
                author: {
                    id: authorId,
                    user_id: userId,
                    username,
                    email,
                    display_name: displayName,
                    approval_status: "pending"
                }
            }, 201);

        } catch (authorError) {

            try {
                await db
                    .prepare(`
                        DELETE FROM users
                        WHERE id = ?
                    `)
                    .bind(userId)
                    .run();
            } catch {}

            throw authorError;
        }

    } catch (error) {

        return errorResponse(
            error?.message ||
            "Failed to create author",
            500
        );
    }
}

    // =====================================================
// ADMIN APPROVE AUTHOR
// POST /api/admin/authors/approve
// =====================================================

if (path === "/admin/authors/approve") {

    const adminId =
        positiveInt(body.admin_id);

    const authorId =
        positiveInt(body.author_id);

    // ...endelea na code yote ya Approve Author...
}

        
              // -------------------------------------------------
        // ADMIN APPROVE WITHDRAWAL
        // -------------------------------------------------

        if (
            path === "/admin/withdrawals/approve"
        ) {

            const adminId =
                positiveInt(body.admin_id);

            const withdrawalId =
                positiveInt(body.withdrawal_id);

            const auth =
                await requireAdmin(db, adminId);

            if (!auth.ok) {
                return auth.response;
            }

            if (!withdrawalId) {
                return errorResponse(
                    "Invalid withdrawal ID",
                    400
                );
            }

            try {

                const withdrawal =
                    await db
                        .prepare(`
                            SELECT *
                            FROM withdrawals
                            WHERE id = ?
                            LIMIT 1
                        `)
                        .bind(withdrawalId)
                        .first();

                if (!withdrawal) {
                    return errorResponse(
                        "Withdrawal not found",
                        404
                    );
                }

                if (
                    String(withdrawal.status).toLowerCase() !==
                    "pending"
                ) {
                    return errorResponse(
                        "Withdrawal is not pending",
                        409
                    );
                }

                const withdrawalAmount =
                    Number(withdrawal.amount || 0);

                if (
                    !Number.isFinite(withdrawalAmount) ||
                    withdrawalAmount <= 0
                ) {
                    return errorResponse(
                        "Invalid withdrawal amount",
                        400
                    );
                }


                // -------------------------------------------------
                // GET AVAILABLE EARNINGS FIRST
                // IMPORTANT:
                // Hakuna earning itabadilishwa kabla ya
                // kuhakikisha balance inatosha.
                // -------------------------------------------------

                const balance =
                    await db
                        .prepare(`
                            SELECT
                                COALESCE(
                                    SUM(author_amount),
                                    0
                                ) AS available
                            FROM author_earnings
                            WHERE author_id = ?
                            AND status = 'available'
                        `)
                        .bind(withdrawal.author_id)
                        .first();

                const available =
                    Number(balance?.available || 0);


                if (available < withdrawalAmount) {

                    return errorResponse(
                        "Insufficient available earnings",
                        400,
                        {
                            available_balance: available,
                            withdrawal_amount:
                                withdrawalAmount
                        }
                    );
                }


                // -------------------------------------------------
                // GET AVAILABLE EARNINGS
                // Oldest earnings are consumed first.
                // -------------------------------------------------

                const earnings =
                    await db
                        .prepare(`
                            SELECT
                                id,
                                author_id,
                                story_id,
                                episode_id,
                                source_type,
                                gross_amount,
                                author_amount,
                                platform_amount
                            FROM author_earnings
                            WHERE author_id = ?
                            AND status = 'available'
                            AND author_amount > 0
                            ORDER BY created_at ASC, id ASC
                        `)
                        .bind(withdrawal.author_id)
                        .all();


                let remaining =
                    withdrawalAmount;

                const statements = [];


                // -------------------------------------------------
                // CONSUME EARNINGS
                //
                // Kama earning moja ni kubwa kuliko kiasi
                // kinachohitajika, tunaigawa.
                //
                // Mfano:
                // earning = 100,000
                // withdrawal = 50,000
                //
                // earning iliyopo:
                // 50,000 available
                //
                // earning mpya:
                // 50,000 paid
                // -------------------------------------------------

                for (
                    const earning
                    of (earnings.results || [])
                ) {

                    if (remaining <= 0) {
                        break;
                    }

                    const earningAmount =
                        Number(
                            earning.author_amount || 0
                        );

                    if (
                        !Number.isFinite(earningAmount) ||
                        earningAmount <= 0
                    ) {
                        continue;
                    }


                    const consume =
                        Math.min(
                            remaining,
                            earningAmount
                        );


                    // ---------------------------------------------
                    // EARNING INATUMIKA YOTE
                    // ---------------------------------------------

                    if (
                        consume >= earningAmount
                    ) {

                        statements.push(
                            db
                                .prepare(`
                                    UPDATE author_earnings
                                    SET status = 'paid'
                                    WHERE id = ?
                                    AND status = 'available'
                                `)
                                .bind(earning.id)
                        );

                    }

                    // ---------------------------------------------
                    // EARNING INATUMIKA SEHEMU TU
                    // ---------------------------------------------

                    else {

                        const ratio =
                            consume /
                            earningAmount;


                        const grossAmount =
                            Number(
                                earning.gross_amount || 0
                            );

                        const platformAmount =
                            Number(
                                earning.platform_amount || 0
                            );


                        const paidGross =
                            Math.round(
                                grossAmount *
                                ratio *
                                100
                            ) / 100;

                        const paidPlatform =
                            Math.round(
                                platformAmount *
                                ratio *
                                100
                            ) / 100;


                        const remainingGross =
                            Math.round(
                                (
                                    grossAmount -
                                    paidGross
                                ) *
                                100
                            ) / 100;

                        const remainingPlatform =
                            Math.round(
                                (
                                    platformAmount -
                                    paidPlatform
                                ) *
                                100
                            ) / 100;

                        const remainingAuthor =
                            Math.round(
                                (
                                    earningAmount -
                                    consume
                                ) *
                                100
                            ) / 100;


                        // Keep the unused balance on the
                        // original earning row.

                        statements.push(
                            db
                                .prepare(`
                                    UPDATE author_earnings
                                    SET
                                        gross_amount = ?,
                                        author_amount = ?,
                                        platform_amount = ?
                                    WHERE id = ?
                                    AND status = 'available'
                                `)
                                .bind(
                                    remainingGross,
                                    remainingAuthor,
                                    remainingPlatform,
                                    earning.id
                                )
                        );


                        // Create the consumed part
                        // as a separate paid earning.

                        statements.push(
                            db
                                .prepare(`
                                    INSERT INTO author_earnings (
                                        author_id,
                                        story_id,
                                        episode_id,
                                        source_type,
                                        gross_amount,
                                        author_amount,
                                        platform_amount,
                                        status
                                    )
                                    VALUES (
                                        ?, ?, ?, ?, ?, ?, ?, 'paid'
                                    )
                                `)
                                .bind(
                                    earning.author_id,
                                    earning.story_id,
                                    earning.episode_id,
                                    earning.source_type,
                                    paidGross,
                                    consume,
                                    paidPlatform
                                )
                        );
                    }


                    remaining =
                        Math.round(
                            (
                                remaining -
                                consume
                            ) *
                            100
                        ) / 100;
                }


                // Safety check.
                // Hii haipaswi kutokea kwa sababu
                // tulishafanya balance check juu.

                if (remaining > 0) {
                    return errorResponse(
                        "Unable to allocate earnings for this withdrawal",
                        400,
                        {
                            remaining_amount:
                                remaining
                        }
                    );
                }


                // -------------------------------------------------
                // APPROVE WITHDRAWAL
                // -------------------------------------------------

                statements.push(
                    db
                        .prepare(`
                            UPDATE withdrawals
                            SET
                                status = 'approved',
                                processed_by = ?,
                                processed_at = CURRENT_TIMESTAMP,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = ?
                            AND status = 'pending'
                        `)
                        .bind(
                            adminId,
                            withdrawalId
                        )
                );


                // -------------------------------------------------
                // EXECUTE ALL ACCOUNTING CHANGES TOGETHER
                // -------------------------------------------------

                await db.batch(statements);


                return json({
                    success: true,
                    message:
                        "Withdrawal approved",
                    withdrawal_id:
                        withdrawalId,
                    amount:
                        withdrawalAmount,
                    status:
                        "approved"
                });

            } catch (error) {

                console.error(
                    "Approve withdrawal error:",
                    error
                );

                return errorResponse(
                    "Failed to approve withdrawal",
                    500,
                    {
                        error:
                            error?.message ||
                            String(error)
                    }
                );
            }
        }

        // -------------------------------------------------
        // ADMIN REJECT WITHDRAWAL
        // -------------------------------------------------

        if (
            path === "/admin/withdrawals/reject"
        ) {

            const adminId =
                positiveInt(body.admin_id);

            const withdrawalId =
                positiveInt(body.withdrawal_id);

            const note =
                cleanString(
                    body.admin_note,
                    5000
                );

            const auth =
                await requireAdmin(db, adminId);

            if (!auth.ok) {
                return auth.response;
            }

            if (!withdrawalId) {
                return errorResponse(
                    "Invalid withdrawal ID",
                    400
                );
            }

            try {

                const result =
                    await db
                        .prepare(`
                            UPDATE withdrawals
                            SET
                                status = 'rejected',
                                admin_note = ?,
                                processed_by = ?,
                                processed_at = CURRENT_TIMESTAMP,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = ?
                            AND status = 'pending'
                        `)
                        .bind(
                            note,
                            adminId,
                            withdrawalId
                        )
                        .run();

                if (!result.meta.changes) {
                    return errorResponse(
                        "Pending withdrawal not found",
                        404
                    );
                }

                return json({
                    success: true,
                    message:
                        "Withdrawal rejected",
                    withdrawal_id:
                        withdrawalId,
                    status: "rejected"
                });

            } catch (error) {

                return errorResponse(
                    "Failed to reject withdrawal",
                    500,
                    { error: error?.message || String(error) }
                );
            }
        }


        return errorResponse(
            "Endpoint not found",
            404
        );
    }


    // =====================================================
    // PUT
    // =====================================================

    if (method === "PUT") {

        const body =
            await readJson(request);

        if (!body) {
            return errorResponse(
                "Invalid JSON request",
                400
            );
        }


        // -------------------------------------------------
        // READER PROFILE
        // -------------------------------------------------

        if (
            path.startsWith("/profile/")
        ) {

            const parts =
                path.split("/").filter(Boolean);

            const readerId =
                positiveInt(parts[1]);

            if (
                parts.length !== 2 ||
                !readerId
            ) {
                return errorResponse(
                    "Invalid reader ID",
                    400
                );
            }

            const reader =
                await getReader(db, readerId);

            if (!reader) {
                return errorResponse(
                    "Reader not found",
                    404
                );
            }

            const username =
                cleanString(
                    body.username,
                    100
                );

            const email =
                cleanString(
                    body.email,
                    200
                ).toLowerCase();

            if (!username && !email) {
                return errorResponse(
                    "Nothing to update",
                    400
                );
            }

            try {

                if (username && email) {

                    await db
                        .prepare(`
                            UPDATE users
                            SET
                                username = ?,
                                email = ?,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = ?
                        `)
                        .bind(
                            username,
                            email,
                            readerId
                        )
                        .run();

                } else if (username) {

                    await db
                        .prepare(`
                            UPDATE users
                            SET
                                username = ?,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = ?
                        `)
                        .bind(
                            username,
                            readerId
                        )
                        .run();

                } else {

                    await db
                        .prepare(`
                            UPDATE users
                            SET
                                email = ?,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = ?
                        `)
                        .bind(
                            email,
                            readerId
                        )
                        .run();
                }

                const updated =
                    await getReader(
                        db,
                        readerId
                    );

                return json({
                    success: true,
                    message:
                        "Profile updated successfully",
                    user: updated
                });

            } catch (error) {

                return errorResponse(
                    "Failed to update profile",
                    500,
                    { error: error?.message || String(error) }
                );
            }
        }


        // -------------------------------------------------
        // ADMIN STORY UPDATE
        // -------------------------------------------------

        if (
            path.startsWith(
                "/admin/stories/"
            )
        ) {

            const parts =
                path.split("/").filter(Boolean);

            const storyId =
                positiveInt(parts[2]);

            const adminId =
                positiveInt(body.admin_id);

            const auth =
                await requireAdmin(
                    db,
                    adminId
                );

            if (!auth.ok) {
                return auth.response;
            }

            if (!storyId) {
                return errorResponse(
                    "Invalid story ID",
                    400
                );
            }

            const status =
                cleanString(
                    body.status,
                    50
                );

            const visibility =
                cleanString(
                    body.visibility,
                    50
                );

            try {

                const result =
                    await db
                        .prepare(`
                            UPDATE stories
                            SET
                                status =
                                    COALESCE(
                                        NULLIF(?, ''),
                                        status
                                    ),
                                visibility =
                                    COALESCE(
                                        NULLIF(?, ''),
                                        visibility
                                    ),
                                updated_at =
                                    CURRENT_TIMESTAMP
                            WHERE id = ?
                        `)
                        .bind(
                            status,
                            visibility,
                            storyId
                        )
                        .run();

                if (!result.meta.changes) {
                    return errorResponse(
                        "Story not found",
                        404
                    );
                }

                return json({
                    success: true,
                    message:
                        "Story updated successfully"
                });

            } catch (error) {

                return errorResponse(
                    "Failed to update story",
                    500,
                    { error: error?.message || String(error) }
                );
            }
        }


        return errorResponse(
            "Endpoint not found",
            404
        );
    }


    // =====================================================
    // DELETE
    // =====================================================

    if (method === "DELETE") {

        // -------------------------------------------------
        // DELETE BOOKMARK
        // -------------------------------------------------

        if (
            path.startsWith("/bookmarks/")
        ) {

            const parts =
                path.split("/").filter(Boolean);

            const readerId =
                positiveInt(parts[1]);

            const storyId =
                positiveInt(parts[2]);

            if (
                parts.length !== 3 ||
                !readerId ||
                !storyId
            ) {
                return errorResponse(
                    "Invalid reader ID or story ID",
                    400
                );
            }

            try {

                const result =
                    await db
                        .prepare(`
                            DELETE FROM bookmarks
                            WHERE user_id = ?
                            AND story_id = ?
                        `)
                        .bind(
                            readerId,
                            storyId
                        )
                        .run();

                if (!result.meta.changes) {
                    return errorResponse(
                        "Bookmark not found",
                        404
                    );
                }

                return json({
                    success: true,
                    message:
                        "Bookmark removed successfully"
                });

            } catch (error) {

                return errorResponse(
                    "Failed to remove bookmark",
                    500,
                    { error: error?.message || String(error) }
                );
            }
        }


        // -------------------------------------------------
        // ADMIN DELETE STORY
        // -------------------------------------------------

        if (
            path.startsWith(
                "/admin/stories/"
            )
        ) {

            const parts =
                path.split("/").filter(Boolean);

            const storyId =
                positiveInt(parts[2]);

            const adminId =
                positiveInt(
                    url.searchParams.get(
                        "admin_id"
                    )
                );

            const auth =
                await requireAdmin(
                    db,
                    adminId
                );

            if (!auth.ok) {
                return auth.response;
            }

            if (!storyId) {
                return errorResponse(
                    "Invalid story ID",
                    400
                );
            }

            try {

                const result =
                    await db
                        .prepare(`
                            UPDATE stories
                            SET
                                status = 'deleted',
                                visibility = 'private',
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = ?
                        `)
                        .bind(storyId)
                        .run();

                if (!result.meta.changes) {
                    return errorResponse(
                        "Story not found",
                        404
                    );
                }

                return json({
                    success: true,
                    message:
                        "Story removed successfully"
                });

            } catch (error) {

                return errorResponse(
                    "Failed to remove story",
                    500,
                    { error: error?.message || String(error) }
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
