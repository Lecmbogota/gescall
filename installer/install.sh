#!/bin/bash

# Visual styling
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}==============================================${NC}"
echo -e "${BLUE}       Gescall Unified Installer v1.0         ${NC}"
echo -e "${BLUE}==============================================${NC}"

# 1. System Check
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root${NC}"
  exit 1
fi

INSTALL_DIR="/opt/gescall"
BACKEND_PORT=3001
PUBLIC_API_PORT=3002
DOMAIN_NAME="localhost"

# 2. Dependencies
echo -e "${GREEN}[1/5] Installing Dependencies...${NC}"
apt-get update
apt-get install -y curl wget git python3 build-essential nginx ffmpeg sox

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
fi
echo "Node.js version: $(node -v)"

# Install PM2
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    npm install -g pm2
fi

# 3. Piper TTS
echo -e "${GREEN}[2/5] Setting up Piper TTS...${NC}"
bash installer/setup_piper.sh

# 4. Project Setup
echo -e "${GREEN}[3/5] Setting up Gescall Project...${NC}"

# Backend
echo "Configuring Backend..."
cd "$INSTALL_DIR/back"
npm install

if [ ! -f .env ]; then
    echo "Creating .env for Backend..."
    cp .env.example .env
    
    echo -e "${BLUE}Please configure Vicidial Connection:${NC}"
    read -p "Vicidial SSH Host (IP): " VICI_HOST
    read -p "Vicidial SSH User: " VICI_USER
    read -s -p "Vicidial SSH Password: " VICI_PASS
    echo ""
    read -p "Vicidial DB Host (IP): " VICI_DB_HOST
    read -p "Vicidial DB User: " VICI_DB_USER
    read -s -p "Vicidial DB Password: " VICI_DB_PASS
    echo ""
    
    # Update .env using sed
    sed -i "s/SSH_HOST=.*/SSH_HOST=$VICI_HOST/" .env
    sed -i "s/SSH_USER=.*/SSH_USER=$VICI_USER/" .env
    sed -i "s/SSH_PASSWORD=.*/SSH_PASSWORD=$VICI_PASS/" .env
    sed -i "s/DB_HOST=.*/DB_HOST=$VICI_DB_HOST/" .env
    sed -i "s/DB_USER=.*/DB_USER=$VICI_DB_USER/" .env
    sed -i "s/DB_PASSWORD=.*/DB_PASSWORD=$VICI_DB_PASS/" .env
    sed -i "s/PORT=.*/PORT=$BACKEND_PORT/" .env
fi

# Frontend
echo "Configuring Frontend..."
cd "$INSTALL_DIR/front"
npm install
echo "Building Frontend..."
npm run build

# 5. Deployment
echo -e "${GREEN}[4/5] Deploying...${NC}"

# Nginx
echo "Configuring Nginx..."
export DOMAIN_NAME
export INSTALL_DIR
export BACKEND_PORT
export PUBLIC_API_PORT
envsubst '${DOMAIN_NAME} ${INSTALL_DIR} ${BACKEND_PORT} ${PUBLIC_API_PORT}' < "$INSTALL_DIR/installer/nginx.conf.template" > /etc/nginx/sites-available/gescall
ln -sf /etc/nginx/sites-available/gescall /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
service nginx restart

# PM2
echo "Starting Backend with PM2..."
cd "$INSTALL_DIR/back"
pm2 start server.js --name "gescall-backend"
pm2 save
pm2 startup | bash

# 6. GesCall nativo = ARI (sin AGI Vicidial)
echo -e "${GREEN}[5/5] GesCall (ARI/Stasis)${NC}"
echo "IVR y control de canal: backend Node (ariService.js, app gescall-ivr). No se despliegan AGIs Vicidial desde este instalador."

echo -e "${BLUE}==============================================${NC}"
echo -e "${GREEN}       Installation Complete!         ${NC}"
echo -e "${BLUE}==============================================${NC}"
echo -e "Frontend: http://$DOMAIN_NAME"
echo -e "Backend:  http://$DOMAIN_NAME/api"
