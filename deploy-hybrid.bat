@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================
echo   SnoWind Docker 混合部署管理脚本
echo   统一密码: 12345678
echo ========================================
echo.

:MENU
echo 请选择操作:
echo   [1] 构建并启动所有服务 (首次部署)
echo   [2] 仅启动已构建的服务
echo   [3] 停止所有服务
echo   [4] 重启所有服务
echo   [5] 查看服务状态
echo   [6] 查看应用日志
echo   [7] 清理数据并重置 (警告: 删除所有数据!)
echo   [0] 退出
echo.
set /p choice=请输入选项编号: 

if "%choice%"=="1" goto BUILD_START
if "%choice%"=="2" goto START
if "%choice%"=="3" goto STOP
if "%choice%"=="4" goto RESTART
if "%choice%"=="5" goto STATUS
if "%choice%"=="6" goto LOGS
if "%choice%"=="7" goto CLEAN
if "%choice%"=="0" goto END
goto MENU

:BUILD_START
echo.
echo [1/3] 停止旧服务...
docker compose -f docker-compose.hybrid.yml down
echo.
echo [2/3] 构建镜像并启动服务 (首次构建需要较长时间)...
docker compose -f docker-compose.hybrid.yml up -d --build
echo.
echo [3/3] 等待服务就绪...
timeout /t 5 /nobreak >nul
goto STATUS

:START
echo.
echo 启动所有服务...
docker compose -f docker-compose.hybrid.yml up -d
timeout /t 3 /nobreak >nul
goto STATUS

:STOP
echo.
echo 停止所有服务...
docker compose -f docker-compose.hybrid.yml down
echo 服务已停止。
goto END

:RESTART
echo.
echo 重启所有服务...
docker compose -f docker-compose.hybrid.yml restart
timeout /t 3 /nobreak >nul
goto STATUS

:STATUS
echo.
echo ========================================
echo   服务状态
echo ========================================
docker compose -f docker-compose.hybrid.yml ps
echo.
echo ========================================
echo   访问地址
echo ========================================
echo   SnoWind 应用:    http://localhost:3000
echo   PostgreSQL:      localhost:5432
echo   Redis:           localhost:6379
echo   MailHog Web:     http://localhost:8025
echo   MailHog SMTP:    localhost:1025
echo.
echo ========================================
echo   账号密码 (统一: 12345678)
echo ========================================
echo   PostgreSQL 用户名: snowind / 密码: 12345678
echo   Redis 密码:        12345678
echo   应用首次登录需注册管理员账号
echo.
goto MENU

:LOGS
echo.
echo 查看应用日志 (Ctrl+C 退出)...
docker compose -f docker-compose.hybrid.yml logs -f --tail=100 snowind
goto MENU

:CLEAN
echo.
echo 警告: 此操作将删除所有数据卷和容器！
set /p confirm=输入 YES 确认清理: 
if "%confirm%"=="YES" (
    echo 停止并删除容器...
    docker compose -f docker-compose.hybrid.yml down -v
    echo 删除镜像...
    docker rmi snowind-hybrid:local 2>nul
    echo 清理完成。
) else (
    echo 已取消清理。
)
goto MENU

:END
echo.
echo 再见！
endlocal
