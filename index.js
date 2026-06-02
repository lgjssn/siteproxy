var express = require('express')
var ProxyMiddleware = require('http-proxy-middleware');
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
let app = express()
var Proxy = require('./Proxy')
let { blockedSites, urlModify, httpprefix, serverName, port, locationReplaceMap302, regReplaceMap, siteSpecificReplace, pathReplace } = require('./config')

let cookieDomainRewrite = serverName
let proxy = Proxy({ ProxyMiddleware, blockedSites, urlModify, httpprefix, serverName, port, cookieDomainRewrite, locationReplaceMap302, regReplaceMap, siteSpecificReplace, pathReplace})

// --- Auth setup ---
app.use(express.urlencoded({ extended: false }))

const AUTH_SECRET = crypto.randomBytes(32).toString('hex')
const PASSWORD = process.env.PROXY_PASSWORD

if (!PASSWORD) {
    console.warn('============================================')
    console.warn('WARNING: PROXY_PASSWORD not set.')
    console.warn('The proxy will run WITHOUT password protection.')
    console.warn('Set PROXY_PASSWORD env var to enable auth.')
    console.warn('============================================')
}

function createAuthToken() {
    const pw = PASSWORD || ''
    return crypto.createHmac('sha256', AUTH_SECRET).update(pw).digest('hex')
}

function verifyAuthToken(token) {
    if (!token || !PASSWORD) return !PASSWORD // if no password set, always pass
    const expected = crypto.createHmac('sha256', AUTH_SECRET).update(PASSWORD).digest('hex')
    try {
        return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))
    } catch {
        return false
    }
}

function parseCookies(cookieHeader) {
    const cookies = {}
    if (!cookieHeader) return cookies
    cookieHeader.split(';').forEach(c => {
        const idx = c.indexOf('=')
        if (idx > 0) cookies[c.slice(0, idx).trim()] = c.slice(idx + 1).trim()
    })
    return cookies
}

function getLoginPage(redirectPath, errorMsg) {
    const redirect = redirectPath ? redirectPath.replace(/"/g, '&quot;') : ''
    const error = errorMsg ? `<p class="error">${errorMsg}</p>` : ''
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Proxy Login</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#1a1a2e;color:#eee;display:flex;justify-content:center;align-items:center;min-height:100vh}
.login-box{background:#16213e;padding:40px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.3);width:360px;max-width:90vw}
.login-box h1{text-align:center;margin-bottom:24px;font-size:1.5rem;color:#e94560}
.login-box input[type="password"]{width:100%;padding:12px 16px;border:1px solid #0f3460;border-radius:8px;background:#0f3460;color:#eee;font-size:1rem;margin-bottom:16px;outline:none;transition:border-color .2s}
.login-box input[type="password"]:focus{border-color:#e94560}
.login-box button{width:100%;padding:12px;border:none;border-radius:8px;background:#e94560;color:#fff;font-size:1rem;cursor:pointer;transition:background .2s}
.login-box button:hover{background:#c73650}
.login-box .error{color:#e94560;text-align:center;margin-top:12px;font-size:.9rem}
</style>
</head>
<body>
<div class="login-box">
<h1>Access Restricted</h1>
<form method="POST" action="/login">
<input type="hidden" name="redirect" value="${redirect}">
<input type="password" name="password" placeholder="Enter password" required autofocus>
<button type="submit">Login</button>
${error}
</form>
</div>
</body>
</html>`
}

// Login/logout routes (must be before auth middleware)
app.get('/login', (req, res) => {
    const redirect = req.query.redirect || '/'
    res.type('html').send(getLoginPage(redirect))
})

app.post('/login', (req, res) => {
    const pw = req.body.password || ''
    const redirect = req.body.redirect || '/'
    if (!PASSWORD || pw === PASSWORD) {
        const token = createAuthToken()
        res.setHeader('Set-Cookie', `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`)
        res.redirect(redirect)
    } else {
        res.type('html').send(getLoginPage(redirect, 'Incorrect password'))
    }
})

app.get('/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'auth_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0')
    res.redirect('/login')
})

// Auth middleware
app.use((req, res, next) => {
    if (req.path === '/login' || req.path === '/logout') return next()
    const cookies = parseCookies(req.headers['cookie'])
    if (verifyAuthToken(cookies['auth_token'])) return next()
    const redirectPath = req.originalUrl !== '/' ? req.originalUrl : '/'
    res.type('html').send(getLoginPage(redirectPath))
})

// --- Original middleware ---
const middle1 = (req, res, next) => {
    let timestr = new Date().toISOString()
    let myRe = new RegExp(`/http[s]?/${serverName}[0-9:]*?`, 'g')
    req.url = req.url.replace(myRe, '')
    if (req.url.length === 0) {
        req.url = '/'
    }

    console.log(`${timestr}: req.url:${req.url}`)
    const dirPath = path.join(__dirname, req.url)
    let fwdStr = req.headers['x-forwarded-for']
    if (fwdStr && fwdStr.split(',').length > 3) {
        return res.status(404).send('{"error": "too many redirects"}')
    }
    if (req.url === '/' || req.url === '/index.html') {
        body = fs.readFileSync(path.join(__dirname, './index.html'), encoding = 'utf-8')
        res.status(200).send(body)
        return
    } else
    if (fs.existsSync(dirPath) && !fs.lstatSync(dirPath).isDirectory()) {
        body = fs.readFileSync(dirPath)
        return res.status(200).send(body)
    }
    next()
}
app.use(middle1)
app.use(proxy)

let reallistenPort = process.env.PORT || 8011
app.listen(reallistenPort)

console.log(`listening on port:${reallistenPort}`)
