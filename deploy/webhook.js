/**
 * GitHub Webhook Auto-Deploy Server
 * รับ webhook จาก GitHub แล้วรัน deploy script อัตโนมัติ
 */

const http = require('http');
const crypto = require('crypto');
const { execFile } = require('child_process');
const path = require('path');

// ========== Configuration ==========
const PORT = process.env.WEBHOOK_PORT || 9000;
const SECRET = process.env.WEBHOOK_SECRET || 'your-webhook-secret-change-me';
const DEPLOY_BRANCH = process.env.DEPLOY_BRANCH || 'main';
const DEPLOY_SCRIPT = path.join(__dirname, 'deploy.sh');

// ========== Helpers ==========

function verifySignature(payload, signature) {
    if (!signature) return false;
    const hmac = crypto.createHmac('sha256', SECRET);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

function log(msg) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${msg}`);
}

function runDeploy() {
    log('Starting deploy...');
    execFile('bash', [DEPLOY_SCRIPT], { cwd: path.join(__dirname, '..') }, (error, stdout, stderr) => {
        if (error) {
            log(`Deploy ERROR: ${error.message}`);
            if (stderr) log(`STDERR: ${stderr}`);
            return;
        }
        if (stdout) log(`Deploy output:\n${stdout}`);
        log('Deploy completed successfully!');
    });
}

// ========== Server ==========

const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', service: 'webhook-deploy' }));
        return;
    }

    if (req.method !== 'POST' || req.url !== '/webhook') {
        res.writeHead(404);
        res.end('Not found');
        return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });

    req.on('end', () => {
        const signature = req.headers['x-hub-signature-256'];
        if (!verifySignature(body, signature)) {
            log('Invalid signature - rejected');
            res.writeHead(401);
            res.end('Invalid signature');
            return;
        }

        let payload;
        try {
            payload = JSON.parse(body);
        } catch (e) {
            log('Invalid JSON payload');
            res.writeHead(400);
            res.end('Invalid JSON');
            return;
        }

        const event = req.headers['x-github-event'];
        log(`Received event: ${event}`);

        if (event === 'push') {
            const branch = (payload.ref || '').replace('refs/heads/', '');
            log(`Push to branch: ${branch}`);

            if (branch === DEPLOY_BRANCH) {
                log(`Branch matches "${DEPLOY_BRANCH}" - deploying!`);
                res.writeHead(200);
                res.end('Deploying...');
                runDeploy();
            } else {
                log(`Ignoring push to "${branch}"`);
                res.writeHead(200);
                res.end('Ignored - different branch');
            }
        } else if (event === 'ping') {
            log('Ping received - webhook configured correctly!');
            res.writeHead(200);
            res.end('Pong!');
        } else {
            res.writeHead(200);
            res.end('Event ignored');
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    log(`Webhook server listening on port ${PORT}`);
    log(`Deploy branch: ${DEPLOY_BRANCH}`);
    log(`Health check: http://localhost:${PORT}/health`);
});
