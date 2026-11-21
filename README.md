# TechComp Hub

ศูนย์รวมการแข่งขันคอมพิวเตอร์และเทคโนโลยีสำหรับโรงเรียนไทย — นักเรียนค้นหาและลงชื่อรายการที่ตรงกับทักษะ อาจารย์ตรวจรายการและจัดทีมได้ในที่เดียว

## Stack

| ส่วน | เทคโนโลยี |
| --- | --- |
| Web | Next.js 16.4 (App Router, Turbopack, `output: "standalone"`), React 19, TypeScript |
| UI | Tailwind CSS v4, shadcn/ui, `lucide-react`, `@dnd-kit/core` |
| Data | PostgreSQL 16 (Docker) + `pg`, FORCE ROW LEVEL SECURITY |
| Auth | `node:crypto` scrypt + `jose` HS256 cookie session |
| AI | บริการวิเคราะห์ข้อความและ OCR ที่ตั้งค่าผ่านตัวแปรสภาพแวดล้อม |

## Local development

```bash
cp .env.example .env.local   # then fill POSTGRES_PASSWORD / APP_DB_PASSWORD / SESSION_SECRET
docker compose --env-file .env.local up -d db
npm install
npm run dev
```

`http://localhost:3000`

## AI features

- **ค้นหาด้วย AI (`POST /api/discovery`):** นักเรียนพิมพ์เป็นภาษาธรรมชาติได้ เช่น “อยากแข่ง AI หุ่นยนต์ ทีม 3 คน” ระบบแปลงคำขอเป็นหมวด/ขนาดทีม/ระดับชั้น กรองเฉพาะรายการ `open` ที่ยังไม่หมดอายุจาก PostgreSQL ผ่าน RLS แล้วให้บริการวิเคราะห์อัตโนมัติจัดอันดับ **เฉพาะ ID ที่มีอยู่จริง**; ทุกฟิลด์ที่แสดงมาจากแถวฐานข้อมูล ถ้า AI ไม่พร้อมหรือตอบไม่ตรงรูปแบบจะฟอลแบ็กเป็นผลลัพธ์แบบคะแนนและบอกเหตุผลเป็นภาษาไทย
- **Smart Add / Auto Scout:** สกัดข้อมูลจากลิงก์ ข้อความ และโปสเตอร์ ตรวจ URL สาธารณะและแหล่งที่มา ไม่สร้างรายการจากพาดหัวข่าวอย่างเดียว และรองรับการยกเลิกกลางทาง Auto Scout ยังค้นหาเว็บจากแหล่งข่าวสาธารณะเพื่อหาลิงก์ใหม่ ก่อนกรอง URL สาธารณะและส่งให้ตัววิเคราะห์อัตโนมัติ รายการที่พบยังเข้าสู่สถานะ `pending_review` เสมอ

## Verification (must pass before deploy)

```bash
./scripts/check.sh
```

Runs `tsc --noEmit`, ESLint, `node:test` unit tests, and a production build. `npm test` alone runs the unit tests.

## License

MIT. See `LICENSE`.

## Production deployment (self-hosted)

Target: any self-hosted Linux machine with Docker Compose. Set `DEPLOY_HOST` and `DEPLOY_DIR` for your environment.

```bash
./scripts/deploy.sh "$DEPLOY_HOST"
```

The script:

1. runs `check.sh` locally and aborts on any failure,
2. takes a verified `pg_dump` backup on the host (`backups/`, 14-day retention),
3. tags the running image as `tech-competition-hub-web:rollback-<UTC>`,
4. rsyncs the tree while preserving the remote `.env.local` and `backups/`,
5. applies numbered SQL files through `npm run db:migrate` with checksum ledger,
6. rebuilds the `web` container and checks `/`, `/login`, `/api/health`.

### Why `--env-file` is required

Compose interpolates `${POSTGRES_PASSWORD}` and `${APP_DB_PASSWORD}` from the shell or `--env-file`. `env_file:` inside the service only feeds the container, so omitting the flag fails with “required variable … is missing a value”.

```bash
docker compose --env-file .env.local ps
docker compose --env-file .env.local logs -f web
```

### Schema changes

`db/schema.sql` boots fresh Docker volumes. Every later change goes into a numbered file under `db/migrations/` and is applied by `npm run db:migrate`.

### Backups and restore

```bash
ssh "$DEPLOY_HOST" "cd \"$DEPLOY_DIR\" && ./scripts/backup-db.sh backups"
gunzip -c backups/competition-hub-<stamp>.sql.gz \
  | docker compose --env-file .env.local exec -T db \
      psql -U postgres -d tech_competition_hub
```

### Rollback

```bash
ssh "$DEPLOY_HOST" "cd \"$DEPLOY_DIR\" && \
  docker tag tech-competition-hub-web:rollback-<stamp> tech-competition-hub-web:latest && \
  docker compose --env-file .env.local up -d --no-build web"
```

### Health checks

| Endpoint | Meaning |
| --- | --- |
| `/api/health` | `200` when the web process can reach PostgreSQL, `503` otherwise |
| `docker compose ps` | `web` and `db` health from Compose healthchecks |
| `scout.log` | Scheduled scout output, if you enable file logging |

## Operations notes

- Sessions are revoked on password or role changes through `auth_security.session_version`; the acting device receives a fresh cookie.
- Confirmed teams must hold `min_size`–`max_size` members. The rule is enforced in the API **and** by a deferred constraint trigger in PostgreSQL.
- `POST /api/cron/discover` requires `Authorization: Bearer $CRON_SECRET`. Use `scripts/run-daily-scout.sh`.
- `POST /api/cron/reminders` uses the same cron secret and sends deadline notifications. Use `scripts/run-reminders.sh` on a daily schedule.
- Set `TRUST_PROXY_HEADERS=true` only behind a reverse proxy that overwrites `X-Forwarded-For` and `X-Real-IP`. Direct deployments use one non-spoofable `direct` rate-limit bucket.
- Web search discovery is optional. Set `SEARCH_PROVIDER=auto` and one provider key, or name a provider explicitly. Keys are read only by server code. See `.env.example` for variable names.
- `COOKIE_SECURE=true` only behind HTTPS; the LAN/Tailscale HTTP setup must keep it `false`.
