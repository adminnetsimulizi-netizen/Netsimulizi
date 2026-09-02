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

    function response(status, body) {
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
    // HEALTH CHECK
    // ==========================================

    if (request.method === 'GET' && path === 'health') {
        return response(200, {
            success: true,
            message: 'Net Simulizi API is running',
            service: 'netsimulizi-api'
        });
    }

    // ==========================================
    // API TEST
    // ==========================================

    if (request.method === 'GET' && path === 'test') {
        return response(200, {
            success: true,
            message: 'Net Simulizi API connection successful'
        });
    }

    // ==========================================
    // D1 DATABASE TEST
    // ==========================================

    if (request.method === 'GET' && path === 'db-test') {

        if (!env.D1) {
            return response(500, {
                success: false,
                message: 'D1 database binding was not found',
                binding: 'D1'
            });
        }

        try {
            const result = await env.D1
                .prepare('SELECT 1 AS test')
                .first();

            return response(200, {
                success: true,
                message: 'D1 database connection successful',
                database: 'netsimulizi',
                result
            });

        } catch (error) {
            return response(500, {
                success: false,
                message: 'D1 database connection failed',
                error: error.message
            });
        }
    }

    // ==========================================
    // STORIES - GET
    // ==========================================

    if (request.method === 'GET' && segments[0] === 'stories') {

        if (!env.D1) {
            return response(500, {
                success: false,
                message: 'D1 database binding was not found'
            });
        }

        try {
            const result = await env.D1
                .prepare(`
                    SELECT *
                    FROM stories
                    ORDER BY id DESC
                `)
                .all();

            return response(200, {
                success: true,
                data: result.results || []
            });

        } catch (error) {

            return response(500, {
                success: false,
                message: 'Failed to fetch stories',
                error: error.message
            });
        }
    }

    // ==========================================
    // STORIES - POST
    // ==========================================

    if (request.method === 'POST' && path === 'stories') {

        const body = await readJson();

        if (!body) {
            return response(400, {
                success: false,
                message: 'Invalid JSON data'
            });
        }

        const title = String(body.title || '').trim();
        const content = String(body.content || '').trim();
        const author = String(body.author || '').trim();

        if (!title || !content || !author) {
            return response(400, {
                success: false,
                message: 'Title, content and author are required'
            });
        }

        if (!env.D1) {
            return response(500, {
                success: false,
                message: 'D1 database binding was not found'
            });
        }

        try {

            const result = await env.D1
                .prepare(`
                    INSERT INTO stories
                    (title, content, author)
                    VALUES (?, ?, ?)
                `)
                .bind(title, content, author)
                .run();

            return response(201, {
                success: true,
                message: 'Story created successfully',
                data: {
                    id: result.meta?.last_row_id,
                    title,
                    content,
                    author
                }
            });

        } catch (error) {

            return response(500, {
                success: false,
                message: 'Failed to create story',
                error: error.message
            });
        }
    }

    // ==========================================
    // LOGIN
    // ==========================================

    if (request.method === 'POST' && path === 'login') {

        const body = await readJson();

        if (!body) {
            return response(400, {
                success: false,
                message: 'Invalid JSON data'
            });
        }

        const username = String(body.username || '').trim();
        const password = String(body.password || '');

        if (!username || !password) {
            return response(400, {
                success: false,
                message: 'Username and password are required'
            });
        }

        return response(200, {
            success: true,
            message: 'Login endpoint is working',
            data: {
                username
            }
        });
    }

    // ==========================================
    // REGISTER
    // ==========================================

    if (request.method === 'POST' && path === 'register') {

        const body = await readJson();

        if (!body) {
            return response(400, {
                success: false,
                message: 'Invalid JSON data'
            });
        }

        const username = String(body.username || '').trim();
        const email = String(body.email || '').trim();
        const password = String(body.password || '');

        if (!username || !email || !password) {
            return response(400, {
                success: false,
                message: 'Username, email and password are required'
            });
        }

        return response(201, {
            success: true,
            message: 'Register endpoint is working',
            data: {
                username,
                email
            }
        });
    }

    // ==========================================
    // 404
    // ==========================================

    return response(404, {
        success: false,
        message: 'API endpoint not found',
        path
    });
}
