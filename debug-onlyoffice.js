/**
 * OnlyOffice / Documents Diagnostic
 * Chạy: node debug-onlyoffice.js
 *
 * Kiểm tra đúng 5 tầng của luồng mở tài liệu:
 *   1. Docker containers + env của backend
 *   2. Backend đọc được SMB/FTP không (browse + download)
 *   3. nginx frontend proxy /onlyoffice có đúng không (Location phải đủ host:port + prefix)
 *   4. DS có gọi ngược về backend được không (document.url)
 *   5. DocsAPI JS + editor iframe
 *
 * Override bằng biến môi trường:
 *   GF_FRONTEND  (mặc định http://localhost:8088)
 *   GF_BACKEND   (mặc định http://localhost:8000)
 *   GF_CONFIG_ID (mặc định 30)  GF_FILE_PATH  GF_USER_CODE  GF_USER_ROLE
 *
 * LƯU Ý: không probe DS qua port publish của host (8090). Trên Windows, một
 * nginx.exe chạy trên host có thể bind 127.0.0.1:8090 và che mất Docker —
 * kết quả 404 giả. Luôn đi qua nginx của container frontend.
 */

const { execSync } = require('child_process');
const http = require('http');
const https = require('https');

const FRONTEND = process.env.GF_FRONTEND || 'http://localhost:8088';
const BACKEND = process.env.GF_BACKEND || 'http://localhost:8000';
const CONFIG_ID = process.env.GF_CONFIG_ID || '30';
const FILE_PATH = process.env.GF_FILE_PATH || '';
const USER_CODE = process.env.GF_USER_CODE || 'admin';
const USER_ROLE = process.env.GF_USER_ROLE || 'admin';

const results = [];
let failures = 0;

function log(status, section, detail) {
  const icon = status === 'OK' ? '✅' : status === 'WARN' ? '⚠️ ' : status === 'INFO' ? 'ℹ️ ' : '❌';
  if (status === 'FAIL') failures++;
  results.push(`${icon} [${section}] ${detail}`);
}

function request(fullUrl, { headers = {}, timeout = 15000, redirect = false } = {}) {
  return new Promise((resolve) => {
    const lib = fullUrl.startsWith('https:') ? https : http;
    const req = lib.get(fullUrl, { headers, timeout }, (res) => {
      if (redirect && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, fullUrl).toString();
        resolve(request(next, { headers, timeout, redirect }));
        return;
      }
      let data = '';
      res.on('data', (c) => { if (data.length < 4e6) data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', (e) => resolve({ status: 0, error: e.message, headers: {}, body: '' }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout', headers: {}, body: '' }); });
  });
}

function sh(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch (e) { return null; }
}

function detail(e) {
  return (e && (e.error || (e.body && e.body.substring(0, 200)))) || 'no response';
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  GOLDENFARM ICT — OnlyOffice / Documents Diagnostic');
  console.log(`  frontend=${FRONTEND}  backend=${BACKEND}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── 1. Containers + env ────────────────────────────────────────
  const ps = sh('docker compose ps --format "{{.Name}} {{.Status}}"') || sh('docker ps --format "{{.Names}} {{.Status}}"');
  for (const name of ['goldenfarm-backend', 'goldenfarm-frontend', 'goldenfarm-onlyoffice', 'goldenfarm-postgres']) {
    const line = (ps || '').split('\n').find((l) => l.includes(name));
    if (!line) log('FAIL', 'DOCKER', `${name} không chạy`);
    else if (/unhealthy|restarting|exited/i.test(line)) log('FAIL', 'DOCKER', line);
    else log('OK', 'DOCKER', line);
  }

  const env = sh('docker exec goldenfarm-backend printenv BACKEND_PUBLIC_URL ONLYOFFICE_URL ONLYOFFICE_PUBLIC_URL ONLYOFFICE_ENABLED');
  if (env === null) {
    log('FAIL', 'ENV', 'không đọc được env của backend container');
  } else {
    const [backendPublic, ooUrl, ooPublic, ooEnabled] = env.split('\n');
    log('INFO', 'ENV', `BACKEND_PUBLIC_URL=${backendPublic || '(trống)'}`);
    log('INFO', 'ENV', `ONLYOFFICE_URL=${ooUrl}  ONLYOFFICE_PUBLIC_URL=${ooPublic}  ENABLED=${ooEnabled}`);
    if (!backendPublic) {
      log('FAIL', 'ENV', 'BACKEND_PUBLIC_URL trống → backend sẽ suy ra từ header Host của browser → DS gọi ngược về frontend và ECONNREFUSED. Đặt ONLYOFFICE_BACKEND_URL=http://backend:8000 trong .env');
    } else if (!/^https?:\/\/(backend|[^/]*\.[^/]*)/.test(backendPublic) || /localhost|127\.0\.0\.1/.test(backendPublic)) {
      log('WARN', 'ENV', `BACKEND_PUBLIC_URL=${backendPublic} — DS container có thể không resolve được`);
    }
    if (ooEnabled !== 'true') log('WARN', 'ENV', 'ONLYOFFICE_ENABLED != true');
  }

  // ── 2. Backend đọc storage ─────────────────────────────────────
  const browseUrl = `${BACKEND}/api/documents/browse/${CONFIG_ID}?path=/&user_code=${USER_CODE}&user_role=${USER_ROLE}`;
  const browse = await request(browseUrl);
  let testFile = FILE_PATH;
  if (browse.status !== 200) {
    log('FAIL', 'BROWSE', `GET /browse/${CONFIG_ID} → HTTP ${browse.status}: ${detail(browse)}`);
  } else {
    let entries = [];
    try { entries = JSON.parse(browse.body).data || []; } catch (_) {}
    log('OK', 'BROWSE', `storage ${CONFIG_ID} liệt kê được ${entries.length} mục`);
    if (!testFile) {
      const office = entries.find((e) => !e.is_dir && /\.(docx?|xlsx?|pptx?|odt|ods|odp|csv|rtf|txt|pdf)$/i.test(e.name));
      testFile = office ? office.name : (entries.find((e) => !e.is_dir) || {}).name;
    }
  }

  if (!testFile) {
    log('WARN', 'FILE', 'không tìm được file nào để test — bỏ qua bước 3/4');
  }

  // ── 3. nginx proxy /onlyoffice: Location phải đủ host:port + prefix ──
  const probe = `${FRONTEND}/onlyoffice/web-apps/apps/spreadsheeteditor/main/index.html`;
  const r1 = await request(probe);
  if (r1.status !== 302) {
    log('FAIL', 'NGINX', `GET ${probe} → HTTP ${r1.status} (kỳ vọng 302). Thiếu location /onlyoffice/ hoặc DS chết.`);
  } else {
    const loc = r1.headers.location || '';
    log('INFO', 'NGINX', `Location: ${loc}`);
    const expectedOrigin = new URL(FRONTEND).origin;
    if (!loc.startsWith(`${expectedOrigin}/onlyoffice/`)) {
      log('FAIL', 'NGINX', `Location phải bắt đầu bằng ${expectedOrigin}/onlyoffice/ — editor sẽ không load (trang trắng).`
        + (!loc.includes(expectedOrigin) ? ' Thiếu PORT: nginx đang gửi `Host $host` thay vì `$http_host`.' : ' Thiếu PREFIX: nginx chưa gửi `X-Forwarded-Prefix /onlyoffice`.'));
    } else {
      log('OK', 'NGINX', 'redirect đúng scheme://host:port + prefix /onlyoffice');
      const followed = await request(probe, { redirect: true });
      if (followed.status === 200) log('OK', 'NGINX', 'theo redirect → editor index.html 200');
      else log('FAIL', 'NGINX', `theo redirect → HTTP ${followed.status}`);
    }
  }

  // HTTPS qua reverse proxy (NPM/Cloudflare) — chống Mixed Content
  const r2 = await request(probe, {
    headers: { 'X-Forwarded-Host': 'noibo.canhdongvang.vn', 'X-Forwarded-Proto': 'https' },
  });
  if (r2.status === 302) {
    const loc = r2.headers.location || '';
    if (loc.startsWith('https://noibo.canhdongvang.vn/onlyoffice/')) log('OK', 'NGINX-HTTPS', `Location: ${loc}`);
    else log('WARN', 'NGINX-HTTPS', `production sẽ sinh Location sai (Mixed Content): ${loc}`);
  }

  // ── 4. Config + DS gọi ngược về backend ────────────────────────
  if (testFile) {
    const cfgUrl = `${BACKEND}/api/documents/onlyoffice/config?config_id=${CONFIG_ID}`
      + `&file_path=${encodeURIComponent(testFile)}&user_code=${USER_CODE}&user_role=${USER_ROLE}`;
    const cfgRes = await request(cfgUrl);
    if (cfgRes.status !== 200) {
      log('FAIL', 'CONFIG', `HTTP ${cfgRes.status}: ${detail(cfgRes)}`);
    } else {
      let cfg = {};
      try { cfg = JSON.parse(cfgRes.body); } catch (_) {}
      const docUrl = (cfg.document && cfg.document.url) || '';
      const cbUrl = (cfg.editorConfig && cfg.editorConfig.callbackUrl) || '';
      log('OK', 'CONFIG', `file="${cfg.document && cfg.document.title}" mode=${cfg.editorConfig && cfg.editorConfig.mode} jwt=${cfg.token ? 'có' : 'KHÔNG'}`);
      log('INFO', 'CONFIG', `document.url = ${docUrl}`);
      log('INFO', 'CONFIG', `callbackUrl  = ${cbUrl}`);
      log('INFO', 'CONFIG', `_docsApiUrl  = ${cfg._docsApiUrl}`);
      if (!cfg.token) log('FAIL', 'CONFIG', 'thiếu token JWT → DS sẽ báo "security token is not correctly formed"');
      if (cfg._docsApiUrl && !cfg._docsApiUrl.startsWith('/')) log('WARN', 'CONFIG', '_docsApiUrl không phải đường dẫn tương đối → dễ lệch origin');

      // DS tải file thật (chạy curl TỪ trong container DS, đúng network path DS dùng)
      if (docUrl) {
        const out = sh(`docker exec goldenfarm-onlyoffice curl -sS -m 60 -o /tmp/gf_probe.bin -w "%{http_code} %{size_download}" "${docUrl}"`);
        if (out === null) log('WARN', 'DS-DOWNLOAD', 'không exec được vào container DS');
        else {
          const [code, size] = out.split(' ');
          if (code === '200' && Number(size) > 0) log('OK', 'DS-DOWNLOAD', `DS → backend: HTTP 200, ${size} bytes`);
          else log('FAIL', 'DS-DOWNLOAD', `DS → backend: HTTP ${code}, ${size} bytes. Xem docservice/out.log`);
        }
      }
    }
  }

  // ── 5. DocsAPI JS + health ─────────────────────────────────────
  const api = await request(`${FRONTEND}/onlyoffice/web-apps/apps/api/documents/api.js`);
  if (api.status === 200 && /DocsAPI/.test(api.body)) log('OK', 'DOCSAPI', `api.js 200, ${api.body.length} bytes`);
  else log('FAIL', 'DOCSAPI', `api.js → HTTP ${api.status}`);

  const hc = await request(`${FRONTEND}/onlyoffice/healthcheck`);
  if (hc.status === 200 && /true/.test(hc.body)) log('OK', 'DS-HEALTH', 'healthcheck = true');
  else log('FAIL', 'DS-HEALTH', `healthcheck → HTTP ${hc.status} ${hc.body.substring(0, 60)}`);

  const cache = await request(`${FRONTEND}/onlyoffice/cache/files/__probe__/x.xlsx`);
  if (cache.status === 403 || cache.status === 404) log('OK', 'NGINX-CACHE', `location /onlyoffice/cache/ thông (HTTP ${cache.status} do thiếu secure_link — đúng)`);
  else log('FAIL', 'NGINX-CACHE', `location /onlyoffice/cache/ → HTTP ${cache.status}`);

  // ── Tổng kết ───────────────────────────────────────────────────
  console.log('───────────────────────────────────────────────────────────');
  results.forEach((r) => console.log(r));
  console.log('───────────────────────────────────────────────────────────');
  console.log(failures === 0 ? '  ✅ Tất cả kiểm tra đều đạt\n' : `  ❌ ${failures} kiểm tra THẤT BẠI\n`);

  if (failures > 0) {
    console.log('  Log cần xem:');
    console.log('    docker compose logs --tail=100 backend');
    console.log('    docker exec goldenfarm-onlyoffice tail -n 100 /var/log/onlyoffice/documentserver/docservice/out.log');
    console.log('    docker exec goldenfarm-frontend  tail -n 100 /var/log/nginx/api-error.log');
    console.log('  Chi tiết: README.md → "🚀 Deploy & Bảo trì Server"\n');
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
