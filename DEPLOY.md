# Deploy Klipin

## Prereq di server

- VPS Linux (min 4GB RAM, 2 vCPU). Untuk render parallel: 8GB+ RAM ideal.
- Domain pointing ke IP server (A record).
- Docker + Docker Compose v2 (`docker compose version`).
- Port 80 + 443 terbuka.

## Steps

```bash
# 1. Clone & masuk dir
git clone <your-repo-url> klipin
cd klipin

# 2. Setup env
cp .env.production.example .env.production
# Edit .env.production, isi DOMAIN, JWT_SECRET, API keys, dll
openssl rand -hex 32  # generate JWT_SECRET, paste ke file

# 3. Build & jalankan
docker compose up -d --build

# 4. Check log
docker compose logs -f api
docker compose logs -f web
docker compose logs -f caddy

# 5. Caddy auto-provision HTTPS dalam ~30 detik. Cek:
curl https://your-domain.com/health
```

## Update setelah deploy

```bash
git pull
docker compose up -d --build
```

Migrasi DB jalan otomatis tiap container start (alembic upgrade head di entrypoint).

## Backup data

Storage user (video output) + DB ada di Docker volume:

```bash
# Backup
docker run --rm -v klipin_storage:/data -v $(pwd):/backup alpine tar czf /backup/storage.tar.gz /data
docker run --rm -v klipin_data:/data -v $(pwd):/backup alpine tar czf /backup/db.tar.gz /data

# Restore
docker run --rm -v klipin_storage:/data -v $(pwd):/backup alpine tar xzf /backup/storage.tar.gz -C /
```

## Scale up nanti

Saat traffic tumbuh:

1. **Pisah worker pipeline** — tambah service `worker` di compose, swap `BackgroundTasks` ke arq + Redis.
2. **SQLite → Postgres** — ganti `DATABASE_URL` ke `postgresql+asyncpg://...`, tambah service `postgres` di compose.
3. **Storage → R2** — ganti file path-based serving ke signed URL dari Cloudflare R2.

Semua sudah di-design buat ditambah modular.

## Troubleshooting

**`mediapipe` ImportError saat container start** — base image kelewat install `libgl1` / `libglib2.0-0`. Sudah included di Dockerfile, tapi pastikan `apt-get install` jalan saat build (cek log `docker compose build api`).

**Caddy stuck "obtaining certificate"** — DNS A record belum propagate, atau port 80/443 ke-block firewall. Test: `curl http://your-domain.com` dari luar.

**API jawab 502 di Caddy** — backend belum ready. Tunggu 30 detik, atau cek `docker compose logs api`. Migration mungkin lagi jalan.

**Render klip gagal "ffmpeg failed"** — biasanya kena cap memory. Naikin VPS RAM, atau kurangi `MAX_INPUT_MINUTES`.

**Webhook Midtrans gak nyampe** — set webhook URL di dashboard Midtrans ke `https://your-domain.com/payments/webhook`.
