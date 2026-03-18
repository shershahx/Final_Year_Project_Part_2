#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}   Starting HEC-University Blockchain Network   ${NC}"
echo -e "${GREEN}================================================${NC}"

# Navigate to network directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Export environment variables
export FABRIC_CFG_PATH=${PWD}/configtx
export PATH=/home/talha/bin:${PWD}/../bin:$PATH

# Function to clean up previous network
function networkDown() {
    echo -e "${YELLOW}Stopping previous network...${NC}"
    docker-compose -f ./docker/docker-compose-network.yaml -f ./docker/docker-compose-ca.yaml down --volumes --remove-orphans
    
    # Remove chaincode containers
    docker rm -f $(docker ps -aq --filter label=org.hyperledger.fabric.chaincode) 2>/dev/null || true
    
    # Remove chaincode images
    docker rmi -f $(docker images -aq --filter reference='dev-peer*') 2>/dev/null || true
    
    # Clean up organizations folder (keep fabric-ca)
    rm -rf organizations/peerOrganizations
    rm -rf organizations/ordererOrganizations
    
    # Clean up channel artifacts
    rm -rf channel-artifacts/*
    
    echo -e "${GREEN}Network cleaned up!${NC}"
}

# Function to start CAs
function startCAs() {
    echo -e "${YELLOW}Starting Certificate Authorities...${NC}"
    docker-compose -f ./docker/docker-compose-ca.yaml up -d
    sleep 5
    echo -e "${GREEN}CAs started!${NC}"
}

# Function to generate crypto materials
function generateCrypto() {
    echo -e "${YELLOW}Generating crypto materials...${NC}"
    cd scripts
    chmod +x generate-crypto.sh
    ./generate-crypto.sh
    cd ..
    echo -e "${GREEN}Crypto materials generated!${NC}"
}

# Function to start the network
function networkUp() {
    echo -e "${YELLOW}Starting network containers...${NC}"
    docker-compose -f ./docker/docker-compose-network.yaml up -d
    sleep 10
    echo -e "${GREEN}Network containers started!${NC}"
}

# Function to create channel
function createChannel() {
    echo -e "${YELLOW}Creating channel...${NC}"
    chmod +x scripts/create-channel.sh
    ./scripts/create-channel.sh
    echo -e "${GREEN}Channel created!${NC}"
}

# Function to deploy chaincode
function deployChaincode() {
    echo -e "${YELLOW}Deploying chaincode...${NC}"
    chmod +x scripts/deploy-chaincode.sh
    ./scripts/deploy-chaincode.sh
    echo -e "${GREEN}Chaincode deployed!${NC}"
}

# Main execution
networkDown
startCAs
generateCrypto
networkUp
createChannel
deployChaincode

echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}   HEC-University Network Started Successfully!  ${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo -e "${YELLOW}Services Running:${NC}"
echo "  - Orderer: localhost:7050"
echo "  - HEC Peer: localhost:7051"
echo "  - University Peer: localhost:9051"
echo "  - CouchDB (HEC): http://localhost:5984"
echo "  - CouchDB (University): http://localhost:7984"
echo ""
echo -e "${GREEN}Start the backend server: cd ../backend && npm start${NC}"
