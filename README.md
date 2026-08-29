<div align="center">
  <h1><b>SnoWind</b></h1>
  <p>
    开源协作 Wiki / 知识库。<br />
    当前发行版 <strong>v0.1.1</strong>
  </p>
</div>

推荐用 **Docker Compose** 安装。安装者不需要克隆本仓库，也不需要准备 `.env`：只要有一份 `docker-compose.yml`，即可在 Linux 或 Windows 上启动全部服务（应用、PostgreSQL、Redis、Typesense、OnlyOffice）。

仓库：<https://github.com/snowy-storm/SnoWind>

---

## 功能

- 实时协作编辑
- 图表（Draw.io、Excalidraw、Mermaid）
- 空间与权限、用户组
- 评论、页面历史、搜索
- 附件；Office 预览与编辑（OnlyOffice：doc / docx / xls / xlsx / ppt / pptx）
- 嵌入（Airtable、Loom、Miro 等）
- 多语言（10+）

---

## 服务器最低配置

本发行版默认启用 **OnlyOffice Document Server**（Office 预览/编辑），内存占用最大。请按下面选型，不要用「刚好卡住」的机器做生产。

| 规模 | CPU | 内存 | 磁盘 | 适用 |
|------|-----|------|------|------|
| **最低可运行** | 2 核 | **4 GB** | 20 GB SSD | 本机试用、1～5 人；OnlyOffice 会偏慢，首次打开文档可能要等 |
| **建议生产** | 4 核 | **8 GB** | 40 GB SSD | 小团队日常使用 |
| **较舒适** | 4 核及以上 | **16 GB** | 80 GB SSD | 同时多人编辑、较多 Office 文档 |

说明：

- SnoWind 应用 + PostgreSQL + Redis + Typesense 合计大约占用 **1.5～2.5 GB** 内存。
- OnlyOffice Document Server 官方建议单独预留约 **2 GB** 内存；这是 4 GB 机器会吃紧的原因。
- 需要公网或局域网访问时，请放行 **3000**（网站）和 **8080**（OnlyOffice）端口。
- 健康检查：`http://你的地址:3000/api/health`

---

## 安装前准备

服务器上必须已安装 **Docker Engine** 和 **Compose 插件**（`docker compose` 命令）。

- Linux：按 [Docker 官方安装文档](https://docs.docker.com/engine/install/) 安装。
- Windows：安装 [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/)，并启用 WSL 2 后端。安装完成后 **新开一个 PowerShell 窗口** 再执行下面的命令。

Ubuntu 示例：

```shell
sudo apt-get update -qqy
sudo apt-get install ca-certificates curl -qqy
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update -qqy
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-compose-plugin -qqy
sudo usermod -aG docker "$USER"
```

然后 **重新登录 SSH**（或重启），再继续。可用 `docker compose version` 确认。

---

## 安装步骤（只需 docker-compose.yml）

### Linux 服务器

在空目录里下载官方 Compose 文件并启动：

```shell
mkdir snowind
cd snowind
curl -fL -o docker-compose.yml https://raw.githubusercontent.com/snowy-storm/SnoWind/v0.1.1/docker-compose.yml
```

打开文件看第一行：应是以 `#` 开头的 SnoWind 说明。**如果整篇只有 `404: Not Found`，说明下载失败，删掉后重试。** 用编辑器（例如 `nano docker-compose.yml`）按下一节修改密钥和访问地址。保存后：

```shell
docker compose up -d
```

查看是否起来：

```shell
docker compose ps
docker compose logs -f snowind
```

浏览器打开 `http://localhost:3000`（本机）或 `http://服务器IP:3000`，按页面提示创建第一个工作区和管理员账号。

### Windows（PowerShell）

1. 确认 Docker Desktop 正在运行（托盘图标为启动状态）。
2. 打开 **PowerShell**（不必管理员，除非公司策略要求）。
3. 执行：

```powershell
New-Item -ItemType Directory -Force -Path .\snowind | Out-Null
Set-Location .\snowind
if (Test-Path .\docker-compose.yml) { Remove-Item .\docker-compose.yml -Force }
curl.exe -fL -o docker-compose.yml https://raw.githubusercontent.com/snowy-storm/SnoWind/v0.1.1/docker-compose.yml
Get-Content .\docker-compose.yml -TotalCount 5
```

前几行必须是 SnoWind 的注释（以 `#` 开头），**不能**是 `404: Not Found`。若仍是 404，也可从发行页下载同一文件：  
https://github.com/snowy-storm/SnoWind/releases/tag/v0.1.1  

用记事本打开 `docker-compose.yml`，按下一节修改密钥和访问地址。保存后，**仍在该文件夹中**执行：

```powershell
docker compose up -d
```

查看状态：

```powershell
docker compose ps
docker compose logs -f snowind
```

浏览器打开 [http://localhost:3000](http://localhost:3000)，创建第一个管理员账号。

> 必须使用 `curl.exe -fL`。只写 `curl` 时，PowerShell 可能把它当成别的命令，失败时仍会生成一个假的 yml，里面只有 `404: Not Found`。

---

## 必须修改的配置

打开 `docker-compose.yml`，至少检查这些项（文件顶部注释也有说明）。

| 项 | 作用 | 怎么改 |
|----|------|--------|
| `APP_URL` | 浏览器里打开网站的地址 | 本机：`http://localhost:3000`；局域网/公网：`http://服务器IP:3000` 或你的域名 |
| `APP_SECRET` | 应用密钥，**至少 32 个字符** | Linux：`openssl rand -hex 32`；Windows PowerShell：`[guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")` |
| `POSTGRES_PASSWORD` 与 `DATABASE_URL` 里的密码 | 数据库密码 | **两处必须完全相同** |
| `TYPESENSE_API_KEY` 与 typesense 的 `--api-key` | 搜索密钥 | **两处必须完全相同** |
| `ONLYOFFICE_JWT_SECRET` 与 onlyoffice 的 `JWT_SECRET` | Office 编辑密钥 | **两处必须完全相同，至少 32 字符** |
| `ONLYOFFICE_URL` | 浏览器访问 Document Server 的地址 | 远程访问时改为 `http://服务器IP:8080` |

改完后若容器已在运行：

```shell
docker compose up -d
```

Compose 会按新环境变量重建需要的容器。

邮件与对象存储默认即可：`MAIL_DRIVER=log`（不发真实邮件）、`STORAGE_DRIVER=local`（文件存在 Docker 数据卷里）。

---

## 启动之后

首次 `docker compose up -d` 会拉取：

- `ghcr.io/snowy-storm/snowind:0.1.1`（SnoWind 应用）
- PostgreSQL、Redis、Typesense
- `onlyoffice/documentserver`（体积较大）

全部变为 `running` / `healthy` 后，打开 `APP_URL` 完成初始化。你将成为工作区所有者，再邀请其他人。

数据库迁移会在应用以生产模式启动时自动执行，**不要**再单独跑 migrate。

### 反向代理与 WebSocket

若前面有 Nginx / Caddy / 公司网关，**必须开启 WebSocket**（`Upgrade` / `Connection` 头）。实时协作编辑依赖 WebSocket；未开启时编辑器会一直只读。

---

## 升级到新版本

进入放 `docker-compose.yml` 的目录：

```shell
docker compose pull
docker compose up -d
```

若发行说明要求改 Compose（例如新环境变量），先下载新的 `docker-compose.yml`，**保留你改过的密码和 APP_URL**，再执行上面两条。

---

## 常用命令

在 `docker-compose.yml` 所在目录执行：

```shell
docker compose ps              # 查看容器
docker compose logs -f         # 全部日志
docker compose logs -f snowind # 仅应用
docker compose restart          # 重启
docker compose down             # 停止（数据卷保留，数据还在）
docker compose down -v          # 停止并删除数据（不可恢复，慎用）
```

---

## 下载到的 docker-compose.yml 只有 404

仓库曾是私有时，未登录访问 `raw.githubusercontent.com` 会返回正文 `404: Not Found`，PowerShell 会把它保存成文件。请删掉后用上面带 `-fL` 的命令重下（仓库现已公开）。也可浏览器打开 [v0.1.1 发行页](https://github.com/snowy-storm/SnoWind/releases/tag/v0.1.1) 下载 `docker-compose.yml`。

---

## 镜像拉取失败时

应用镜像在 GitHub Container Registry：`ghcr.io/snowy-storm/snowind:0.1.1`。

若提示 unauthorized / not found，到仓库的 **Packages** 将 `snowind` 包可见性设为 **Public**，或等待该版本的 GitHub Actions 构建完成。

从本仓库源码自行构建（开发者）：

```shell
docker build -t ghcr.io/snowy-storm/snowind:0.1.1 .
```

中国大陆构建可将 Dockerfile 中的 npm 源换成 npmmirror（见 Dockerfile 的 `NPM_REGISTRY` 参数）。

---

## 本地研发（可选）

与「只跑 compose」的正式安装分开：研发用 `pnpm` + `docker-compose.dev.yml`，端口不冲突。

```shell
pnpm infra:up
cp .env.dev.example .env.dev
pnpm db:migrate
pnpm dev
```

研发：前端 `5173`、后端 `3010`、OnlyOffice `8088`。`pnpm infra:down` 只停研发栈。

---

## 许可证

SnoWind 核心以开源 **AGPL 3.0** 授权。企业功能见企业许可（Enterprise Edition）。

以下目录按 `packages/ee/License` 中的 SnoWind Enterprise 许可：

- `apps/server/src/ee`
- `apps/client/src/ee`
- `packages/ee`
