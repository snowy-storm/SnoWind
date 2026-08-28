#!/bin/bash

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

COMPOSE_FILE="docker-compose.hybrid.yml"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  SnoWind Docker 混合部署管理脚本${NC}"
echo -e "${BLUE}  统一密码: 12345678${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

show_menu() {
    echo "请选择操作:"
    echo "  [1] 构建并启动所有服务 (首次部署)"
    echo "  [2] 仅启动已构建的服务"
    echo "  [3] 停止所有服务"
    echo "  [4] 重启所有服务"
    echo "  [5] 查看服务状态"
    echo "  [6] 查看应用日志"
    echo "  [7] 清理数据并重置 (警告: 删除所有数据!)"
    echo "  [0] 退出"
    echo ""
    read -p "请输入选项编号: " choice
}

show_status() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  服务状态${NC}"
    echo -e "${BLUE}========================================${NC}"
    docker compose -f "$COMPOSE_FILE" ps
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  访问地址${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo -e "  ${GREEN}SnoWind 应用:${NC}    http://localhost:3000"
    echo -e "  ${GREEN}PostgreSQL:${NC}      localhost:5432"
    echo -e "  ${GREEN}Redis:${NC}           localhost:6379"
    echo -e "  ${GREEN}MailHog Web:${NC}     http://localhost:8025"
    echo -e "  ${GREEN}MailHog SMTP:${NC}    localhost:1025"
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  账号密码 (统一: 12345678)${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo -e "  PostgreSQL 用户名: ${YELLOW}snowind${NC} / 密码: ${YELLOW}12345678${NC}"
    echo -e "  Redis 密码:        ${YELLOW}12345678${NC}"
    echo -e "  应用首次登录需注册管理员账号"
    echo ""
}

while true; do
    show_menu
    case $choice in
        1)
            echo ""
            echo -e "${YELLOW}[1/3] 停止旧服务...${NC}"
            docker compose -f "$COMPOSE_FILE" down
            echo ""
            echo -e "${YELLOW}[2/3] 构建镜像并启动服务 (首次构建需要较长时间)...${NC}"
            docker compose -f "$COMPOSE_FILE" up -d --build
            echo ""
            echo -e "${YELLOW}[3/3] 等待服务就绪...${NC}"
            sleep 5
            show_status
            ;;
        2)
            echo ""
            echo -e "${YELLOW}启动所有服务...${NC}"
            docker compose -f "$COMPOSE_FILE" up -d
            sleep 3
            show_status
            ;;
        3)
            echo ""
            echo -e "${YELLOW}停止所有服务...${NC}"
            docker compose -f "$COMPOSE_FILE" down
            echo -e "${GREEN}服务已停止。${NC}"
            ;;
        4)
            echo ""
            echo -e "${YELLOW}重启所有服务...${NC}"
            docker compose -f "$COMPOSE_FILE" restart
            sleep 3
            show_status
            ;;
        5)
            show_status
            ;;
        6)
            echo ""
            echo -e "${YELLOW}查看应用日志 (Ctrl+C 退出)...${NC}"
            docker compose -f "$COMPOSE_FILE" logs -f --tail=100 snowind
            ;;
        7)
            echo ""
            echo -e "${RED}警告: 此操作将删除所有数据卷和容器！${NC}"
            read -p "输入 YES 确认清理: " confirm
            if [ "$confirm" = "YES" ]; then
                echo -e "${YELLOW}停止并删除容器...${NC}"
                docker compose -f "$COMPOSE_FILE" down -v
                echo -e "${YELLOW}删除镜像...${NC}"
                docker rmi snowind-hybrid:local 2>/dev/null || true
                echo -e "${GREEN}清理完成。${NC}"
            else
                echo -e "${YELLOW}已取消清理。${NC}"
            fi
            ;;
        0)
            echo ""
            echo -e "${GREEN}再见！${NC}"
            exit 0
            ;;
        *)
            echo ""
            echo -e "${RED}无效选项，请重新选择。${NC}"
            ;;
    esac
    echo ""
done
