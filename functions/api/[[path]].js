export async function onRequest(context) {
    const { request, env } = context;

    const url = new URL(request.url);

    const path = url.pathname
        .replace(/^\/api\/?/, '')
        .replace(/\/$/, '');

    const segments = path
        ? path.split('/').map(segment => decodeURIComponent(segment))
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

    // HEALTH
    if (request.method === 'GET' && path === 'health') {
        return response(200, {
            success: true,
            message: 'Net Simulizi API is running',
            service: 'netsimulizi-api'
        });
    }

    // TEST
    if (request.method === 'GET' && path === 'test') {
        return response(200, {
            success: true,
            message: 'Net Simulizi API connection successful'
        });
    }

    // GET STORIES
    if (request.method === 'GET' && segments[0] === 'stories') {

        return response(200, {
            success: true,
            data: [],
            message: 'Stories endpoint is working'
        });
    }

    // CREATE STORY
    if (request.method === 'POST' && path === 'stories') {

        const body = await readJson();

        if (!body) {
            return response(400, {
                success: false,
                message: 'Invalid JSON data'
            });
        }

        const { title, content, author } = body;

        if (
            !String(title || '').trim() ||
            !String(content || '').trim() ||
            !String(author || '').trim()
        ) {
            return response(400, {
                success: false,
                message: 'Title, content and author are required'
            });
        }

        return response(201, {
            success: true,
            message: 'Story received successfully',
            data: {
                title: String(title).trim(),
                content: String(content).trim(),
                author: String(author).trim()
            }
        });
    }

    // LOGIN
    if (request.method === 'POST' && path === 'login') {

        const body = await readJson();

        if (!body) {
            return response(400, {
                success: false,
                message: 'Invalid JSON data'
            });
        }

        const { username, password } = body;

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

    // REGISTER
    if (request.method === 'POST' && path === 'register') {

        const body = await readJson();

        if (!body) {
            return response(400, {
                success: false,
                message: 'Invalid JSON data'
            });
        }

        const { username, email, password } = body;

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

    return response(404, {
        success: false,
        message: 'API endpoint not found',
        path
    });
}
