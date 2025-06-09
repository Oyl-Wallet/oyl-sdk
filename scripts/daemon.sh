#!/bin/bash

# Auto Clock-In Daemon Management Script
# Provides commands to start, stop, restart, and monitor the auto-clock-in service

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="auto-clock-in"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/logs"

# Functions
show_usage() {
    echo -e "${BLUE}Auto Clock-In Daemon Management${NC}"
    echo -e "${BLUE}===============================${NC}"
    echo ""
    echo "Usage: $0 {start|stop|restart|status|logs|install-pm2}"
    echo ""
    echo "Commands:"
    echo "  start      - Start the auto-clock-in service in background"
    echo "  stop       - Stop the auto-clock-in service"
    echo "  restart    - Restart the auto-clock-in service"
    echo "  status     - Show service status and logs"
    echo "  logs       - Show live logs"
    echo "  install-pm2 - Install PM2 globally if not present"
    echo ""
}

check_requirements() {
    # Check if .env file exists
    if [ ! -f "$PROJECT_DIR/.env" ]; then
        echo -e "${RED}❌ Error: .env file not found${NC}"
        echo -e "${YELLOW}Please create a .env file with the required configuration${NC}"
        exit 1
    fi

    # Check if compiled JavaScript exists
    if [ ! -f "$PROJECT_DIR/lib/scripts/auto-clock-in.js" ]; then
        echo -e "${YELLOW}⚠️  Compiled JavaScript not found, building project...${NC}"
        cd "$PROJECT_DIR"
        npm run build
    fi

    # Create logs directory if it doesn't exist
    mkdir -p "$LOG_DIR"
}

check_pm2() {
    if ! command -v pm2 &> /dev/null; then
        echo -e "${RED}❌ PM2 not found. Installing PM2...${NC}"
        install_pm2
    fi
}

install_pm2() {
    echo -e "${BLUE}📦 Installing PM2 globally...${NC}"
    npm install -g pm2
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ PM2 installed successfully${NC}"
    else
        echo -e "${RED}❌ Failed to install PM2${NC}"
        exit 1
    fi
}

start_service() {
    echo -e "${BLUE}🚀 Starting Auto Clock-In Service...${NC}"
    
    check_requirements
    check_pm2
    
    cd "$PROJECT_DIR"
    
    # Check if already running
    if pm2 list | grep -q "$APP_NAME.*online"; then
        echo -e "${YELLOW}⚠️  Service is already running${NC}"
        pm2 show "$APP_NAME"
        return
    fi
    
    # Start with PM2
    pm2 start ecosystem.config.js
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Service started successfully${NC}"
        echo -e "${BLUE}📊 Service Status:${NC}"
        pm2 show "$APP_NAME"
        echo ""
        echo -e "${BLUE}📝 To view logs: $0 logs${NC}"
        echo -e "${BLUE}📊 To check status: $0 status${NC}"
    else
        echo -e "${RED}❌ Failed to start service${NC}"
        exit 1
    fi
}

stop_service() {
    echo -e "${BLUE}🛑 Stopping Auto Clock-In Service...${NC}"
    
    check_pm2
    
    pm2 stop "$APP_NAME" 2>/dev/null || true
    pm2 delete "$APP_NAME" 2>/dev/null || true
    
    echo -e "${GREEN}✅ Service stopped${NC}"
}

restart_service() {
    echo -e "${BLUE}🔄 Restarting Auto Clock-In Service...${NC}"
    
    check_pm2
    check_requirements
    
    cd "$PROJECT_DIR"
    
    pm2 restart "$APP_NAME" 2>/dev/null || {
        echo -e "${YELLOW}⚠️  Service not running, starting fresh...${NC}"
        start_service
        return
    }
    
    echo -e "${GREEN}✅ Service restarted${NC}"
    pm2 show "$APP_NAME"
}

show_status() {
    echo -e "${BLUE}📊 Auto Clock-In Service Status${NC}"
    echo -e "${BLUE}==============================${NC}"
    
    check_pm2
    
    if pm2 list | grep -q "$APP_NAME"; then
        pm2 show "$APP_NAME"
        echo ""
        echo -e "${BLUE}📈 Memory & CPU Usage:${NC}"
        pm2 monit --no-interactives | grep "$APP_NAME" || true
    else
        echo -e "${YELLOW}⚠️  Service is not running${NC}"
        echo -e "${BLUE}💡 Start with: $0 start${NC}"
    fi
}

show_logs() {
    echo -e "${BLUE}📝 Auto Clock-In Service Logs${NC}"
    echo -e "${BLUE}=============================${NC}"
    echo -e "${YELLOW}Press Ctrl+C to stop following logs${NC}"
    echo ""
    
    check_pm2
    
    if pm2 list | grep -q "$APP_NAME.*online"; then
        pm2 logs "$APP_NAME" --lines 50
    else
        echo -e "${YELLOW}⚠️  Service is not running${NC}"
        echo -e "${BLUE}💡 Start with: $0 start${NC}"
        
        # Show recent log files if they exist
        if [ -f "$LOG_DIR/auto-clock-in.log" ]; then
            echo ""
            echo -e "${BLUE}📄 Recent log file content:${NC}"
            tail -50 "$LOG_DIR/auto-clock-in.log"
        fi
    fi
}

# Main script logic
case "${1:-}" in
    start)
        start_service
        ;;
    stop)
        stop_service
        ;;
    restart)
        restart_service
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    install-pm2)
        install_pm2
        ;;
    *)
        show_usage
        exit 1
        ;;
esac