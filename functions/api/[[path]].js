export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    const path = url.pathname
        .replace(/^\/api\/?/, '')
        .replace(/\/$/, '');

    const segments = path
        ? path.split('/').map(segment => {
            try {
                return decodeURIComponent(segment);
            } catch {
                return segment;
            }
        })
        : [];

    function json(status, body) {
        return new Response(JSON.stringify(body), {
            status,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    async function readJson() {
        try {
            return await request.json();
        } catch {
            return null;
        }
    }

    // ==========================================
    // HEALTH
    // ==========================================

    if (request.method === 'GET' && path === 'health') {
        return json(200, {
            success: true,
            message: 'Net Simulizi API is running',
            service: 'netsimulizi-api'
        });
    }

    // ==========================================
    // API TEST
    // ==========================================

    if (request.method === 'GET' && path === 'test') {
        return json(200, {
            success: true,
            message: 'Net Simulizi API connection successful'
        });
    }

    // ==========================================
    // D1 TEST
    // ==========================================

    if (request.method === 'GET' && path === 'db-test') {
        if (!env.D1) {
            return json(500, {
                success: false,
                message: 'D1 database binding was not found'
            });
        }

        try {
            const result = await env.D1
                .prepare('SELECT 1 AS test')
                .first();

            return json(200, {
                success: true,
                message: 'D1 database connection successful',
                database: 'netsimulizi',
                result
            });
        } catch (error) {
            return json(500, {
                success: false,
                message: 'D1 database connection failed',
                error: error.message
            });
        }
    }

    // ==========================================
    // CATEGORIES - GET
    // ==========================================

    if (request.method === 'GET' && path === 'categories') {
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

            return json(200, {
                success: true,
                data: result.results || []
            });
        } catch (error) {
            return json(500, {
                success: false,
                message: 'Failed to fetch categories',
                error: error.message
            });
        }
    }

    // ==========================================
    // STORIES - GET ALL
    // ==========================================

    if (request.method === 'GET' && path === 'stories') {
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

            return json(200, {
                success: true,
                data: result.results || []
            });
        } catch (error) {
            return json(500, {
                success: false,
                message: 'Failed to fetch stories',
                error: error.message
            });
        }
    }

    // ==========================================
    // STORY - GET ONE
    // /api/stories/1
    // ==========================================

    if (
        request.method === 'GET' &&
        segments[0] === 'stories' &&
        segments.length === 2
    ) {
        const storyId = Number(segments[1]);

        if (!Number.isInteger(storyId) || storyId <= 0) {
            return json(400, {
                success: false,
                message: 'Invalid story ID'
            });
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
                    LIMIT 1
                `)
                .bind(storyId)
                .first();

            if (!story) {
                return json(404, {
                    success: false,
                    message: 'Story not found'
                });
            }

            return json(200, {
                success: true,
                data: story
            });
        } catch (error) {
            return json(500, {
                success: false,
                message: 'Failed to fetch story',
                error: error.message
            });
        }
    }

    // ==========================================
    // EPISODES - GET BY STORY
    // /api/stories/1/episodes
    // ==========================================

    if (
        request.method === 'GET' &&
        segments[0] === 'stories' &&
        segments.length === 3 &&
        segments[2] === 'episodes'
    ) {
        const storyId = Number(segments[1]);

        if (!Number.isInteger(storyId) || storyId <= 0) {
            return json(400, {
                success: false,
                message: 'Invalid story ID'
            });
        }

        try {
            const result = await env.D1
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
                      AND status != 'deleted'
                    ORDER BY episode_number ASC
                `)
                .bind(storyId)
                .all();

            return json(200, {
                success: true,
                data: result.results || []
            });
        } catch (error) {
            return json(500, {
                success: false,
                message: 'Failed to fetch episodes',
                error: error.message
            });
        }
    }

    // ==========================================
    // REGISTER
    // ==========================================

    if (request.method === 'POST' && path === 'register') {
        const body = await readJson();

        if (!body) {
            return json(400, {
                success: false,
                message: 'Invalid JSON data'
            });
        }

        const username = String(body.username || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');

        if (!username || !email || !password) {
            return json(400, {
                success: false,
                message: 'Username, email and password are required'
            });
        }

        return json(201, {
            success: true,
            message: 'Register endpoint is ready',
            data: {
                username,
                email
            }
        });
    }

    // ==========================================
    // LOGIN
    // ==========================================

    if (request.method === 'POST' && path === 'login') {
        const body = await readJson();

        if (!body) {
            return json(400, {
                success: false,
                message: 'Invalid JSON data'
            });
        }

        const username = String(body.username || '').trim();
        const password = String(body.password || '');

        if (!username || !password) {
            return json(400, {
                success: false,
                message: 'Username and password are required'
            });
        }

        return json(200, {
            success: true,
            message: 'Login endpoint is ready',
            data: {
                username
            }
        });
    }

    // ==========================================
    // 404
    // ==========================================

    return json(404, {
        success: false,
        message: 'API endpoint not found',
        path
    });
}
