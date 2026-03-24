const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8787;
const HOST = '127.0.0.1';
const HTML_FILE = path.join(__dirname, 'mobile-test.html');
const ENV_FILE = path.join(__dirname, '.env');

function loadDotEnv(filePath) {
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, 'utf8');
    raw.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const idx = trimmed.indexOf('=');
        if (idx === -1) return;
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim();
        if (key && process.env[key] === undefined) {
            process.env[key] = value;
        }
    });
}

loadDotEnv(ENV_FILE);

function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, statusCode, payload) {
    setCorsHeaders(res);
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => {
            data += chunk;
            if (data.length > 2 * 1024 * 1024) {
                reject(new Error('Request body too large'));
            }
        });
        req.on('end', () => {
            try {
                resolve(data ? JSON.parse(data) : {});
            } catch (e) {
                reject(new Error('Invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}

async function handleGenerateQuestions(req, res) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return sendJson(res, 500, { error: 'ANTHROPIC_API_KEY is missing. Add it to .env' });
    }

    let body;
    try {
        body = await readJsonBody(req);
    } catch (e) {
        return sendJson(res, 400, { error: e.message });
    }

    const model = body.model || 'claude-sonnet-4-20250514';
    const maxTokens = Number(body.maxTokens || 4000);
    const systemPrompt = body.systemPrompt;
    const userPrompt = body.userPrompt;

    if (!systemPrompt || !userPrompt) {
        return sendJson(res, 400, { error: 'systemPrompt and userPrompt are required' });
    }

    try {
        const upstream = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model,
                max_tokens: maxTokens,
                system: systemPrompt,
                messages: [
                    { role: 'user', content: userPrompt }
                ]
            })
        });

        const text = await upstream.text();
        let payload;
        try {
            payload = JSON.parse(text);
        } catch {
            payload = { raw: text };
        }

        if (!upstream.ok) {
            return sendJson(res, upstream.status, {
                error: 'Anthropic API request failed',
                details: payload
            });
        }

        return sendJson(res, 200, payload);
    } catch (e) {
        return sendJson(res, 502, {
            error: 'Unable to reach Anthropic API',
            details: e.message
        });
    }
}

function serveHtml(res) {
    if (!fs.existsSync(HTML_FILE)) {
        return sendJson(res, 404, { error: 'mobile-test.html not found next to server file' });
    }
    const html = fs.readFileSync(HTML_FILE, 'utf8');
    setCorsHeaders(res);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
}

function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.css') return 'text/css; charset=utf-8';
    if (ext === '.js') return 'application/javascript; charset=utf-8';
    if (ext === '.html') return 'text/html; charset=utf-8';
    if (ext === '.json') return 'application/json; charset=utf-8';
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.svg') return 'image/svg+xml';
    if (ext === '.webp') return 'image/webp';
    return 'application/octet-stream';
}

function serveStaticAsset(reqPath, res) {
    const safePath = path.normalize(reqPath).replace(/^([.][.][\\/])+/, '');
    const filePath = path.join(__dirname, safePath);

    if (!filePath.startsWith(__dirname)) {
        return sendJson(res, 403, { error: 'Forbidden path' });
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return sendJson(res, 404, { error: 'Not found' });
    }

    const content = fs.readFileSync(filePath);
    setCorsHeaders(res);
    res.writeHead(200, { 'Content-Type': getContentType(filePath) });
    res.end(content);
}

const server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent((req.url || '/').split('?')[0]);

    if (req.method === 'OPTIONS') {
        setCorsHeaders(res);
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'GET' && (pathname === '/' || pathname === '/mobile-test.html')) {
        serveHtml(res);
        return;
    }

    if (req.method === 'GET') {
        serveStaticAsset(pathname.replace(/^\//, ''), res);
        return;
    }

    if (req.method === 'POST' && pathname === '/api/generate-questions') {
        await handleGenerateQuestions(req, res);
        return;
    }

    sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, HOST, () => {
    console.log(`Quiz proxy server running at http://${HOST}:${PORT}`);
    console.log('Open / in your browser to run the quiz through the secure proxy.');
});