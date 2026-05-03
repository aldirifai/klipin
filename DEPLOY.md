# Deploy Klipin

Setup default: pakai **nginx + certbot native di host** sebagai reverse proxy. Docker container expose port non-standar (default 9787 untuk API, 9737 untuk web), nginx forward dari domain ke port itu. Cocok kalau VPS sudah ada aplikasi lain yang pakai port 80/443.

## Prereq di server

- VPS Linux (min 4GB RAM, 2 vCPU; 8GB+ ideal kalau render parallel)
- Docker + Docker Compose v2 (`docker compose version`)
- nginx + certbot native (kalau belum: `apt install nginx certbot python3-certbot-nginx`)
- Domain pointing ke IP VPS (A record)

## Step 1 — Build & jalankan container

```bash
git clone <your-repo-url> klipin
cd klipin

cp .env.production.example .env.production
# Edit: isi DOMAIN, JWT_SECRET (openssl rand -hex 32), API keys, dll
# Pilih WEB_PORT + API_PORT yang masih kosong di VPS — default 9737 + 9787

docker compose up -d --build

# Verify container jalan
docker compose ps
curl http://127.0.0.1:9787/health   # harus return {"status":"ok"}
```

## Step 2 — nginx reverse proxy

Bikin file `/etc/nginx/sites-available/klipin`:

```nginx
upstream klipin_api { server 127.0.0.1:9787; }
upstream klipin_web { server 127.0.0.1:9737; }

server {
    listen 80;
    server_name klipin.id;  # ganti ke domain kamu

    # Backend routes (API)
    location ~ ^/(health|auth|jobs|clips|payments|docs|openapi.json|redoc) {
        proxy_pass http://klipin_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        client_max_body_size 100M;  # buat upload video besar (kalau nanti add)
    }

    # Frontend (Next.js)
    location / {
        proxy_pass http://klipin_web;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Activate:

```bash
sudo ln -s /etc/nginx/sites-available/klipin /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Step 3 — HTTPS via certbot

```bash
sudo certbot --nginx -d klipin.id
# Pilih: redirect HTTP -> HTTPS
```

Certbot otomatis edit nginx config + setup auto-renew.

## Step 4 — Update CORS & frontend env

Setelah HTTPS aktif, pastikan `.env.production` ada `https://`:

```
NEXT_PUBLIC_API_URL=https://klipin.id
PUBLIC_APP_URL=https://klipin.id
CORS_ORIGINS=["https://klipin.id"]
```

Rebuild web container biar `NEXT_PUBLIC_API_URL` ke-bake ke bundle:

```bash
docker compose up -d --build web
```

## Update setelah deploy

```bash
git pull
docker compose up -d --build
```

Migrasi DB jalan otomatis tiap container restart (alembic upgrade head di entrypoint).

## Backup data

Storage user (video output) + DB ada di Docker volume:

```bash
# Backup
docker run --rm -v klipin_storage:/data -v $(pwd):/backup alpine \
  tar czf /backup/storage.tar.gz /data
docker run --rm -v klipin_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/db.tar.gz /data

# Restore
docker run --rm -v klipin_storage:/data -v $(pwd):/backup alpine \
  tar xzf /backup/storage.tar.gz -C /
```

## Set webhook Midtrans

Setelah HTTPS aktif, di dashboard Midtrans → Settings → Configuration → Payment Notification URL:

```
https://klipin.id/payments/webhook
```

## Scale up nanti

Saat traffic tumbuh:

1. **Pisah worker pipeline** — tambah service `worker` di compose, swap `BackgroundTasks` ke arq + Redis.
2. **SQLite → Postgres** — ganti `DATABASE_URL` ke `postgresql+asyncpg://...`, tambah service `postgres` di compose.
3. **Storage → R2** — ganti file path-based serving ke signed URL dari Cloudflare R2.
4. **CDN untuk static** — Cloudflare proxy di depan domain.

Semua sudah di-design buat ditambah modular.

## Alternatif: Caddy auto-HTTPS (kalau VPS kosong)

Kalau VPS-nya kosong (port 80/443 belum dipakai), bisa skip nginx native dan pakai Caddy yang dibundle:

```bash
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d --build
```

Caddy auto-provision Let's Encrypt cert via `DOMAIN` di `.env.production`. Tapi karena VPS kamu ada aplikasi lain di port 80/443, **jangan pakai overlay ini**.

## Troubleshooting

**`mediapipe` ImportError saat container start** — `libgl1` / `libglib2.0-0` perlu ada di image. Sudah included di Dockerfile, tapi pastikan `apt-get install` jalan saat build (cek log `docker compose build api`).

**API jawab 502 di nginx** — backend belum ready atau port salah. Check:
```bash
docker compose logs -f api
curl http://127.0.0.1:9787/health
```

**Render klip gagal "ffmpeg failed"** — kena cap memory. Naikin VPS RAM, atau kurangi `MAX_INPUT_MINUTES` di env.

**Webhook Midtrans gak nyampe** — pastikan `/payments/webhook` ke-route di nginx (cek `location` rules di config).

**File upload besar di-cut nginx** — tambah `client_max_body_size 200M;` di nginx config.
