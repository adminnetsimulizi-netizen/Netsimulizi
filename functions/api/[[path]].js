const json = (data, status = 200) => {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=UTF-8",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization"
        }
    });
};

const errorResponse = (message, status = 400, extra = {}) => {
    return json({
        success: false,
        message,
        ...extra
    }, status);
};

const readJson = async (request) => {
    try {
        return await request.json();
    } catch {
        return null;
    }
};

const numberOrNull = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

const positiveInt = (value) => {
    const n = Number(value);

    if (!Number.isInteger(n) || n <= 0) {
        return null;
    }

    return n;
};

const cleanString = (value, max = 5000) => {
    return String(value ?? "")
        .trim()
        .slice(0, max);
};

const slugify = (value) => {
    return cleanString(value, 200)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
};


// =====================================================
// PASSWORD HASHING
// =====================================================

const bytesToBase64 = (bytes) => {

    let binary = "";

    const chunkSize = 0x8000;

    for (
        let i = 0;
        i < bytes.length;
        i += chunkSize
    ) {

        binary += String.fromCharCode(
            ...bytes.subarray(i, i + chunkSize)
        );
    }

    return btoa(binary);
};


const base64ToBytes = (base64) => {

    const binary = atob(base64);

    const bytes =
        new Uint8Array(binary.length);

    for (
        let i = 0;
        i < binary.length;
        i++
    ) {

        bytes[i] =
            binary.charCodeAt(i);
    }

    return bytes;
};


const hashPassword = async (password) => {

    const encoder =
        new TextEncoder();

    const salt =
        crypto.getRandomValues(
            new Uint8Array(16)
        );

    const keyMaterial =
        await crypto.subtle.importKey(
            "raw",
            encoder.encode(password),
            "PBKDF2",
            false,
            ["deriveBits"]
        );

    const iterations = 100000;

    const hashBuffer =
        await crypto.subtle.deriveBits(
            {
                name: "PBKDF2",
                salt,
                iterations,
                hash: "SHA-256"
            },
            keyMaterial,
            256
        );

    const hash =
        new Uint8Array(hashBuffer);

    return [
        "pbkdf2",
        iterations,
        bytesToBase64(salt),
        bytesToBase64(hash)
    ].join("$");
};


const verifyPassword = async (
    password,
    storedHash
) => {

    try {

        const parts =
            String(storedHash || "")
                .split("$");

        if (
            parts.length !== 4 ||
            parts[0] !== "pbkdf2"
        ) {

            return false;
        }

        const iterations =
            Number(parts[1]);

        const salt =
            base64ToBytes(parts[2]);

        const expectedHash =
            base64ToBytes(parts[3]);

        const encoder =
            new TextEncoder();

        const keyMaterial =
            await crypto.subtle.importKey(
                "raw",
                encoder.encode(password),
                "PBKDF2",
                false,
                ["deriveBits"]
            );

        const hashBuffer =
            await crypto.subtle.deriveBits(
                {
                    name: "PBKDF2",
                    salt,
                    iterations,
                    hash: "SHA-256"
                },
                keyMaterial,
                256
            );

        const actualHash =
            new Uint8Array(hashBuffer);

        if (
            actualHash.length !==
            expectedHash.length
        ) {

            return false;
        }

        let difference = 0;

        for (
            let i = 0;
            i < actualHash.length;
            i++
        ) {

            difference |=
                actualHash[i] ^
                expectedHash[i];
        }

        return difference === 0;

    } catch {

        return false;
    }
};


// =====================================================
// DATABASE HELPERS
// =====================================================

const ensureExtraTables = async (db) => {

    /*
     * These tables are additional tables used by:
     * - author submissions
     * - wallet
     * - earnings
     * - withdrawals
     * - recommendations
     *
     * Existing tables are NOT replaced.
     */

    const statements = [

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

    for (const sql of statements) {

        try {
            await db.prepare(sql).run();
        } catch {
            /*
             * Existing database may already contain one of
             * these tables with a different structure.
             *
             * The main API should continue working.
             */
        }
    }
};


// =====================================================
// USER / ADMIN HELPERS
// =====================================================

const getUser = async (db, userId) => {

    const id = positiveInt(userId);

    if (!id) {
        return null;
    }

    try {

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

    } catch {

        return null;
    }
};


const requireAdmin = async (db, userId) => {

    const user =
        await getUser(db, userId);

    if (!user) {
        return {
            ok: false,
            response: errorResponse(
                "User not found",
                404
            )
        };
    }

    if (user.status !== "active") {
        return {
            ok: false,
            response: errorResponse(
                "Account is not active",
                403
            )
        };
    }

    if (
        user.role !== "admin" &&
        user.role !== "administrator"
    ) {

        return {
            ok: false,
            response: errorResponse(
                "Admin access required",
                403
            )
        };
    }

    return {
        ok: true,
        user
    };
};


const getAuthorByUserId = async (
    db,
    userId
) => {

    try {

        return await db
            .prepare(`
                SELECT *
                FROM authors
                WHERE user_id = ?
                LIMIT 1
            `)
            .bind(userId)
            .first();

    } catch {

        return null;
    }
};


// =====================================================
// MAIN API
// =====================================================

export async function onRequest(context) {

    const {
        request,
        env
    } = context;

    const db = env.D1;

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
            .replace(/^\/api/, "")
            .replace(/\/+$/, "") || "/";

    const method =
        request.method.toUpperCase();


    // =================================================
    // OPTIONS
    // =================================================

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


    // =================================================
    // PREPARE ADDITIONAL TABLES
    // =================================================

    await ensureExtraTables(db);


    // =================================================
    // GET
    // =================================================

    if (method === "GET") {


        // =============================================
        // HEALTH
        // =============================================

        if (path === "/health") {

            return json({
                success: true,
                message:
                    "Net Simulizi API is running",
                service:
                    "netsimulizi-api",
                version:
                    "2.0"
            });
        }


        // =============================================
        // TEST
        // =============================================

        if (path === "/test") {

            return json({
                success: true,
                message:
                    "Net Simulizi API test successful"
            });
        }


        // =============================================
        // DB TEST
        // =============================================

        if (path === "/db-test") {

            try {

                const result =
                    await db
                        .prepare(
                            "SELECT 1 AS test"
                        )
                        .first();

                return json({
                    success: true,
                    message:
                        "D1 database connection successful",
                    database:
                        "netsimulizi",
                    result
                });

            } catch {

                return errorResponse(
                    "D1 database connection failed",
                    500
                );
            }
        }


        // =============================================
        // CATEGORIES
        // =============================================

        if (
            path === "/categories" ||
            path === "/genres"
        ) {

            try {

                const language =
                    cleanString(
                        url.searchParams.get(
                            "language"
                        ),
                        20
                    );

                let query = `
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

                const params = [];

                if (language) {

                    query += `
                        AND (
                            language = ?
                            OR language IS NULL
                            OR language = ''
                        )
                    `;

                    params.push(language);
                }

                query += `
                    ORDER BY name ASC
                `;

                const result =
                    await db
                        .prepare(query)
                        .bind(...params)
                        .all();

                return json({
                    success: true,
                    categories:
                        result.results || [],
                    genres:
                        result.results || []
                });

            } catch (error) {

                return errorResponse(
                    "Failed to load categories",
                    500
                );
            }
        }


        // =============================================
        // STORY LIST
        // =============================================

        if (path === "/stories") {

            try {

                const genre =
                    cleanString(
                        url.searchParams.get(
                            "genre"
                        ),
                        100
                    );

                const category =
                    cleanString(
                        url.searchParams.get(
                            "category"
                        ),
                        100
                    );

                const language =
                    cleanString(
                        url.searchParams.get(
                            "language"
                        ),
                        20
                    );

                const search =
                    cleanString(
                        url.searchParams.get(
                            "search"
                        ),
                        200
                    );

                const authorId =
                    positiveInt(
                        url.searchParams.get(
                            "author_id"
                        )
                    );

                const limitRaw =
                    Number(
                        url.searchParams.get(
                            "limit"
                        ) || 50
                    );

                const offsetRaw =
                    Number(
                        url.searchParams.get(
                            "offset"
                        ) || 0
                    );

                const limit =
                    Math.min(
                        Math.max(
                            Number.isInteger(limitRaw)
                                ? limitRaw
                                : 50,
                            1
                        ),
                        100
                    );

                const offset =
                    Math.max(
                        Number.isInteger(offsetRaw)
                            ? offsetRaw
                            : 0,
                        0
                    );

                let query = `
                    SELECT
                        stories.id,
                        stories.title,
                        stories.slug,
                        stories.description,
                        stories.cover_url,
                        stories.language,
                        stories.status,
                        stories.visibility,
                        stories.readers_count,
                        stories.created_at,
                        stories.updated_at,
                        authors.id
                            AS author_id,
                        authors.display_name
                            AS author_name,
                        categories.id
                            AS category_id,
                        categories.name
                            AS category_name,
                        categories.slug
                            AS category_slug
                    FROM stories
                    LEFT JOIN authors
                        ON stories.author_id =
                           authors.id
                    LEFT JOIN categories
                        ON stories.category_id =
                           categories.id
                    WHERE stories.status =
                        'published'
                    AND (
                        stories.visibility =
                            'public'
                        OR stories.visibility IS NULL
                        OR stories.visibility = ''
                    )
                `;

                const params = [];

                if (genre) {

                    query += `
                        AND (
                            LOWER(categories.name) =
                                LOWER(?)
                            OR LOWER(categories.slug) =
                                LOWER(?)
                        )
                    `;

                    params.push(
                        genre,
                        genre
                    );
                }

                if (category) {

                    query += `
                        AND (
                            LOWER(categories.name) =
                                LOWER(?)
                            OR LOWER(categories.slug) =
                                LOWER(?)
                            OR categories.id = ?
                        )
                    `;

                    params.push(
                        category,
                        category,
                        Number(category) || -1
                    );
                }

                if (language) {

                    query += `
                        AND stories.language = ?
                    `;

                    params.push(language);
                }

                if (authorId) {

                    query += `
                        AND stories.author_id = ?
                    `;

                    params.push(authorId);
                }

                if (search) {

                    query += `
                        AND (
                            LOWER(stories.title)
                                LIKE LOWER(?)
                            OR LOWER(
                                stories.description
                            )
                                LIKE LOWER(?)
                        )
                    `;

                    const term =
                        `%${search}%`;

                    params.push(
                        term,
                        term
                    );
                }

                query += `
                    ORDER BY
                        stories.created_at DESC
                    LIMIT ?
                    OFFSET ?
                `;

                params.push(
                    limit,
                    offset
                );

                const result =
                    await db
                        .prepare(query)
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
                            (result.results || [])
                                .length
                    }
                });

            } catch (error) {

                return errorResponse(
                    "Failed to load stories",
                    500
                );
            }
        }


        // =============================================
        // STORY EPISODES
        // =============================================

        if (
            path.startsWith("/stories/") &&
            path.endsWith("/episodes")
        ) {

            const parts =
                path.split("/")
                    .filter(Boolean);

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
                            ORDER BY
                                episode_number ASC
                        `)
                        .bind(storyId)
                        .all();

                return json({
                    success: true,
                    episodes:
                        result.results || []
                });

            } catch {

                return errorResponse(
                    "Failed to load episodes",
                    500
                );
            }
        }


        // =============================================
        // STORY DETAILS
        // =============================================

        if (path.startsWith("/stories/")) {

            const parts =
                path.split("/")
                    .filter(Boolean);

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
                                stories.id,
                                stories.title,
                                stories.slug,
                                stories.description,
                                stories.cover_url,
                                stories.language,
                                stories.status,
                                stories.visibility,
                                stories.readers_count,
                                stories.created_at,
                                stories.updated_at,
                                authors.id
                                    AS author_id,
                                authors.display_name
                                    AS author_name,
                                categories.id
                                    AS category_id,
                                categories.name
                                    AS category_name,
                                categories.slug
                                    AS category_slug
                            FROM stories
                            LEFT JOIN authors
                                ON stories.author_id =
                                   authors.id
                            LEFT JOIN categories
                                ON stories.category_id =
                                   categories.id
                            WHERE stories.id = ?
                            AND stories.status =
                                'published'
                            AND (
                                stories.visibility =
                                    'public'
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

            } catch {

                return errorResponse(
                    "Failed to load story",
                    500
                );
            }
        }


        // =============================================
        // AUTHORS LIST
        // =============================================

        if (path === "/authors") {

            try {

                const search =
                    cleanString(
                        url.searchParams.get(
                            "search"
                        ),
                        200
                    );

                let query = `
                    SELECT
                        authors.*
                    FROM authors
                `;

                const params = [];

                if (search) {

                    query += `
                        WHERE
                            LOWER(
                                authors.display_name
                            )
                            LIKE LOWER(?)
                    `;

                    params.push(
                        `%${search}%`
                    );
                }

                query += `
                    ORDER BY
                        authors.display_name ASC
                `;

                const result =
                    await db
                        .prepare(query)
                        .bind(...params)
                        .all();

                return json({
                    success: true,
                    authors:
                        result.results || []
                });

            } catch {

                return errorResponse(
                    "Failed to load authors",
                    500
                );
            }
        }


        // =============================================
        // AUTHOR PROFILE
        // =============================================

        if (path.startsWith("/authors/")) {

            const parts =
                path.split("/")
                    .filter(Boolean);

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

            try {

                const author =
                    await db
                        .prepare(`
                            SELECT *
                            FROM authors
                            WHERE id = ?
                            LIMIT 1
                        `)
                        .bind(authorId)
                        .first();

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

            } catch {

                return errorResponse(
                    "Failed to load author",
                    500
                );
            }
        }


        // =============================================
        // PROFILE
        // =============================================

        if (path.startsWith("/profile/")) {

            const parts =
                path.split("/")
                    .filter(Boolean);

            const userId =
                positiveInt(parts[1]);

            if (
                parts.length !== 2 ||
                !userId
            ) {

                return errorResponse(
                    "Invalid user ID",
                    400
                );
            }

            const user =
                await getUser(
                    db,
                    userId
                );

            if (!user) {

                return errorResponse(
                    "User not found",
                    404
                );
            }

            return json({
                success: true,
                user
            });
        }


        // =============================================
        // BOOKMARKS LIST
        // =============================================

        if (path.startsWith("/bookmarks/")) {

            const parts =
                path.split("/")
                    .filter(Boolean);

            const userId =
                positiveInt(parts[1]);

            if (
                parts.length !== 2 ||
                !userId
            ) {

                return errorResponse(
                    "Invalid user ID",
                    400
                );
            }

            try {

                const result =
                    await db
                        .prepare(`
                            SELECT
                                bookmarks.id,
                                bookmarks.user_id,
                                bookmarks.story_id,
                                bookmarks.created_at,
                                stories.title,
                                stories.slug,
                                stories.description,
                                stories.cover_url,
                                stories.language,
                                stories.readers_count,
                                authors.id
                                    AS author_id,
                                authors.display_name
                                    AS author_name,
                                categories.name
                                    AS category_name
                            FROM bookmarks
                            INNER JOIN stories
                                ON bookmarks.story_id =
                                   stories.id
                            LEFT JOIN authors
                                ON stories.author_id =
                                   authors.id
                            LEFT JOIN categories
                                ON stories.category_id =
                                   categories.id
                            WHERE bookmarks.user_id = ?
                            ORDER BY
                                bookmarks.created_at DESC
                        `)
                        .bind(userId)
                        .all();

                return json({
                    success: true,
                    bookmarks:
                        result.results || []
                });

            } catch {

                return errorResponse(
                    "Failed to load bookmarks",
                    500
                );
            }
        }


        // =============================================
        // READING PROGRESS
        // =============================================

        if (
            path.startsWith(
                "/reading-progress/"
            )
        ) {

            const parts =
                path.split("/")
                    .filter(Boolean);

            const userId =
                positiveInt(parts[1]);

            const storyId =
                positiveInt(parts[2]);

            if (
                parts.length !== 3 ||
                !userId ||
                !storyId
            ) {

                return errorResponse(
                    "Invalid user ID or story ID",
                    400
                );
            }

            try {

                const progress =
                    await db
                        .prepare(`
                            SELECT
                                reading_progress.id,
                                reading_progress.user_id,
                                reading_progress.story_id,
                                reading_progress.episode_id,
                                reading_progress.progress_percent,
                                reading_progress.last_read_at,
                                episodes.episode_number,
                                episodes.title
                                    AS episode_title,
                                stories.title
                                    AS story_title
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
                        .bind(
                            userId,
                            storyId
                        )
                        .first();

                return json({
                    success: true,
                    progress:
                        progress || null
                });

            } catch {

                return errorResponse(
                    "Failed to load reading progress",
                    500
                );
            }
        }


        // =============================================
        // READING HISTORY
        // =============================================

        if (
            path.startsWith(
                "/reading-history/"
            )
        ) {

            const parts =
                path.split("/")
                    .filter(Boolean);

            const userId =
                positiveInt(parts[1]);

            if (
                parts.length !== 2 ||
                !userId
            ) {

                return errorResponse(
                    "Invalid user ID",
                    400
                );
            }

            try {

                const result =
                    await db
                        .prepare(`
                            SELECT
                                reading_progress.id,
                                reading_progress.user_id,
                                reading_progress.story_id,
                                reading_progress.episode_id,
                                reading_progress.progress_percent,
                                reading_progress.last_read_at,
                                stories.title
                                    AS story_title,
                                stories.slug
                                    AS story_slug,
                                stories.cover_url,
                                episodes.episode_number,
                                episodes.title
                                    AS episode_title
                            FROM reading_progress
                            INNER JOIN stories
                                ON reading_progress.story_id =
                                   stories.id
                            LEFT JOIN episodes
                                ON reading_progress.episode_id =
                                   episodes.id
                            WHERE reading_progress.user_id = ?
                            ORDER BY
                                reading_progress.last_read_at DESC
                        `)
                        .bind(userId)
                        .all();

                return json({
                    success: true,
                    history:
                        result.results || []
                });

            } catch {

                return errorResponse(
                    "Failed to load reading history",
                    500
                );
            }
        }


        // =============================================
        // AUTHOR'S STORIES
        // =============================================

        if (
            path.startsWith(
                "/author/stories/"
            )
        ) {

            const parts =
                path.split("/")
                    .filter(Boolean);

            const userId =
                positiveInt(parts[2]);

            if (
                parts.length !== 3 ||
                !userId
            ) {

                return errorResponse(
                    "Invalid author user ID",
                    400
                );
            }

            const author =
                await getAuthorByUserId(
                    db,
                    userId
                );

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
                                categories.name
                                    AS category_name
                            FROM stories
                            LEFT JOIN categories
                                ON stories.category_id =
                                   categories.id
                            WHERE stories.author_id = ?
                            ORDER BY
                                stories.created_at DESC
                        `)
                        .bind(author.id)
                        .all();

                return json({
                    success: true,
                    stories:
                        result.results || []
                });

            } catch {

                return errorResponse(
                    "Failed to load author stories",
                    500
                );
            }
        }


        // =============================================
        // AUTHOR SUBMISSIONS
        // =============================================

        if (
            path.startsWith(
                "/author/submissions/"
            )
        ) {

            const parts =
                path.split("/")
                    .filter(Boolean);

            const userId =
                positiveInt(parts[2]);

            if (
                parts.length !== 3 ||
                !userId
            ) {

                return errorResponse(
                    "Invalid author user ID",
                    400
                );
            }

            const author =
                await getAuthorByUserId(
                    db,
                    userId
                );

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
                                *
                            FROM story_submissions
                            WHERE author_id = ?
                            ORDER BY
                                created_at DESC
                        `)
                        .bind(author.id)
                        .all();

                return json({
                    success: true,
                    submissions:
                        result.results || []
                });

            } catch {

                return errorResponse(
                    "Failed to load submissions",
                    500
                );
            }
        }


        // =============================================
        // WALLET
        // =============================================

        if (
            path.startsWith(
                "/wallet/"
            )
        ) {

            const parts =
                path.split("/")
                    .filter(Boolean);

            const userId =
                positiveInt(parts[1]);

            if (
                parts.length !== 2 ||
                !userId
            ) {

                return errorResponse(
                    "Invalid user ID",
                    400
                );
            }

            const author =
                await getAuthorByUserId(
                    db,
                    userId
                );

            if (!author) {

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
                                COALESCE(
                                    SUM(author_amount),
                                    0
                                ) AS total_earnings,
                                COALESCE(
                                    SUM(
                                        CASE
                                            WHEN status =
                                                'available'
                                            THEN author_amount
                                            ELSE 0
                                        END
                                    ),
                                    0
                                ) AS available_balance,
                                COALESCE(
                                    SUM(
                                        CASE
                                            WHEN status =
                                                'paid'
                                            THEN author_amount
                                            ELSE 0
                                        END
                                    ),
                                    0
                                ) AS paid_earnings
                            FROM author_earnings
                            WHERE author_id = ?
                        `)
                        .bind(author.id)
                        .first();

                const recommendations =
                    await db
                        .prepare(`
                            SELECT
                                COALESCE(
                                    SUM(author_amount),
                                    0
                                ) AS total
                            FROM recommendations
                            WHERE author_id = ?
                        `)
                        .bind(author.id)
                        .first();

                const withdrawals =
                    await db
                        .prepare(`
                            SELECT
                                COALESCE(
                                    SUM(
                                        CASE
                                            WHEN status =
                                                'pending'
                                            THEN amount
                                            ELSE 0
                                        END
                                    ),
                                    0
                                ) AS pending,
                                COALESCE(
                                    SUM(
                                        CASE
                                            WHEN status =
                                                'approved'
                                            OR status =
                                                'paid'
                                            THEN amount
                                            ELSE 0
                                        END
                                    ),
                                    0
                                ) AS withdrawn
                            FROM withdrawals
                            WHERE author_id = ?
                        `)
                        .bind(author.id)
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

            } catch {

                return errorResponse(
                    "Failed to load wallet",
                    500
                );
            }
        }


        // =============================================
        // WITHDRAWALS FOR AUTHOR
        // =============================================

        if (
            path.startsWith(
                "/withdrawals/"
            )
        ) {

            const parts =
                path.split("/")
                    .filter(Boolean);

            const userId =
                positiveInt(parts[1]);

            if (
                parts.length !== 2 ||
                !userId
            ) {

                return errorResponse(
                    "Invalid user ID",
                    400
                );
            }

            const author =
                await getAuthorByUserId(
                    db,
                    userId
                );

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
                            SELECT *
                            FROM withdrawals
                            WHERE author_id = ?
                            ORDER BY
                                created_at DESC
                        `)
                        .bind(author.id)
                        .all();

                return json({
                    success: true,
                    withdrawals:
                        result.results || []
                });

            } catch {

                return errorResponse(
                    "Failed to load withdrawals",
                    500
                );
            }
        }


        // =============================================
        // ADMIN SUBMISSIONS
        // =============================================

        if (
            path === "/admin/submissions"
        ) {

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

            try {

                const status =
                    cleanString(
                        url.searchParams.get(
                            "status"
                        ),
                        50
                    );

                let query = `
                    SELECT
                        story_submissions.*,
                        authors.display_name
                            AS author_name
                    FROM story_submissions
                    LEFT JOIN authors
                        ON story_submissions.author_id =
                           authors.id
                `;

                const params = [];

                if (status) {

                    query += `
                        WHERE story_submissions.status = ?
                    `;

                    params.push(status);
                }

                query += `
                    ORDER BY
                        story_submissions.created_at DESC
                `;

                const result =
                    await db
                        .prepare(query)
                        .bind(...params)
                        .all();

                return json({
                    success: true,
                    submissions:
                        result.results || []
                });

            } catch {

                return errorResponse(
                    "Failed to load admin submissions",
                    500
                );
            }
        }


        // =============================================
        // ADMIN WITHDRAWALS
        // =============================================

        if (
            path === "/admin/withdrawals"
        ) {

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

            try {

                const result =
                    await db
                        .prepare(`
                            SELECT
                                withdrawals.*,
                                authors.display_name
                                    AS author_name
                            FROM withdrawals
                            LEFT JOIN authors
                                ON withdrawals.author_id =
                                   authors.id
                            ORDER BY
                                withdrawals.created_at DESC
                        `)
                        .all();

                return json({
                    success: true,
                    withdrawals:
                        result.results || []
                });

            } catch {

                return errorResponse(
                    "Failed to load admin withdrawals",
                    500
                );
            }
        }


        // =============================================
        // ADMIN STATS
        // =============================================

        if (
            path === "/admin/stats"
        ) {

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

            try {

                const users =
                    await db
                        .prepare(`
                            SELECT
                                COUNT(*) AS total
                            FROM users
                        `)
                        .first();

                const authors =
                    await db
                        .prepare(`
                            SELECT
                                COUNT(*) AS total
                            FROM authors
                        `)
                        .first();

                const stories =
                    await db
                        .prepare(`
                            SELECT
                                COUNT(*) AS total
                            FROM stories
                        `)
                        .first();

                const published =
                    await db
                        .prepare(`
                            SELECT
                                COUNT(*) AS total
                            FROM stories
                            WHERE status = 'published'
                        `)
                        .first();

                const submissions =
                    await db
                        .prepare(`
                            SELECT
                                COUNT(*) AS total
                            FROM story_submissions
                            WHERE status = 'pending'
                        `)
                        .first();

                const withdrawals =
                    await db
                        .prepare(`
                            SELECT
                                COUNT(*) AS total
                            FROM withdrawals
                            WHERE status = 'pending'
                        `)
                        .first();

                return json({
                    success: true,
                    stats: {
                        users:
                            Number(
                                users?.total || 0
                            ),
                        authors:
                            Number(
                                authors?.total || 0
                            ),
                        stories:
                            Number(
                                stories?.total || 0
                            ),
                        published_stories:
                            Number(
                                published?.total || 0
                            ),
                        pending_submissions:
                            Number(
                                submissions?.total || 0
                            ),
                        pending_withdrawals:
                            Number(
                                withdrawals?.total || 0
                            )
                    }
                });

            } catch {

                return errorResponse(
                    "Failed to load admin statistics",
                    500
                );
            }
        }


        // =============================================
        // UNKNOWN GET
        // =============================================

        return errorResponse(
            "Endpoint not found",
            404
        );
    }


    // =================================================
    // POST
    // =================================================

    if (method === "POST") {

        const body =
            await readJson(request);

        if (!body) {

            return errorResponse(
                "Invalid JSON request",
                400
            );
        }


        // =============================================
        // REGISTER
        // =============================================

        if (path === "/register") {

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

            const password =
                String(
                    body.password || ""
                );

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

            if (!password) {

                return errorResponse(
                    "Password is required",
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

                const existingUser =
                    await db
                        .prepare(`
                            SELECT id
                            FROM users
                            WHERE username = ?
                            OR email = ?
                            LIMIT 1
                        `)
                        .bind(
                            username,
                            email
                        )
                        .first();

                if (existingUser) {

                    return errorResponse(
                        "Username or email already exists",
                        409
                    );
                }

                const passwordHash =
                    await hashPassword(
                        password
                    );

                const result =
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
                                ?,
                                ?,
                                ?,
                                'reader',
                                'active'
                            )
                        `)
                        .bind(
                            username,
                            email,
                            passwordHash
                        )
                        .run();

                return json({
                    success: true,
                    message:
                        "Registration successful",
                    user: {
                        id:
                            result.meta.last_row_id,
                        username,
                        email,
                        role:
                            "reader",
                        status:
                            "active"
                    }
                }, 201);

            } catch {

                return errorResponse(
                    "Registration failed",
                    500
                );
            }
        }


        // =============================================
        // LOGIN
        // =============================================

        if (path === "/login") {

            const login =
                cleanString(
                    body.login,
                    200
                );

            const password =
                String(
                    body.password || ""
                );

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

                const user =
                    await db
                        .prepare(`
                            SELECT
                                id,
                                username,
                                email,
                                password_hash,
                                role,
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

                if (!user) {

                    return errorResponse(
                        "Invalid username/email or password",
                        401
                    );
                }

                if (
                    user.status !== "active"
                ) {

                    return errorResponse(
                        "Your account is not active",
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

                return json({
                    success: true,
                    message:
                        "Login successful",
                    user: {
                        id:
                            user.id,
                        username:
                            user.username,
                        email:
                            user.email,
                        role:
                            user.role,
                        status:
                            user.status,
                        created_at:
                            user.created_at,
                        updated_at:
                            user.updated_at
                    }
                });

            } catch {

                return errorResponse(
                    "Login failed",
                    500
                );
            }
        }


        // =============================================
        // ADD BOOKMARK
        // =============================================

        if (path === "/bookmarks") {

            const userId =
                positiveInt(
                    body.user_id
                );

            const storyId =
                positiveInt(
                    body.story_id
                );

            if (!userId) {

                return errorResponse(
                    "Invalid user ID",
                    400
                );
            }

            if (!storyId) {

                return errorResponse(
                    "Invalid story ID",
                    400
                );
            }

            try {

                const existing =
                    await db
                        .prepare(`
                            SELECT id
                            FROM bookmarks
                            WHERE user_id = ?
                            AND story_id = ?
                            LIMIT 1
                        `)
                        .bind(
                            userId,
                            storyId
                        )
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

                const result =
                    await db
                        .prepare(`
                            INSERT INTO bookmarks (
                                user_id,
                                story_id
                            )
                            VALUES (?, ?)
                        `)
                        .bind(
                            userId,
                            storyId
                        )
                        .run();

                return json({
                    success: true,
                    message:
                        "Story bookmarked successfully",
                    bookmark_id:
                        result.meta.last_row_id
                }, 201);

            } catch {

                return errorResponse(
                    "Failed to add bookmark",
                    500
                );
            }
        }


        // =============================================
        // SAVE READING PROGRESS
        // =============================================

        if (
            path === "/reading-progress"
        ) {

            const userId =
                positiveInt(
                    body.user_id
                );

            const storyId =
                positiveInt(
                    body.story_id
                );

            const episodeId =
                positiveInt(
                    body.episode_id
                );

            let progressPercent =
                Number(
                    body.progress_percent
                );

            if (!userId) {

                return errorResponse(
                    "Invalid user ID",
                    400
                );
            }

            if (!storyId) {

                return errorResponse(
                    "Invalid story ID",
                    400
                );
            }

            if (!episodeId) {

                return errorResponse(
                    "Invalid episode ID",
                    400
                );
            }

            if (
                !Number.isFinite(
                    progressPercent
                )
            ) {

                progressPercent = 0;
            }

            progressPercent =
                Math.max(
                    0,
                    Math.min(
                        100,
                        Math.round(
                            progressPercent
                        )
                    )
                );

            try {

                const episode =
                    await db
                        .prepare(`
                            SELECT
                                id,
                                story_id
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
                        VALUES (
                            ?,
                            ?,
                            ?,
                            ?,
                            CURRENT_TIMESTAMP
                        )
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
                        userId,
                        storyId,
                        episodeId,
                        progressPercent
                    )
                    .run();

                return json({
                    success: true,
                    message:
                        "Reading progress saved",
                    progress: {
                        user_id:
                            userId,
                        story_id:
                            storyId,
                        episode_id:
                            episodeId,
                        progress_percent:
                            progressPercent
                    }
                });

            } catch {

                return errorResponse(
                    "Failed to save reading progress",
                    500
                );
            }
        }


        // =============================================
        // AUTHOR STORY SUBMISSION
        // =============================================

        if (
            path === "/author/stories"
        ) {

            const userId =
                positiveInt(
                    body.user_id
                );

            if (!userId) {

                return errorResponse(
                    "User ID is required",
                    400
                );
            }

            const user =
                await getUser(
                    db,
                    userId
                );

            if (!user) {

                return errorResponse(
                    "User not found",
                    404
                );
            }

            if (
                user.role !== "author" &&
                user.role !== "admin" &&
                user.role !== "administrator"
            ) {

                return errorResponse(
                    "Only authors or admins can submit stories",
                    403
                );
            }

            const author =
                await getAuthorByUserId(
                    db,
                    userId
                );

            let authorId =
                author?.id || null;

            /*
             * Admin can optionally provide author_id.
             */

            if (
                !authorId &&
                (
                    user.role === "admin" ||
                    user.role === "administrator"
                )
            ) {

                authorId =
                    positiveInt(
                        body.author_id
                    );
            }

            if (!authorId) {

                return errorResponse(
                    "Author profile not found",
                    404
                );
            }

            const title =
                cleanString(
                    body.title,
                    300
                );

            if (!title) {

                return errorResponse(
                    "Story title is required",
                    400
                );
            }

            const description =
                cleanString(
                    body.description,
                    10000
                );

            const language =
                cleanString(
                    body.language || "sw",
                    20
                );

            const categoryId =
                positiveInt(
                    body.category_id
                );

            const coverUrl =
                cleanString(
                    body.cover_url ||
                    body.cover ||
                    "",
                    1000
                );

            const tags =
                cleanString(
                    body.tags,
                    1000
                );

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

            if (!originality) {

                return errorResponse(
                    "Originality declaration is required",
                    400
                );
            }

            const slug =
                slugify(title) +
                "-" +
                Date.now();

            try {

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
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                'pending',
                                1
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
                    status:
                        "pending"
                }, 201);

            } catch {

                return errorResponse(
                    "Failed to submit story",
                    500
                );
            }
        }


        // =============================================
        // ADMIN APPROVE SUBMISSION
        // =============================================

        if (
            path === "/admin/submissions/approve"
        ) {

            const adminId =
                positiveInt(
                    body.admin_id
                );

            const submissionId =
                positiveInt(
                    body.submission_id
                );

            const auth =
                await requireAdmin(
                    db,
                    adminId
                );

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

                if (
                    submission.status ===
                    "approved"
                ) {

                    return errorResponse(
                        "Submission is already approved",
                        409
                    );
                }

                /*
                 * Create the actual published story.
                 */

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
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                'published',
                                'public',
                                0,
                                ?,
                                ?,
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
                            reviewed_at =
                                CURRENT_TIMESTAMP,
                            updated_at =
                                CURRENT_TIMESTAMP
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
                    story_id:
                        storyId,
                    submission_id:
                        submissionId,
                    status:
                        "published"
                });

            } catch {

                return errorResponse(
                    "Failed to approve submission",
                    500
                );
            }
        }


        // =============================================
        // ADMIN REJECT SUBMISSION
        // =============================================

        if (
            path === "/admin/submissions/reject"
        ) {

            const adminId =
                positiveInt(
                    body.admin_id
                );

            const submissionId =
                positiveInt(
                    body.submission_id
                );

            const note =
                cleanString(
                    body.admin_note,
                    5000
                );

            const auth =
                await requireAdmin(
                    db,
                    adminId
                );

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
                                reviewed_at =
                                    CURRENT_TIMESTAMP,
                                updated_at =
                                    CURRENT_TIMESTAMP
                            WHERE id = ?
                        `)
                        .bind(
                            note,
                            adminId,
                            submissionId
                        )
                        .run();

                if (
                    result.meta.changes === 0
                ) {

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
                    status:
                        "rejected"
                });

            } catch {

                return errorResponse(
                    "Failed to reject submission",
                    500
                );
            }
        }


        // =============================================
        // AUTHOR CREATE EPISODE
        // =============================================

        if (
            path === "/author/episodes"
        ) {

            const userId =
                positiveInt(
                    body.user_id
                );

            const storyId =
                positiveInt(
                    body.story_id
                );

            const title =
                cleanString(
                    body.title,
                    300
                );

            const content =
                cleanString(
                    body.content,
                    1000000
                );

            const episodeNumber =
                positiveInt(
                    body.episode_number
                );

            if (!userId || !storyId) {

                return errorResponse(
                    "User ID and story ID are required",
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
                await getAuthorByUserId(
                    db,
                    userId
                );

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
                            SELECT
                                id,
                                author_id
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

                let number =
                    episodeNumber;

                if (!number) {

                    const last =
                        await db
                            .prepare(`
                                SELECT
                                    MAX(
                                        episode_number
                                    ) AS max_episode
                                FROM episodes
                                WHERE story_id = ?
                            `)
                            .bind(storyId)
                            .first();

                    number =
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
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                'published',
                                CURRENT_TIMESTAMP,
                                CURRENT_TIMESTAMP
                            )
                        `)
                        .bind(
                            storyId,
                            number,
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

            } catch {

                return errorResponse(
                    "Failed to create episode",
                    500
                );
            }
        }


        // =============================================
        // AUTHOR EARNINGS
        // =============================================

        if (
            path === "/author/earnings"
        ) {

            const userId =
                positiveInt(
                    body.user_id
                );

            if (!userId) {

                return errorResponse(
                    "User ID is required",
                    400
                );
            }

            const author =
                await getAuthorByUserId(
                    db,
                    userId
                );

            if (!author) {

                return errorResponse(
                    "Author profile not found",
                    404
                );
            }

            const gross =
                Number(
                    body.amount || 0
                );

            if (
                !Number.isFinite(gross) ||
                gross <= 0
            ) {

                return errorResponse(
                    "Invalid earning amount",
                    400
                );
            }

            const sourceType =
                cleanString(
                    body.source_type ||
                    "story",
                    50
                );

            /*
             * Story sale:
             * Author 70%
             * Platform 30%
             *
             * Recommendation:
             * Author 50%
             * Platform 50%
             */

            const isRecommendation =
                sourceType ===
                "recommendation";

            const authorRate =
                isRecommendation
                    ? 0.50
                    : 0.70;

            const platformRate =
                isRecommendation
                    ? 0.50
                    : 0.30;

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

                if (isRecommendation) {

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
                            VALUES (
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                'available'
                            )
                        `)
                        .bind(
                            positiveInt(
                                body.story_id
                            ) || 0,
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
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                'available'
                            )
                        `)
                        .bind(
                            author.id,
                            positiveInt(
                                body.story_id
                            ),
                            positiveInt(
                                body.episode_id
                            ),
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
                        gross_amount:
                            gross,
                        author_rate:
                            authorRate,
                        platform_rate:
                            platformRate,
                        author_amount:
                            authorAmount,
                        platform_amount:
                            platformAmount
                    }
                });

            } catch {

                return errorResponse(
                    "Failed to record earning",
                    500
                );
            }
        }


        // =============================================
        // AUTHOR WITHDRAWAL
        // =============================================

        if (
            path === "/withdrawals"
        ) {

            const userId =
                positiveInt(
                    body.user_id
                );

            const amount =
                Number(
                    body.amount
                );

            const methodName =
                cleanString(
                    body.method,
                    100
                );

            const accountName =
                cleanString(
                    body.account_name,
                    200
                );

            const accountNumber =
                cleanString(
                    body.account_number,
                    200
                );

            if (!userId) {

                return errorResponse(
                    "User ID is required",
                    400
                );
            }

            if (
                !Number.isFinite(amount) ||
                amount <= 0
            ) {

                return errorResponse(
                    "Invalid withdrawal amount",
                    400
                );
            }

            if (amount < 50000) {

                return errorResponse(
                    "Minimum withdrawal is TSh 50,000",
                    400
                );
            }

            const author =
                await getAuthorByUserId(
                    db,
                    userId
                );

            if (!author) {

                return errorResponse(
                    "Author profile not found",
                    404
                );
            }

            try {

                const balance =
                    await db
                        .prepare(`
                            SELECT
                                COALESCE(
                                    SUM(
                                        author_amount
                                    ),
                                    0
                                ) AS balance
                            FROM author_earnings
                            WHERE author_id = ?
                            AND status = 'available'
                        `)
                        .bind(author.id)
                        .first();

                const available =
                    Number(
                        balance?.balance || 0
                    );

                if (available < amount) {

                    return errorResponse(
                        "Insufficient available balance",
                        400,
                        {
                            available_balance:
                                available
                        }
                    );
                }

                const result =
                    await db
                        .prepare(`
                            INSERT INTO withdrawals (
                                author_id,
                                amount,
                                method,
                                account_name,
                                account_number,
                                status
                            )
                            VALUES (
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                'pending'
                            )
                        `)
                        .bind(
                            author.id,
                            amount,
                            methodName,
                            accountName,
                            accountNumber
                        )
                        .run();

                return json({
                    success: true,
                    message:
                        "Withdrawal request submitted",
                    withdrawal_id:
                        result.meta.last_row_id,
                    amount,
                    status:
                        "pending"
                }, 201);

            } catch {

                return errorResponse(
                    "Failed to submit withdrawal",
                    500
                );
            }
        }


        // =============================================
        // ADMIN APPROVE WITHDRAWAL
        // =============================================

        if (
            path === "/admin/withdrawals/approve"
        ) {

            const adminId =
                positiveInt(
                    body.admin_id
                );

            const withdrawalId =
                positiveInt(
                    body.withdrawal_id
                );

            const auth =
                await requireAdmin(
                    db,
                    adminId
                );

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
                    withdrawal.status !==
                    "pending"
                ) {

                    return errorResponse(
                        "Withdrawal is not pending",
                        409
                    );
                }

                /*
                 * Mark earning records as paid.
                 *
                 * The amount is matched from available
                 * earnings for this author.
                 */

                let remaining =
                    Number(
                        withdrawal.amount || 0
                    );

                const earnings =
                    await db
                        .prepare(`
                            SELECT
                                id,
                                author_amount
                            FROM author_earnings
                            WHERE author_id = ?
                            AND status = 'available'
                            ORDER BY
                                created_at ASC
                        `)
                        .bind(
                            withdrawal.author_id
                        )
                        .all();

                for (
                    const earning
                    of (
                        earnings.results || []
                    )
                ) {

                    if (remaining <= 0) {
                        break;
                    }

                    const earningAmount =
                        Number(
                            earning.author_amount || 0
                        );

                    if (
                        earningAmount <= 0
                    ) {
                        continue;
                    }

                    await db
                        .prepare(`
                            UPDATE author_earnings
                            SET status = 'paid'
                            WHERE id = ?
                        `)
                        .bind(
                            earning.id
                        )
                        .run();

                    remaining -=
                        earningAmount;
                }

                await db
                    .prepare(`
                        UPDATE withdrawals
                        SET
                            status = 'approved',
                            processed_by = ?,
                            processed_at =
                                CURRENT_TIMESTAMP,
                            updated_at =
                                CURRENT_TIMESTAMP
                        WHERE id = ?
                    `)
                    .bind(
                        adminId,
                        withdrawalId
                    )
                    .run();

                return json({
                    success: true,
                    message:
                        "Withdrawal approved",
                    withdrawal_id:
                        withdrawalId,
                    status:
                        "approved"
                });

            } catch {

                return errorResponse(
                    "Failed to approve withdrawal",
                    500
                );
            }
        }


        // =============================================
        // ADMIN REJECT WITHDRAWAL
        // =============================================

        if (
            path === "/admin/withdrawals/reject"
        ) {

            const adminId =
                positiveInt(
                    body.admin_id
                );

            const withdrawalId =
                positiveInt(
                    body.withdrawal_id
                );

            const note =
                cleanString(
                    body.admin_note,
                    5000
                );

            const auth =
                await requireAdmin(
                    db,
                    adminId
                );

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
                                processed_at =
                                    CURRENT_TIMESTAMP,
                                updated_at =
                                    CURRENT_TIMESTAMP
                            WHERE id = ?
                            AND status = 'pending'
                        `)
                        .bind(
                            note,
                            adminId,
                            withdrawalId
                        )
                        .run();

                if (
                    result.meta.changes === 0
                ) {

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
                    status:
                        "rejected"
                });

            } catch {

                return errorResponse(
                    "Failed to reject withdrawal",
                    500
                );
            }
        }


        // =============================================
        // POST NOT FOUND
        // =============================================

        return errorResponse(
            "Endpoint not found",
            404
        );
    }


    // =================================================
    // PUT
    // =================================================

    if (method === "PUT") {


        // =============================================
        // UPDATE PROFILE
        // =============================================

        if (
            path.startsWith("/profile/")
        ) {

            const parts =
                path.split("/")
                    .filter(Boolean);

            const userId =
                positiveInt(parts[1]);

            if (
                parts.length !== 2 ||
                !userId
            ) {

                return errorResponse(
                    "Invalid user ID",
                    400
                );
            }

            const username =
                cleanString(
                    bodyOrEmpty(
                        await readJson(request),
                        "username"
                    ),
                    100
                );

            /*
             * The request body was already consumed above.
             * This endpoint is kept separate below with the
             * proper body reader.
             */

            return errorResponse(
                "Use POST /profile/update for profile updates",
                400
            );
        }


        // =============================================
        // ADMIN SETTINGS / GENERIC STORY UPDATE
        // =============================================

        if (
            path.startsWith(
                "/admin/stories/"
            )
        ) {

            const body =
                await readJson(request);

            if (!body) {

                return errorResponse(
                    "Invalid JSON request",
                    400
                );
            }

            const parts =
                path.split("/")
                    .filter(Boolean);

            const storyId =
                positiveInt(parts[2]);

            const adminId =
                positiveInt(
                    body.admin_id
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
                                status = COALESCE(
                                    NULLIF(?, ''),
                                    status
                                ),
                                visibility = COALESCE(
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

                if (
                    result.meta.changes === 0
                ) {

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

            } catch {

                return errorResponse(
                    "Failed to update story",
                    500
                );
            }
        }


        return errorResponse(
            "Endpoint not found",
            404
        );
    }


    // =================================================
    // DELETE
    // =================================================

    if (method === "DELETE") {


        // =============================================
        // REMOVE BOOKMARK
        // =============================================

        if (
            path.startsWith(
                "/bookmarks/"
            )
        ) {

            const parts =
                path.split("/")
                    .filter(Boolean);

            const userId =
                positiveInt(parts[1]);

            const storyId =
                positiveInt(parts[2]);

            if (
                parts.length !== 3 ||
                !userId ||
                !storyId
            ) {

                return errorResponse(
                    "Invalid user ID or story ID",
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
                            userId,
                            storyId
                        )
                        .run();

                if (
                    result.meta.changes === 0
                ) {

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

            } catch {

                return errorResponse(
                    "Failed to remove bookmark",
                    500
                );
            }
        }


        // =============================================
        // ADMIN DELETE STORY
        // =============================================

        if (
            path.startsWith(
                "/admin/stories/"
            )
        ) {

            const parts =
                path.split("/")
                    .filter(Boolean);

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
                                updated_at =
                                    CURRENT_TIMESTAMP
                            WHERE id = ?
                        `)
                        .bind(storyId)
                        .run();

                if (
                    result.meta.changes === 0
                ) {

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

            } catch {

                return errorResponse(
                    "Failed to remove story",
                    500
                );
            }
        }


        return errorResponse(
            "Endpoint not found",
            404
        );
    }


    // =================================================
    // FALLBACK
    // =================================================

    return errorResponse(
        "Method not allowed",
        405
    );
}


// =====================================================
// HELPER USED BY PUT FALLBACK
// =====================================================

function bodyOrEmpty(body, key) {

    if (!body) {
        return "";
    }

    return body[key] ?? "";
}
