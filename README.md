<div align="center">
    <h1><b>SnoWind</b></h1>
    <p>
        Open-source collaborative wiki and documentation software.
        <br />
        Version <strong>0.95.0</strong>
    </p>
</div>
<br />

## Docker Compose 安装（正式版）

本发行版通过 Docker Compose 安装。首次构建会在本地编译前后端镜像，耗时较长。

| 服务 | 地址 / 端口 |
|------|-------------|
| 应用 | http://localhost:3000 |
| PostgreSQL | localhost:**5435** |
| Redis | localhost:**6379**（默认端口） |
| Typesense | 仅容器内网（搜索引擎） |

### 环境要求

- Docker Engine 24+ 与 Docker Compose v2
- 本机 3000、5435、6379 端口未被占用

### 安装步骤

1. 复制环境变量文件：

```powershell
copy .env.example .env
```

Linux / macOS：

```bash
cp .env.example .env
```

2. 编辑 `.env`，将 `APP_SECRET` 改为至少 32 位随机字符串（生产环境务必修改数据库密码与 Typesense API Key）：

```bash
openssl rand -hex 32
```

3. 构建并启动：

```bash
docker compose up -d --build
```

4. 浏览器打开 [http://localhost:3000](http://localhost:3000)，注册第一个管理员账号。

### 常用命令

```bash
docker compose ps
docker compose logs -f snowind
docker compose down          # 停止（保留数据卷）
docker compose down -v       # 停止并删除数据（不可恢复）
```

数据库迁移在应用以生产模式启动时自动执行，无需单独跑 migrate。

开发机上用 `pnpm dev` 联调时，请改用 `docker-compose.dev.yml`（Postgres 5444、Redis 2817），避免与正式版端口冲突。

## Features

- Real-time collaboration
- Diagrams (Draw.io, Excalidraw and Mermaid)
- Spaces
- Permissions management
- Groups
- Comments
- Page history
- Search
- File attachments
- Embeds (Airtable, Loom, Miro and more)
- Translations (10+ languages)

### License
SnoWind core is licensed under the open-source AGPL 3.0 license.  
Enterprise features are available under an enterprise license (Enterprise Edition).  

All files in the following directories are licensed under the SnoWind Enterprise license defined in `packages/ee/License`.
  - apps/server/src/ee
  - apps/client/src/ee
  - packages/ee
