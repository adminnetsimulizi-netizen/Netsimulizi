const json = (data, status = 200) => {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        }
    });
};

const errorResponse = (message, status = 400) => {
    return json({
        success: false,
        message
    }, status);
};

const readJson = async (request) => {
    try {
        return await request.json();
    } catch {
        return null;
    }
};


// ==========================================
// PASSWORD HASHING
// ==========================================

const bytesToBase64 = (bytes) => {
    let binary = "";
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(
            ...bytes.subarray(i, i + chunkSize)
        );
    }

    return btoa(binary);
};

const base64ToBytes = (base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
};

const hashPassword = async (password) => {

    const encoder = new TextEncoder();

    const salt = crypto.getRandomValues(
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

    const iterations = 1000;

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

    const hash = new Uint8Array(hashBuffer);

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
            storedHash.split("$");

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


// ==========================================
// MAIN API
// ==========================================

export async function onRequest(context) {

    const {
        request,
        env
    } = context;

    const url =
        new URL(request.url);

    const path =
        url.pathname
            .replace(/^\/api/, "")
            .replace(/\/+$/, "") || "/";

    const method =
        request.method.toUpperCase();


    // ======================================
    // OPTIONS / CORS
    // ======================================

    if (method === "OPTIONS") {

        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods":
                    "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers":
                    "Content-Type"
            }
        });
    }


    // ======================================
    // GET
    // ======================================

    if (method === "GET") {


        // ==================================
        // HEALTH
        // ==================================

        if (path === "/health") {

            return json({
                success: true,
                message:
                    "Net Simulizi API is running",
                service:
                    "netsimulizi-api"
            });
        }


        // ==================================
        // TEST
        // ==================================

        if (path === "/test") {

            return json({
                success: true,
                message:
                    "Net Simulizi API test successful"
            });
        }


        // ==================================
        // DATABASE TEST
        // ==================================

        if (path === "/db-test") {

            try {

                const result =
                    await env.D1
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

            } catch (error) {

                return errorResponse(
                    "D1 database connection failed",
                    500
                );
            }
        }


        // ==================================
        // CATEGORIES
        // ==================================

        if (path === "/categories") {

            try {

                const result =
                    await env.D1
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
                    categories:
                        result.results || []
                });

            } catch (error) {

                return errorResponse(
                    "Failed to load categories",
                    500
                );
            }
        }


        // ==================================
        // STORIES LIST
        // ==================================

        if (path === "/stories") {

            try {

                const result =
                    await env.D1
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
                                authors.display_name
                                    AS author_name,
                                categories.name
                                    AS category_name
                            FROM stories
                            LEFT JOIN authors
                                ON stories.author_id =
                                   authors.id
                            LEFT JOIN categories
                                ON stories.category_id =
                                   categories.id
                            WHERE stories.status =
                                'published'
                            AND stories.visibility =
                                'public'
                            ORDER BY
                                stories.created_at DESC
                        `)
                        .all();

                return json({
                    success: true,
                    stories:
                        result.results || []
                });

            } catch (error) {

                return errorResponse(
                    "Failed to load stories",
                    500
                );
            }
        }


        // ==================================
        // STORY EPISODES
        // ==================================

        if (
            path.startsWith("/stories/") &&
            path.endsWith("/episodes")
        ) {

            const parts =
                path.split("/")
                    .filter(Boolean);

            const storyId =
                Number(parts[1]);

            if (
                parts.length !== 3 ||
                parts[2] !== "episodes" ||
                !Number.isInteger(storyId) ||
                storyId <= 0
            ) {

                return errorResponse(
                    "Invalid story ID",
                    400
                );
            }

            try {

                const result =
                    await env.D1
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

            } catch (error) {

                return errorResponse(
                    "Failed to load episodes",
                    500
                );
            }
        }


        // ==================================
        // STORY DETAILS
        // ==================================

        if (path.startsWith("/stories/")) {

            const parts =
                path.split("/")
                    .filter(Boolean);

            const storyId =
                Number(parts[1]);

            if (
                parts.length !== 2 ||
                !Number.isInteger(storyId) ||
                storyId <= 0
            ) {

                return errorResponse(
                    "Invalid story ID",
                    400
                );
            }

            try {

                const story =
                    await env.D1
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
                                authors.display_name
                                    AS author_name,
                                categories.name
                                    AS category_name
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
                            AND stories.visibility =
                                'public'
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


        // ==================================
        // PROFILE
        // ==================================

        if (path.startsWith("/profile/")) {

            const parts =
                path.split("/")
                    .filter(Boolean);

            const userId =
                Number(parts[1]);

            if (
                parts.length !== 2 ||
                !Number.isInteger(userId) ||
                userId <= 0
            ) {

                return errorResponse(
                    "Invalid user ID",
                    400
                );
            }

            try {

                const user =
                    await env.D1
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

                    return errorResponse(
                        "User not found",
                        404
                    );
                }

                return json({
                    success: true,
                    user
                });

            } catch (error) {

                return errorResponse(
                    "Failed to load profile",
                    500
                );
            }
        }

            // ==================================
        // BOOKMARKS - LIST
        // ==================================

        if (path.startsWith("/bookmarks/")) {

            const parts =
                path.split("/")
                    .filter(Boolean);

            const userId =
                Number(parts[1]);

            if (
                parts.length !== 2 ||
                !Number.isInteger(userId) ||
                userId <= 0
            ) {

                return errorResponse(
                    "Invalid user ID",
                    400
                );
            }

            try {

                const result =
                    await env.D1
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

            } catch (error) {

                return errorResponse(
                    "Failed to load bookmarks",
                    500
                );
            }
        }


        // ==================================
        // READING PROGRESS
        // ==================================

        if (
            path.startsWith("/reading-progress/")
        ) {

            const parts =
                path.split("/")
                    .filter(Boolean);

            const userId =
                Number(parts[1]);

            const storyId =
                Number(parts[2]);

            if (
                parts.length !== 3 ||
                !Number.isInteger(userId) ||
                userId <= 0 ||
                !Number.isInteger(storyId) ||
                storyId <= 0
            ) {

                return errorResponse(
                    "Invalid user ID or story ID",
                    400
                );
            }

            try {

                const progress =
                    await env.D1
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
                            INNER JOIN episodes
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
                    progress: progress || null
                });

            } catch (error) {

                return errorResponse(
                    "Failed to load reading progress",
                    500
                );
            }
        }


        // ==================================
        // READING HISTORY
        // ==================================

        if (
            path.startsWith("/reading-history/")
        ) {

            const parts =
                path.split("/")
                    .filter(Boolean);

            const userId =
                Number(parts[1]);

            if (
                parts.length !== 2 ||
                !Number.isInteger(userId) ||
                userId <= 0
            ) {

                return errorResponse(
                    "Invalid user ID",
                    400
                );
            }

            try {

                const result =
                    await env.D1
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
                            INNER JOIN episodes
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

            } catch (error) {

                return errorResponse(
                    "Failed to load reading history",
                    500
                );
            }
        }


        // ==================================
        // GET ENDPOINT NOT FOUND
        // ==================================

        return errorResponse(
            "Endpoint not found",
            404
        );
    }


    // ======================================
    // POST REQUESTS
    // ======================================

    if (method === "POST") {

        const body =
            await readJson(request);

        if (!body) {

            return errorResponse(
                "Invalid JSON request",
                400
            );
        }


        // ==================================
        // REGISTER
        // ==================================

        if (path === "/register") {

            const username =
                String(
                    body.username || ""
                ).trim();

            const email =
                String(
                    body.email || ""
                ).trim()
                .toLowerCase();

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
                    await env.D1
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
                    await env.D1
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

            } catch (error) {

                return errorResponse(
                    "Registration failed",
                    500
                );
            }
        }


        // ==================================
        // LOGIN
        // ==================================

        if (path === "/login") {

            const login =
                String(
                    body.login || ""
                ).trim();

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
                    await env.D1
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

            } catch (error) {

                return errorResponse(
                    "Login failed",
                    500
                );
            }
        }


        // ==================================
        // ADD BOOKMARK
        // ==================================

        if (path === "/bookmarks") {

            const userId =
                Number(body.user_id);

            const storyId =
                Number(body.story_id);

            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {

                return errorResponse(
                    "Invalid user ID",
                    400
                );
            }

            if (
                !Number.isInteger(storyId) ||
                storyId <= 0
            ) {

                return errorResponse(
                    "Invalid story ID",
                    400
                );
            }

            try {

                const story =
                    await env.D1
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

                const existing =
                    await env.D1
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

                const result =
                    await env.D1
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

            } catch (error) {

                return errorResponse(
                    "Failed to add bookmark",
                    500
                );
            }
        }


        // ==================================
        // SAVE READING PROGRESS
        // ==================================

        if (
            path === "/reading-progress"
        ) {

            const userId =
                Number(body.user_id);

            const storyId =
                Number(body.story_id);

            const episodeId =
                Number(body.episode_id);

            let progressPercent =
                Number(
                    body.progress_percent
                );

            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {

                return errorResponse(
                    "Invalid user ID",
                    400
                );
            }

            if (
                !Number.isInteger(storyId) ||
                storyId <= 0
            ) {

                return errorResponse(
                    "Invalid story ID",
                    400
                );
            }

            if (
                !Number.isInteger(episodeId) ||
                episodeId <= 0
            ) {

                return errorResponse(
                    "Invalid episode ID",
                    400
                );
            }

            if (
                !Number.isFinite(progressPercent)
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
                    await env.D1
                        .prepare(`
                            SELECT id, story_id
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

                await env.D1
                    .prepare(`
                        INSERT INTO reading_progress (
                            user_id,
                            story_id,
                            episode_id,
                            progress_percent,
                            last_read_at
                        )
                        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(user_id, story_id)
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

            } catch (error) {

                return errorResponse(
                    "Failed to save reading progress",
                    500
                );
            }
        }


        // ==================================
        // POST ENDPOINT NOT FOUND
        // ==================================

        return errorResponse(
            "Endpoint not found",
            404
        );
    }


    // ======================================
    // DELETE REQUESTS
    // ======================================

    if (method === "DELETE") {

        // ==================================
        // REMOVE BOOKMARK
        // ==================================

        if (
            path.startsWith("/bookmarks/")
        ) {

            const parts =
                path.split("/")
                    .filter(Boolean);

            const userId =
                Number(parts[1]);

            const storyId =
                Number(parts[2]);

            if (
                parts.length !== 3 ||
                !Number.isInteger(userId) ||
                userId <= 0 ||
                !Number.isInteger(storyId) ||
                storyId <= 0
            ) {

                return errorResponse(
                    "Invalid user ID or story ID",
                    400
                );
            }

            try {

                const result =
                    await env.D1
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

            } catch (error) {

                return errorResponse(
                    "Failed to remove bookmark",
                    500
                );
            }
        }


        return errorResponse(
            "Endpoint not found",
            404
        );
    }


    // ======================================
    // METHOD NOT ALLOWED
    // ======================================

    return errorResponse(
        "Method not allowed",
        405
    );
}
