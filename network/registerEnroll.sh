
#!/bin/bash

# This script generates all the identities for your network based on your diagram 
# This version is robust and fixes all previous authentication errors.

# ---
# 1. SET UP THE ENVIRONMENT
# ---
export FABRIC_SAMPLES_DIR="/home/shershah/hyperledger/fabric-samples"
export PATH="${FABRIC_SAMPLES_DIR}/bin:$PATH"

# This is the *default* client home, but we will override it
# for each admin enrollment to prevent them from overwriting each other.
export FABRIC_CA_CLIENT_HOME=${PWD}/organizations

# ---
# 2. DEFINE ADMIN MSP DIRECTORIES
# ---
# We will store each CA Admin's identity in a *separate* directory.
# This is the fix that solves the "Authentication failure" errors.

export HEC_CA_ADMIN_DIR=${PWD}/organizations/hec-ca-admin
export UNI_CA_ADMIN_DIR=${PWD}/organizations/university-ca-admin
export TLS_CA_ADMIN_DIR=${PWD}/organizations/tls-ca-admin

echo "--- Starting Identity Generation (v3) ---"

# ---
# 3. ENROLL ALL CA ADMINS (Into their unique directories)
# ---
echo "Enrolling the HEC CA Admin..."
fabric-ca-client enroll -u https://hec-admin:hec-adminpw@localhost:7054 --caname ca-hec --tls.certfiles ${PWD}/organizations/fabric-ca-server/hec/ca-cert.pem --mspdir $HEC_CA_ADMIN_DIR

echo "Enrolling the University CA Admin..."
fabric-ca-client enroll -u https://university-admin:university-adminpw@localhost:8054 --caname ca-university --tls.certfiles ${PWD}/organizations/fabric-ca-server/university/ca-cert.pem --mspdir $UNI_CA_ADMIN_DIR

echo "Enrolling the TLS CA Admin..."
fabric-ca-client enroll -u https://tls-admin:tls-adminpw@localhost:9054 --caname ca-tls --tls.certfiles ${PWD}/organizations/fabric-ca-server/tls/ca-cert.pem --mspdir $TLS_CA_ADMIN_DIR

echo "--- All CA Admins Enrolled. Now registering nodes and users. ---"

# ---
# 4. REGISTER HEC COMPONENTS (Using HEC Admin Identity)
# ---
echo "Registering HEC Orderer..."
fabric-ca-client register --caname ca-hec --id.name hec-orderer --id.secret ordererpw --id.type orderer \
  -u https://localhost:7054 --tls.certfiles ${PWD}/organizations/fabric-ca-server/hec/ca-cert.pem \
  --mspdir $HEC_CA_ADMIN_DIR

echo "Registering HEC Admin User..."
fabric-ca-client register --caname ca-hec --id.name hec-admin-user --id.secret adminpw --id.type admin \
  -u https://localhost:7054 --tls.certfiles ${PWD}/organizations/fabric-ca-server/hec/ca-cert.pem \
  --mspdir $HEC_CA_ADMIN_DIR

# ---
# 5. REGISTER UNIVERSITY COMPONENTS (Using University Admin Identity)
# ---
echo "Registering University Peer 1..."
fabric-ca-client register --caname ca-university --id.name university-peer1 --id.secret peer1pw --id.type peer \
  -u https://localhost:8054 --tls.certfiles ${PWD}/organizations/fabric-ca-server/university/ca-cert.pem \
  --mspdir $UNI_CA_ADMIN_DIR

echo "Registering University Peer 2..."
fabric-ca-client register --caname ca-university --id.name university-peer2 --id.secret peer2pw --id.type peer \
  -u https://localhost:8054 --tls.certfiles ${PWD}/organizations/fabric-ca-server/university/ca-cert.pem \
  --mspdir $UNI_CA_ADMIN_DIR

echo "Registering University Admin User..."
fabric-ca-client register --caname ca-university --id.name university-admin-user --id.secret adminpw --id.type admin \
  -u https://localhost:8054 --tls.certfiles ${PWD}/organizations/fabric-ca-server/university/ca-cert.pem \
  --mspdir $UNI_CA_ADMIN_DIR

echo "--- All identities registered. Now generating MSP and TLS crypto. ---"

# ---
# 6. GENERATE HEC MSP & TLS CERTIFICATES
# ---
echo "Generating HEC Orderer MSP..."
fabric-ca-client enroll -u https://hec-orderer:ordererpw@localhost:7054 --caname ca-hec \
  -M ${PWD}/organizations/ordererOrganizations/hec.fyp.com/orderers/hec-orderer.hec.fyp.com/msp \
  --tls.certfiles ${PWD}/organizations/fabric-ca-server/hec/ca-cert.pem

echo "Generating HEC Orderer TLS Certificate..."
fabric-ca-client enroll -u https://hec-orderer:ordererpw@localhost:9054 --caname ca-tls \
  -M ${PWD}/organizations/ordererOrganizations/hec.fyp.com/orderers/hec-orderer.hec.fyp.com/tls \
  --enrollment.profile tls --csr.hosts hec-orderer.hec.fyp.com --csr.hosts localhost \
  --tls.certfiles ${PWD}/organizations/fabric-ca-server/tls/ca-cert.pem

echo "Generating HEC Admin User MSP..."
fabric-ca-client enroll -u https://hec-admin-user:adminpw@localhost:7054 --caname ca-hec \
  -M ${PWD}/organizations/ordererOrganizations/hec.fyp.com/users/Admin@hec.fyp.com/msp \
  --tls.certfiles ${PWD}/organizations/fabric-ca-server/hec/ca-cert.pem

# ---
# 7. GENERATE UNIVERSITY MSP & TLS CERTIFICATES
# ---
echo "Generating University Peer 1 MSP..."
fabric-ca-client enroll -u https://university-peer1:peer1pw@localhost:8054 --caname ca-university \
  -M ${PWD}/organizations/peerOrganizations/university.fyp.com/peers/university-peer1.university.fyp.com/msp \
  --tls.certfiles ${PWD}/organizations/fabric-ca-server/university/ca-cert.pem

echo "Generating University Peer 1 TLS Certificate..."
fabric-ca-client enroll -u https://university-peer1:peer1pw@localhost:9054 --caname ca-tls \
  -M ${PWD}/organizations/peerOrganizations/university.fyp.com/peers/university-peer1.university.fyp.com/tls \
  --enrollment.profile tls --csr.hosts university-peer1.university.fyp.com --csr.hosts localhost \
  --tls.certfiles ${PWD}/organizations/fabric-ca-server/tls/ca-cert.pem

echo "Generating University Peer 2 MSP..."
fabric-ca-client enroll -u https://university-peer2:peer2pw@localhost:8054 --caname ca-university \
  -M ${PWD}/organizations/peerOrganizations/university.fyp.com/peers/university-peer2.university.fyp.com/msp \
  --tls.certfiles ${PWD}/organizations/fabric-ca-server/university/ca-cert.pem

echo "Generating University Peer 2 TLS Certificate..."
fabric-ca-client enroll -u https://university-peer2:peer2pw@localhost:9054 --caname ca-tls \
  -M ${PWD}/organizations/peerOrganizations/university.fyp.com/peers/university-peer2.university.fyp.com/tls \
  --enrollment.profile tls --csr.hosts university-peer2.university.fyp.com --csr.hosts localhost \
  --tls.certfiles ${PWD}/organizations/fabric-ca-server/tls/ca-cert.pem

echo "Generating University Admin User MSP..."
fabric-ca-client enroll -u https://university-admin-user:adminpw@localhost:8054 --caname ca-university \
  -M ${PWD}/organizations/peerOrganizations/university.fyp.com/users/Admin@university.fyp.com/msp \
  --tls.certfiles ${PWD}/organizations/fabric-ca-server/university/ca-cert.pem


echo "--- All identities and certificates generated successfully. ---"
