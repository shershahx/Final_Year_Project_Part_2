#!/bin/bash

# This script assumes it is run from the 'network' directory
set -e

export PATH=/home/talha/bin:$PATH
export FABRIC_CFG_PATH="${PWD}/configtx"

CHANNEL_NAME="hec-channel"
CC_NAME="hec-university"
CC_SRC_PATH="${PWD}/../chaincode"
CC_SRC_LANGUAGE="node"
CC_VERSION="1.0"
CC_SEQUENCE="1"
ORDERER_CA="${PWD}/organizations/ordererOrganizations/hec.edu.pk/tlsca/tlsca.hec.edu.pk-cert.pem"
ORDERER_ADDRESS="localhost:7050"

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
    export ORDERER_CA="${PWD}/organizations/ordererOrganizations/hec.edu.pk/tlsca/tlsca.hec.edu.pk-cert.pem"
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
    export ORDERER_CA="${PWD}/organizations/ordererOrganizations/hec.edu.pk/tlsca/tlsca.hec.edu.pk-cert.pem"
}

# ──────────────────────────────────────────
# Package Chaincode
# ──────────────────────────────────────────
echo -e "${YELLOW}Step 1: Packaging chaincode...${NC}"
mkdir -p packages
pushd "${CC_SRC_PATH}"
npm install
popd

# Package chaincode
rm -f "packages/${CC_NAME}.tar.gz"
peer lifecycle chaincode package "packages/${CC_NAME}.tar.gz" \
    --path "${CC_SRC_PATH}" \
    --lang "${CC_SRC_LANGUAGE}" \
    --label "${CC_NAME}_${CC_VERSION}"

echo -e "${GREEN}Chaincode packaged successfully!${NC}"

# ──────────────────────────────────────────
# Install Chaincode on HEC Peer
# ──────────────────────────────────────────
echo -e "${YELLOW}Step 2: Installing chaincode on HEC peer...${NC}"
setHECEnv
peer lifecycle chaincode install "packages/${CC_NAME}.tar.gz"
echo -e "${GREEN}Chaincode installed on HEC peer!${NC}"

# ──────────────────────────────────────────
# Install Chaincode on University Peer
# ──────────────────────────────────────────
echo -e "${YELLOW}Step 3: Installing chaincode on University peer...${NC}"
setUniversityEnv
peer lifecycle chaincode install "packages/${CC_NAME}.tar.gz"
echo -e "${GREEN}Chaincode installed on University peer!${NC}"

# ──────────────────────────────────────────
# Query installed chaincode to get Package ID
# ──────────────────────────────────────────
echo -e "${YELLOW}Querying installed chaincode on HEC peer...${NC}"
setHECEnv
peer lifecycle chaincode queryinstalled >&log.txt
CC_PACKAGE_ID=$(sed -n "/${CC_NAME}_${CC_VERSION}/{s/^Package ID: //; s/, Label:.*$//; p;}" log.txt)
echo -e "Package ID is ${CC_PACKAGE_ID}"
rm log.txt

# ──────────────────────────────────────────
# Approve Chaincode for HEC
# ──────────────────────────────────────────
echo -e "${YELLOW}Step 4: Approving chaincode for HEC...${NC}"
setHECEnv
peer lifecycle chaincode approveformyorg \
    -o "${ORDERER_ADDRESS}" \
    --ordererTLSHostnameOverride orderer.hec.edu.pk \
    --channelID "${CHANNEL_NAME}" \
    --name "${CC_NAME}" \
    --version "${CC_VERSION}" \
    --package-id "${CC_PACKAGE_ID}" \
    --sequence "${CC_SEQUENCE}" \
    --tls \
    --cafile "${ORDERER_CA}"

echo -e "${GREEN}Chaincode approved for HEC!${NC}"

sleep 2

# ──────────────────────────────────────────
# Approve Chaincode for University
# ──────────────────────────────────────────
echo -e "${YELLOW}Step 5: Approving chaincode for University...${NC}"
setUniversityEnv
peer lifecycle chaincode approveformyorg \
    -o "${ORDERER_ADDRESS}" \
    --ordererTLSHostnameOverride orderer.hec.edu.pk \
    --channelID "${CHANNEL_NAME}" \
    --name "${CC_NAME}" \
    --version "${CC_VERSION}" \
    --package-id "${CC_PACKAGE_ID}" \
    --sequence "${CC_SEQUENCE}" \
    --tls \
    --cafile "${ORDERER_CA}"

echo -e "${GREEN}Chaincode approved for University!${NC}"

sleep 2

# ──────────────────────────────────────────
# Check Commit Readiness
# ──────────────────────────────────────────
echo -e "${YELLOW}Checking commit readiness...${NC}"
setHECEnv
peer lifecycle chaincode checkcommitreadiness \
    --channelID "${CHANNEL_NAME}" \
    --name "${CC_NAME}" \
    --version "${CC_VERSION}" \
    --sequence "${CC_SEQUENCE}" \
    --tls \
    --cafile "${ORDERER_CA}" \
    --output json

# ──────────────────────────────────────────
# Commit Chaincode Definition
# ──────────────────────────────────────────
echo -e "${YELLOW}Step 6: Committing chaincode definition to channel...${NC}"
peer lifecycle chaincode commit \
    -o "${ORDERER_ADDRESS}" \
    --ordererTLSHostnameOverride orderer.hec.edu.pk \
    --channelID "${CHANNEL_NAME}" \
    --name "${CC_NAME}" \
    --version "${CC_VERSION}" \
    --sequence "${CC_SEQUENCE}" \
    --tls \
    --cafile "${ORDERER_CA}" \
    --peerAddresses localhost:7051 \
    --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/hec.edu.pk/peers/peer0.hec.edu.pk/tls/ca.crt" \
    --peerAddresses localhost:9051 \
    --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/university.edu.pk/peers/peer0.university.edu.pk/tls/ca.crt"

echo -e "${GREEN}Chaincode definition committed on channel ${CHANNEL_NAME}!${NC}"

sleep 2

echo -e "${GREEN}===============================================${NC}"
echo -e "${GREEN}Chaincode deployment complete!${NC}"
echo -e "${GREEN}===============================================${NC}"
