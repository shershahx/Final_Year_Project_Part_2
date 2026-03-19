#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the project root directory
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo -e "${GREEN}========================================================${NC}"
echo -e "${GREEN}   Starting HEC E-Attestation Project                  ${NC}"
echo -e "${GREEN}========================================================${NC}"
echo ""

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if a port is in use
port_in_use() {
    lsof -i :$1 >/dev/null 2>&1
}

# Function to wait for a service to be ready
wait_for_service() {
    local url=$1
    local service_name=$2
    local max_attempts=30
    local attempt=0
    
    echo -e "${YELLOW}Waiting for $service_name to be ready...${NC}"
    while [ $attempt -lt $max_attempts ]; do
        if curl -s "$url" >/dev/null 2>&1; then
            echo -e "${GREEN}$service_name is ready!${NC}"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 2
    done
    echo -e "${RED}$service_name failed to start!${NC}"
    return 1
}

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"
MISSING_DEPS=false

if ! command_exists docker; then
    echo -e "${RED}✗ Docker is not installed${NC}"
    MISSING_DEPS=true
else
    echo -e "${GREEN}✓ Docker is installed${NC}"
fi

if ! command_exists docker-compose; then
    echo -e "${RED}✗ Docker Compose is not installed${NC}"
    MISSING_DEPS=true
else
    echo -e "${GREEN}✓ Docker Compose is installed${NC}"
fi

if ! command_exists node; then
    echo -e "${RED}✗ Node.js is not installed${NC}"
    MISSING_DEPS=true
else
    echo -e "${GREEN}✓ Node.js is installed ($(node -v))${NC}"
fi

if ! command_exists npm; then
    echo -e "${RED}✗ npm is not installed${NC}"
    MISSING_DEPS=true
else
    echo -e "${GREEN}✓ npm is installed ($(npm -v))${NC}"
fi

if [ "$MISSING_DEPS" = true ]; then
    echo -e "${RED}Please install missing dependencies before continuing.${NC}"
    exit 1
fi

echo ""

# Step 1: Start IPFS
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 1: Starting IPFS...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Check if IPFS is already running
if port_in_use 5001; then
    echo -e "${YELLOW}IPFS is already running on port 5001${NC}"
else
    if command_exists ipfs; then
        # Start IPFS daemon in background
        nohup ipfs daemon > "$PROJECT_DIR/ipfs.log" 2>&1 &
        IPFS_PID=$!
        echo $IPFS_PID > "$PROJECT_DIR/ipfs.pid"
        echo -e "${GREEN}IPFS daemon started (PID: $IPFS_PID)${NC}"
        sleep 3
        
        # Verify IPFS is running
        if wait_for_service "http://localhost:5001/api/v0/version" "IPFS"; then
            echo -e "${GREEN}✓ IPFS is running successfully${NC}"
        else
            echo -e "${RED}✗ Failed to start IPFS${NC}"
            echo -e "${YELLOW}Check ipfs.log for details${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ IPFS is not installed. Please install IPFS from https://ipfs.io/${NC}"
        echo -e "${YELLOW}  The project will continue but IPFS functionality will not be available.${NC}"
    fi
fi

echo ""

# Step 2: Start Hyperledger Fabric Network
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 2: Starting Hyperledger Fabric Network...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

cd "$PROJECT_DIR/network"
if [ -f "./start-network.sh" ]; then
    bash ./start-network.sh
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Blockchain network started successfully${NC}"
    else
        echo -e "${RED}✗ Failed to start blockchain network${NC}"
        exit 1
    fi
else
    echo -e "${RED}✗ start-network.sh not found in network directory${NC}"
    exit 1
fi

echo ""

# Step 3: Install Backend Dependencies and Start Backend Server
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 3: Starting Backend Server...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

cd "$PROJECT_DIR/backend"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing backend dependencies...${NC}"
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}✗ Failed to install backend dependencies${NC}"
        exit 1
    fi
fi

# Start backend server in background
echo -e "${YELLOW}Starting backend server...${NC}"
nohup npm start > "$PROJECT_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > "$PROJECT_DIR/backend.pid"
echo -e "${GREEN}Backend server starting (PID: $BACKEND_PID)${NC}"

# Wait for backend to be ready
sleep 5
if wait_for_service "http://localhost:5000" "Backend API"; then
    echo -e "${GREEN}✓ Backend server is running on http://localhost:5000${NC}"
else
    echo -e "${YELLOW}⚠ Backend server may still be starting. Check backend.log for details${NC}"
fi

echo ""

# Step 4: Install Frontend Dependencies and Start Frontend
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 4: Starting Frontend Application...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

cd "$PROJECT_DIR/frontend"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing frontend dependencies...${NC}"
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}✗ Failed to install frontend dependencies${NC}"
        exit 1
    fi
fi

# Start frontend in background
echo -e "${YELLOW}Starting frontend application...${NC}"
nohup npm start > "$PROJECT_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > "$PROJECT_DIR/frontend.pid"
echo -e "${GREEN}Frontend application starting (PID: $FRONTEND_PID)${NC}"

# Wait for frontend to be ready
sleep 10
if wait_for_service "http://localhost:3000" "Frontend"; then
    echo -e "${GREEN}✓ Frontend is running on http://localhost:3000${NC}"
else
    echo -e "${YELLOW}⚠ Frontend may still be starting. Check frontend.log for details${NC}"
fi

echo ""
echo -e "${GREEN}========================================================${NC}"
echo -e "${GREEN}   Project Started Successfully!                       ${NC}"
echo -e "${GREEN}========================================================${NC}"
echo ""
echo -e "${BLUE}Services running:${NC}"
echo -e "  📦 IPFS:              http://localhost:5001"
echo -e "  ⛓️  Blockchain Network: Running (Hyperledger Fabric)"
echo -e "  🔧 Backend API:       http://localhost:5000"
echo -e "  🌐 Frontend:          http://localhost:3000"
echo ""
echo -e "${YELLOW}Process IDs:${NC}"
[ -f "$PROJECT_DIR/ipfs.pid" ] && echo -e "  IPFS PID:     $(cat "$PROJECT_DIR/ipfs.pid")"
[ -f "$PROJECT_DIR/backend.pid" ] && echo -e "  Backend PID:  $(cat "$PROJECT_DIR/backend.pid")"
[ -f "$PROJECT_DIR/frontend.pid" ] && echo -e "  Frontend PID: $(cat "$PROJECT_DIR/frontend.pid")"
echo ""
echo -e "${YELLOW}Logs:${NC}"
echo -e "  IPFS:     $PROJECT_DIR/ipfs.log"
echo -e "  Backend:  $PROJECT_DIR/backend.log"
echo -e "  Frontend: $PROJECT_DIR/frontend.log"
echo ""
echo -e "${BLUE}To stop all services, run: ./stop-project.sh${NC}"
echo -e "${GREEN}========================================================${NC}"
