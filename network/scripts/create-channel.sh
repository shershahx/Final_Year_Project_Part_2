#!/bin/bash

# This script assumes it is run from the 'network' directory
set -e

export PATH=/home/talha/bin:$PATH
export FABRIC_CFG_PATH="${PWD}/configtx"

CHANNEL_NAME="hec-channel"
ORDERER_CA="${PWD}/organizations/ordererOrganizations/hec.edu.pk/tlsca/tlsca.hec.edu.pk-cert.pem"
ORDERER_ADMIN_TLS_SIGN_CERT="${PWD}/organizations/ordererOrganizations/hec.edu.pk/orderers/orderer.hec.edu.pk/tls/server.crt"
ORDERER_ADMIN_TLS_PRIVATE_KEY="${PWD}/organizations/ordererOrganizations/hec.edu.pk/orderers/orderer.hec.edu.pk/tls/server.key"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ──────────────────────────────────────────
# Set HEC peer environment
# ──────────────────────────────────────────
setHECEnv() {
    export CORE_PEER_TLS_ENABLED=true
    export CORE_PEER_LOCALMSPID="HECMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE="${PWD}/organizations/peerOrganizations/hec.edu.pk/peers/peer0.hec.edu.pk/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="${PWD}/organizations/peerOrganizations/hec.edu.pk/users/Admin@hec.edu.pk/msp"
    export CORE_PEER_ADDRESS="localhost:7051"
}

# ──────────────────────────────────────────
# Set University peer environment
# ──────────────────────────────────────────
setUniversityEnv() {
    export CORE_PEER_TLS_ENABLED=true
    export CORE_PEER_LOCALMSPID="UniversityMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE="${PWD}/organizations/peerOrganizations/university.edu.pk/peers/peer0.university.edu.pk/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="${PWD}/organizations/peerOrganizations/university.edu.pk/users/Admin@university.edu.pk/msp"
    export CORE_PEER_ADDRESS="localhost:9051"
}

# ──────────────────────────────────────────
# Step 1: Generate genesis block with configtxgen
# ──────────────────────────────────────────
echo -e "${YELLOW}Generating channel genesis block...${NC}"

ARTIFACTS="${PWD}/channel-artifacts"
mkdir -p "$ARTIFACTS"

configtxgen -profile HECUniversityGenesis \
    -outputBlock "${ARTIFACTS}/${CHANNEL_NAME}.block" \
    -channelID "${CHANNEL_NAME}"

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to generate channel genesis block${NC}"
    exit 1
fi
echo -e "${GREEN}Genesis block created: ${ARTIFACTS}/${CHANNEL_NAME}.block${NC}"

# ──────────────────────────────────────────
# Step 2: Join orderer to channel via osnadmin
# ──────────────────────────────────────────
echo -e "${YELLOW}Joining orderer to channel via osnadmin...${NC}"

osnadmin channel join \
    --channelID "${CHANNEL_NAME}" \
    --config-block "${ARTIFACTS}/${CHANNEL_NAME}.block" \
    -o localhost:7053 \
    --ca-file "${ORDERER_CA}" \
    --client-cert "${ORDERER_ADMIN_TLS_SIGN_CERT}" \
    --client-key "${ORDERER_ADMIN_TLS_PRIVATE_KEY}"

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to join orderer to channel${NC}"
    exit 1
fi
echo -e "${GREEN}Orderer joined channel${NC}"

sleep 2

# ──────────────────────────────────────────
# Step 3: Join HEC peer to channel
# ──────────────────────────────────────────
echo -e "${YELLOW}Joining HEC peer to channel...${NC}"
setHECEnv

peer channel join -b "${ARTIFACTS}/${CHANNEL_NAME}.block"
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to join HEC peer to channel${NC}"
    exit 1
fi
echo -e "${GREEN}HEC peer joined channel${NC}"

sleep 2

# ──────────────────────────────────────────
# Step 4: Join University peer to channel
# ──────────────────────────────────────────
echo -e "${YELLOW}Joining University peer to channel...${NC}"
setUniversityEnv

peer channel join -b "${ARTIFACTS}/${CHANNEL_NAME}.block"
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to join University peer to channel${NC}"
    exit 1
fi
echo -e "${GREEN}University peer joined channel${NC}"

sleep 2

# ──────────────────────────────────────────
# Anchor peers are already defined in configtx.yaml
# and included in the genesis block, so no separate
# anchor peer update transaction is needed.
# ──────────────────────────────────────────
echo -e "${GREEN}Anchor peers already configured in genesis block${NC}"

echo -e "${GREEN}Channel '${CHANNEL_NAME}' created and both peers joined successfully!${NC}"
