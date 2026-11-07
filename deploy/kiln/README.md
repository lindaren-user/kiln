# Kiln 单机部署

一台 Linux 服务器上跑三个容器：

| 容器 | 镜像 | 作用 |
| --- | --- | --- |
| `kiln` | `ghcr.io/<仓库所有者>/kiln:<12位提交号>` | 控制台和 API。前端在构建镜像时打进这一个 Go 程序，没有单独的前端容器 |
| `kiln-postgres` | `postgres:15` | 唯一要保留的数据。数据在 Docker 命名卷 `pg_data` 里 |
| `kiln-nginx` | `nginx:1.28-alpine` | 对外的 80/443、证书、流式输出和 WebSocket |

不跑 Redis。应用使用进程内缓存（`MEMORY_CACHE_ENABLED=true`）。进程重启后缓存从 PostgreSQL 重新装入。

仓库根目录的 `docker-compose.yml` 是上游的快速试用文件，里面带 Redis。Kiln 只用本目录。

## 为什么是这个形状

PostgreSQL 放在 Docker 里，并用命名卷保存数据。换应用镜像、重建数据库容器，卷都还在。不要把数据库目录挂到一个会改来改去的宿主机路径上，也不要在宿主机再装一套 PostgreSQL。

Nginx 使用官方镜像，配置文件挂进去。不要把它打进 kiln 镜像，也不要在宿主机再装一个 Nginx。公网只访问 80 和 443。应用的 3000 端口不映射出来。

业务数据不跟着版本回退。回退只换 `kiln` 这一个镜像。每次部署前会先 `pg_dump`。只有新版本把表结构迁坏、旧程序已经起不来时，才用那份备份恢复数据库。

## 服务器准备（只做一次）

系统装 Docker Engine 和 Compose 插件，部署用户在 `docker` 组里。还需要本机的 `openssl`。

```bash
sudo mkdir -p /opt/kiln
sudo chown "$USER" /opt/kiln
cd /opt/kiln
# 先从仓库拷一份，或等第一次 GitHub Actions 上传这些文件后再写 .env
cp .env.example .env
chmod 600 .env
openssl rand -hex 24    # 填进 POSTGRES_PASSWORD
openssl rand -hex 32    # 填进 SESSION_SECRET
```

`.env` 里改这三项：

- `KILN_DOMAIN`：域名，不要写 `https://`，不要带路径。例如 `kiln.example.com`
- `POSTGRES_PASSWORD`、`SESSION_SECRET`：只用上面生成的十六进制。密码里不要出现 `@`、`:`、`/`
- `POSTGRES_PASSWORD` 必须在第一次启动数据库之前写好。数据卷创建之后再改这一行，不会改变库里已经生效的密码

`KILN_IMAGE` 留着示例里的占位值即可，部署脚本会改掉它。

域名的 A 记录指向这台机器。安全组放行 SSH 端口、80 和 443。

## GitHub 准备（只做一次）

在放这份代码的仓库里：

1. Settings → Secrets and variables → Actions → Variables，新建 `KILN_ENABLED`，值是 `true`。没有这个变量时，推到 `main` 只跑测试，不构建、不部署。
2. 同一页的 Secrets：

| Secret | 内容 |
| --- | --- |
| `KILN_HOST` | 服务器 IP 或 SSH 域名 |
| `KILN_SSH_PORT` | SSH 端口。不填则按 22 |
| `KILN_USER` | 能运行 `docker` 的 SSH 用户 |
| `KILN_SSH_KEY` | 私钥全文。对应公钥放进该用户的 `authorized_keys` |
| `KILN_GHCR_USER` | GitHub 用户名。镜像默认是私有的，服务器要靠它登录才能拉取 |
| `KILN_GHCR_TOKEN` | Personal access token，勾选 `read:packages` |

镜像名是 `ghcr.io/<仓库所有者小写>/kiln:<提交号>`。服务器是 ARM 时，把 `.github/workflows/kiln.yml` 里的 `platforms: linux/amd64` 改成 `linux/arm64`。

## 一次发布怎么走

1. 功能在其他分支做完，合并进 `main`。
2. `.github/workflows/kiln.yml` 跑后端测试和前端测试。
3. 通过后构建镜像并推到 GHCR。标签是这次提交的 12 位 SHA，不是 `latest`，也不是会移动的 `main`。
4. Actions SSH 到服务器，把本目录的 `docker-compose.yml`、`nginx.conf.template` 和两个脚本拷到 `/opt/kiln`。`.env` 不会被覆盖。
5. 服务器执行 `remote-deploy.sh`：数据库已在运行就先备份，再只重建 `kiln` 和 `nginx`。PostgreSQL 容器不动。
6. 新容器能通过 `/api/status` 才算完成。失败时把 `.env` 里的镜像改回上一个 SHA 并再次启动应用。数据库保持不动。

工作流页面里可以手动运行 Kiln。`image_tag` 留空会构建当前提交；填一个已经存在的 12 位 SHA 则跳过构建，直接把线上换回那一版。

## 改了配置之后做什么

在服务器上进入 `/opt/kiln`。

| 改了什么 | 命令 | 会重启谁 |
| --- | --- | --- |
| `.env` 里的域名、`SESSION_SECRET`、缓存或时区 | `docker compose up -d --force-recreate --no-deps kiln` | 只有 kiln |
| `nginx.conf.template`，或换了证书文件之后要重新读模板 | `docker compose up -d --force-recreate --no-deps nginx` | 只有 nginx |
| 只替换了 `certs/` 里的证书，配置没变 | `docker compose exec nginx nginx -s reload` | 不重建容器 |
| 镜像版本 | 推 `main`，或手动运行工作流并填 SHA | kiln 和 nginx |

Nginx 容器启动时才把 `nginx.conf.template` 渲染成实际配置，所以改模板后要重建 nginx，单靠 `nginx -s reload` 看不到模板里的新内容。

这些文件每次部署都会用仓库里的版本覆盖服务器上的同名文件：

- `docker-compose.yml`
- `nginx.conf.template`
- `remote-deploy.sh`
- `init-certs.sh`

改它们要改仓库并推到 `main`。只在服务器上改，下次发布会被盖掉。`.env`、`certs/`、`pg_data` 和 `backups/` 只留在服务器上。

## 证书

第一次部署没有证书时，`init-certs.sh` 会写一张 30 天的自签证书，站点能起来，浏览器会提示不受信任。换成 Let's Encrypt 时，在服务器上执行（把邮箱和域名换成自己的）：

```bash
cd /opt/kiln
docker run --rm \
  -v /opt/kiln/acme:/var/www/acme \
  -v /opt/kiln/letsencrypt:/etc/letsencrypt \
  certbot/certbot certonly --webroot -w /var/www/acme \
  --cert-name kiln \
  -d "$(awk -F= '/^KILN_DOMAIN=/{print substr($0,index($0,"=")+1)}' .env)" \
  --agree-tos --email you@example.com --non-interactive
cp -L letsencrypt/live/kiln/fullchain.pem certs/fullchain.pem
cp -L letsencrypt/live/kiln/privkey.pem certs/privkey.pem
chmod 644 certs/fullchain.pem certs/privkey.pem
docker compose exec nginx nginx -s reload
```

续期重复后面的 `certbot`、`cp` 和 `nginx -s reload`。可以用 cron 每月跑一次。证书更新不需要重启 kiln。

## 回退和数据库

普通回退：Actions 里手动运行 Kiln，`image_tag` 填上一个成功部署的 SHA。用户、额度和渠道都留在 PostgreSQL 里。

部署开始时如果数据库已经在跑，备份在 `/opt/kiln/backups/kiln-<时间>.sql.gz`。新版本启动后迁移失败、旧镜像也起不来时，才恢复这份备份：

```bash
cd /opt/kiln
docker compose stop kiln
gunzip -c backups/kiln-<时间>.sql.gz > /tmp/kiln-restore.sql
docker compose exec -T postgres dropdb -U kiln --force --if-exists kiln
docker compose exec -T postgres createdb -U kiln kiln
docker compose exec -T postgres psql -U kiln -d kiln < /tmp/kiln-restore.sql
rm /tmp/kiln-restore.sql
```

然后用出问题之前的镜像 SHA 再跑一次部署。恢复会丢掉这份备份之后写入的数据。

另外建议每天把数据库拷走一份，不要只留在同一块磁盘上：

```bash
0 3 * * * cd /opt/kiln && docker compose exec -T postgres pg_dump -U kiln kiln | gzip > backups/daily-$(date +\%Y\%m\%d).sql.gz
```

## Cloudflare R2 for Quick Generate

Quick Generate reference images, videos, and audio can upload directly from the browser to R2 (up to 100 MiB per file). Set the optional `QUICK_GENERATE_UPLOAD_S3_*` values in `.env`; the R2 credentials stay in the kiln container. Create an R2 API token scoped to a dedicated bucket with object read/write permissions. `QUICK_GENERATE_UPLOAD_URL_TTL_SECONDS` controls the signed download URL lifetime (default 21600 seconds, maximum 86400 seconds).

Configure the bucket CORS policy for your exact Kiln site origin, methods `GET` and `PUT`, and headers `content-type` and `x-amz-checksum-sha256`. Add an R2 lifecycle rule for the configured prefix (default `quick-generate/`) to delete objects after 2 days. Object keys use the global SHA-256 digest, so identical files share an object until lifecycle cleanup removes it. R2 lifecycle cleanup is asynchronous, so expired objects may remain briefly.

After changing the R2 values in `.env`, recreate only the application container:

```bash
docker compose up -d --force-recreate --no-deps kiln
```
