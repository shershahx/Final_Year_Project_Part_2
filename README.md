---
FYP - Degree Attestation Blockchain Project
README.md - Setup and Demo Guide
---
This guide provides all commands needed to run this project.
ASSUMPTIONS:
1. You are on a Linux-based terminal (like Ubuntu/WSL2).
2. You have installed all Hyperledger Fabric prerequisites (Docker, Docker Compose, Git, cURL).
3. You have cloned the fabric-samples repo and this FYP_Project repo into the same directory.
Example Directory Structure:
/home/shershah/hyperledger/
├── fabric-samples/
└── FYP_Project/
4. All commands in Phase 2 and beyond are run from the fabric-samples/test-network directory.
---
Phase 1: Install Chaincode Dependencies (Run ONCE)
---
You must run this from your chaincode directory to install the
necessary npm packages before deploying.
cd /home/shershah/hyperledger/FYP_Project/chaincode-javascript npm install fabric-contract-api npm install fabric-shim

---
Phase 2: Start the Fabric Network
---
Now, move to the test-network directory to run the rest of the project.
cd /home/shershah/hyperledger/fabric-samples/test-network

This command starts all the Docker containers (peers, orderers)
and creates a channel named "mychannel".
./network.sh up createChannel

---
Phase 3: Deploy the Smart Contract
---
This command deploys your chaincode. We use v1.1 and sequence 2
to ensure it's a fresh deployment with the new dependencies.
./network.sh deployCC -ccn degreemanager -ccp /home/shershah/hyperledger/FYP_Project/chaincode-javascript -ccl javascript -ccv 1.1 -ccs 2

---
Phase 4: Set Up Your Terminal Environment
---
You must run these 7 commands in the SAME terminal you will use for the demo.
They set up your terminal session to act as the "Admin" for Org1.
Press Enter after each command.
export PATH=${PWD}/../bin:$PATH export FABRIC\_CFG\_PATH=$PWD/../config/ export CORE_PEER_TLS_ENABLED=true export CORE_PEER_LOCALMSPID="Org1MSP" export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/[org1.example.com/peers/peer0.org1.example.com/tls/ca.crt](https://www.google.com/search?q=https://org1.example.com/peers/peer0.org1.example.com/tls/ca.crt) export CORE\_PEER\_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp export CORE_PEER_ADDRESS=localhost:7051

---
Phase 5: Run the Full Demo Script
---
Now you can run the actual demo. These commands will fail and
succeed exactly as planned, proving your audit logic works.
echo "--- STEP 5.1: Initializing the Ledger with HEC Rules ---" peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile ${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem -C mychannel -n degreemanager -c '{"function":"InitLedger","Args":}'

echo "--- STEP 5.2: Creating Student-001 ---" peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile ${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem -C mychannel -n degreemanager -c '{"function":"CreateStudent","Args":}'

echo "--- STEP 5.3: Adding INCOMPLETE History (to fail audit) ---" peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile ${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem -C mychannel -n degreemanager -c '{"function":"AddSemesterResult","Args":"]}'

echo "--- STEP 5.4: Attempting to Issue Degree (THIS WILL FAIL) ---" peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile ${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem -C mychannel -n degreemanager -c '{"function":"IssueDegree","Args":}'

(You will see the 'Audit FAILED' error here. This is the desired result for the demo.)
echo "--- STEP 5.5: Adding FINAL Courses to Meet Requirements ---" peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile ${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem -C mychannel -n degreemanager -c '{"function":"AddSemesterResult","Args":"]}'

echo "--- STEP 5.6: Attempting to Issue Degree Again (THIS WILL SUCCEED) ---" peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile ${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem -C mychannel -n degreemanager -c '{"function":"IssueDegree","Args":}'

(This will be successful and output the final Degree JSON)
echo "--- STEP 5.7: Querying the Ledger for Final Proof ---" peer chaincode query -C mychannel -n degreemanager -c '{"function":"QueryLedger","Args":}'

(This will return the Degree asset, proving it's on the ledger)
---
Phase 6: Shut Down the Network
---
When you are finished with your demo, run this to stop all containers.
./network.sh down
