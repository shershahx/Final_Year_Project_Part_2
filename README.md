# HEC E-Attestation — Blockchain-Based Degree Verification System

A decentralized degree attestation and verification platform built on **Hyperledger Fabric**. The system enables universities to upload degrees, HEC to verify and attest them on the blockchain, and the public to independently verify any degree's authenticity via QR code — eliminating fraud and manual paperwork.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Running Individual Services](#running-individual-services)
- [API Endpoints](#api-endpoints)
- [Environment Variables](#environment-variables)
- [Team](#team)
- [License](#license)

---

## Overview

Pakistan's Higher Education Commission (HEC) currently relies on a manual, paper-based degree attestation process that is slow, opaque, and vulnerable to fraud. **HEC E-Attestation** replaces this with a blockchain-backed digital workflow:

1. **Universities** upload degree data and PDF documents.
2. **Approvers** review and digitally sign degrees through a multi-step approval workflow.
3. **HEC** performs final verification and records the attestation on the Hyperledger Fabric ledger.
4. **Public users** scan a QR code on any attested degree to instantly verify its authenticity against the blockchain.

All degree records are immutable, timestamped, and transparently auditable.

---

## Key Features

| Feature | Description |
|---|---|
| **Blockchain Ledger** | Immutable degree records on Hyperledger Fabric with multi-org consensus |
| **Role-Based Dashboards** | Separate interfaces for HEC, University, Approver, and Public users |
| **Multi-Step Approval** | Configurable approval workflow with digital signatures |
| **PDF Signing & QR Codes** | Automatically embeds QR verification codes and digital signatures into degree PDFs |
| **Degree Templates** | Universities can create and manage reusable degree templates |
| **IPFS Storage** | Decentralized storage for degree documents |
| **Google OAuth** | Secure authentication via Google Sign-In with session management |
| **Email Notifications** | Automated email alerts for approval status changes |
| **Public Verification** | Anyone can verify a degree's authenticity by scanning its QR code |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                         │
│   ┌───────────┐  ┌────────────┐  ┌──────────┐  ┌────────────┐  │
│   │    HEC    │  │ University │  │ Approver │  │   Public   │  │
│   │ Dashboard │  │ Dashboard  │  │Dashboard │  │  Verify    │  │
│   └───────────┘  └────────────┘  └──────────┘  └────────────┘  │
└────────────────────────┬─────────────────────────────────────────┘
                         │  REST API
┌────────────────────────▼─────────────────────────────────────────┐
│                    Backend (Express.js)                          │
│   Auth · Degrees · Approvals · Templates · Network · Signatures │
└───────┬────────────────┬──────────────────────┬──────────────────┘
        │                │                      │
  ┌─────▼─────┐   ┌─────▼──────┐   ┌───────────▼──────────────┐
  │  CouchDB  │   │    IPFS    │   │  Hyperledger Fabric      │
  │ (User DB) │   │ (Doc Store)│   │  Network + Chaincode     │
  └───────────┘   └────────────┘   └──────────────────────────┘
```

### Decentralized Document Verification Architecture (Flutter + Fabric)

- **Flutter mobile app (iOS/Android)**: Uploads and verifies documents, signs requests with OAuth/JWT, and talks to the API only over TLS.
- **API gateway / Node.js backend**: Validates tokens, scans files, hashes documents, and serves a Fabric SDK gateway for chaincode calls. Issues short-lived session tokens.
- **Hyperledger Fabric network**: Peers run chaincode that records and verifies document hashes. Orderers provide consensus. All traffic from the backend uses mTLS identities issued by the Fabric CA.
- **CouchDB state database**: Stores world state and metadata alongside the ledger for quick lookups; kept in sync by Fabric peers.
- **Artifact storage (optional IPFS/S3)**: Raw documents can be stored off-chain; only hashes and metadata are persisted on-chain.
- **Observability and audit logs**: API emits immutable audit events (API gateway, chaincode events) for compliance and traceability.

#### Draw.io (mxGraphModel)

```xml
<mxGraphModel dx="1280" dy="720" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827">
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
    <mxCell id="user" value="End User" style="ellipse;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf" vertex="1" parent="1">
      <mxGeometry x="40" y="180" width="100" height="50" as="geometry" />
    </mxCell>
    <mxCell id="app" value="Flutter\nMobile App" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6" vertex="1" parent="1">
      <mxGeometry x="180" y="170" width="130" height="70" as="geometry" />
    </mxCell>
    <mxCell id="api" value="API Gateway /\nNode.js Backend" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366" vertex="1" parent="1">
      <mxGeometry x="360" y="170" width="150" height="70" as="geometry" />
    </mxCell>
    <mxCell id="gateway" value="Fabric SDK\nGateway" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656" vertex="1" parent="1">
      <mxGeometry x="550" y="170" width="130" height="70" as="geometry" />
    </mxCell>
    <mxCell id="peer" value="Fabric Peer\n+ Chaincode" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450" vertex="1" parent="1">
      <mxGeometry x="730" y="140" width="150" height="70" as="geometry" />
    </mxCell>
    <mxCell id="orderer" value="Fabric Orderer" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666" vertex="1" parent="1">
      <mxGeometry x="730" y="230" width="150" height="60" as="geometry" />
    </mxCell>
    <mxCell id="couch" value="CouchDB State DB" style="shape=cylinder;whiteSpace=wrap;html=1;boundedLbl=1;fillColor=#dae8fc;strokeColor=#6c8ebf" vertex="1" parent="1">
      <mxGeometry x="930" y="160" width="120" height="80" as="geometry" />
    </mxCell>
    <mxCell id="ca" value="Fabric CA" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#cdeb8b;strokeColor=#9caf6a" vertex="1" parent="1">
      <mxGeometry x="550" y="270" width="130" height="60" as="geometry" />
    </mxCell>
    <mxCell id="storage" value="Off-chain Storage\n(IPFS/S3)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6" vertex="1" parent="1">
      <mxGeometry x="360" y="270" width="150" height="70" as="geometry" />
    </mxCell>
    <mxCell id="audit" value="Audit / Logs" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666" vertex="1" parent="1">
      <mxGeometry x="930" y="270" width="120" height="60" as="geometry" />
    </mxCell>
    <mxCell id="e1" style="endArrow=block;html=1;strokeColor=#6c8ebf" edge="1" parent="1" source="user" target="app">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    <mxCell id="e2" style="endArrow=block;html=1;strokeColor=#82b366" edge="1" parent="1" source="app" target="api">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    <mxCell id="e3" style="endArrow=block;html=1;strokeColor=#d6b656" edge="1" parent="1" source="api" target="gateway">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    <mxCell id="e4" style="endArrow=block;html=1;strokeColor=#b85450" edge="1" parent="1" source="gateway" target="peer">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    <mxCell id="e5" style="endArrow=block;html=1;dashed=1;strokeColor=#666666" edge="1" parent="1" source="peer" target="orderer">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    <mxCell id="e6" style="endArrow=block;html=1;strokeColor=#6c8ebf" edge="1" parent="1" source="peer" target="couch">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    <mxCell id="e7" style="endArrow=block;html=1;dashed=1;strokeColor=#82b366" edge="1" parent="1" source="api" target="storage">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    <mxCell id="e8" style="endArrow=block;html=1;dashed=1;strokeColor=#9caf6a" edge="1" parent="1" source="api" target="ca">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    <mxCell id="e9" style="endArrow=block;html=1;dashed=1;strokeColor=#666666" edge="1" parent="1" source="api" target="audit">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    <mxCell id="e10" style="endArrow=block;html=1;dashed=1;strokeColor=#666666" edge="1" parent="1" source="peer" target="audit">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
  </root>
</mxGraphModel>
```

#### Mermaid.js (fallback)

```mermaid
graph TD
  user((End User)) --> app[Flutter Mobile App]
  app --> api[API Gateway / Node.js Backend]
  api --> gateway[Fabric SDK Gateway]
  gateway --> peer[Fabric Peer + Chaincode]
  peer --> orderer[Fabric Orderer]
  peer --> couch[(CouchDB State DB)]
  api -. off-chain .-> storage[Off-chain Storage (IPFS/S3)]
  api -. enroll .-> ca[Fabric CA]
  api -. audit .-> audit[Audit / Logs]
  peer -. events .-> audit
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React.js |
| **Backend** | Node.js, Express.js, Passport.js (Google OAuth) |
| **Database** | Apache CouchDB |
| **Blockchain** | Hyperledger Fabric 2.x (chaincode in JavaScript) |
| **File Storage** | IPFS |
| **Containerization** | Docker, Docker Compose |
| **PDF Processing** | pdf-lib, QR code generation |
| **Authentication** | Google OAuth 2.0, express-session |

---

## Project Structure

```
Final_Year_Project_Part_2/
├── frontend/                   # React.js frontend application
│   └── src/
│       ├── App.js              # Main app with routing
│       ├── components/         # Reusable UI components
│       │   ├── SignatureCanvas.js
│       │   └── UniversityLayout.js
│       ├── pages/
│       │   ├── hec/            # HEC admin dashboard
│       │   ├── university/     # University portal (upload, roles, degrees)
│       │   ├── approver/       # Approver review dashboard
│       │   └── public/         # Public degree verification page
│       └── services/           # API service layer
│
├── backend/                    # Express.js REST API server
│   ├── server.js               # App entry point (port 5000)
│   ├── routes/
│   │   ├── auth.routes.js      # Google OAuth & session routes
│   │   ├── degree.routes.js    # Degree CRUD & blockchain operations
│   │   ├── approval.routes.js  # Approval workflow routes
│   │   ├── approver.routes.js  # Approver management routes
│   │   ├── template.routes.js  # Degree template routes
│   │   └── network.routes.js   # Fabric network management routes
│   └── services/
│       ├── degreeVerification.service.js
│       ├── approvalWorkflow.service.js
│       ├── pdfSignature.service.js
│       ├── signatureManagement.service.js
│       └── degreeTemplate.service.js
│
├── chaincode/                  # Hyperledger Fabric smart contracts
├── chaincode-javascript/       # Chaincode implementation (Node.js)
│
├── network/                    # Fabric network configuration
│   ├── start-network.sh        # Bring up the blockchain network
│   ├── configtx.yaml           # Channel & org configuration
│   ├── docker-compose-ca.yaml  # Certificate Authority containers
│   ├── registerEnroll.sh       # Org identity registration
│   ├── organizations/          # Crypto material & MSP
│   ├── docker/                 # Docker Compose definitions
│   ├── configtx/               # Channel artifacts
│   └── scripts/
│       ├── create-channel.sh   # Channel creation script
│       └── deploy-chaincode.sh # Chaincode lifecycle deployment
│
├── fabric-samples/             # Hyperledger Fabric sample binaries/configs
├── FYP_Project/                # Supporting project files
├── contribution-work/          # Individual team member contribution logs
├── start-project.sh            # One-command project launcher
├── sync.sh                     # Git sync helper script
└── README.md
```

---

## Prerequisites

Ensure the following are installed before running the project:

- **Git**
- **Node.js** ≥ 14.x and **npm**
- **Docker** and **Docker Compose**
- **Hyperledger Fabric** binaries (peer, orderer, configtxgen, etc.)
- **IPFS** daemon ([install guide](https://docs.ipfs.tech/install/))
- **Apache CouchDB** (can be run via Docker)
- A Unix-like shell (Linux, macOS, or **WSL** on Windows)

---

## Quick Start

The project includes a single launcher script that starts all services in the correct order:

```bash
# 1. Clone the repository
git clone https://github.com/shershahx/Final_Year_Project_Part_2.git
cd Final_Year_Project_Part_2

# 2. Start everything (IPFS → Fabric Network → Backend → Frontend)
chmod +x start-project.sh
./start-project.sh
```

Once started, the following services will be available:

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5000 |
| IPFS API | http://localhost:5001 |
| Health Check | http://localhost:5000/api/health |

---

## Running Individual Services

### Blockchain Network

```bash
cd network
chmod +x start-network.sh
./start-network.sh
```

This will bring up the Fabric peers, orderers, and CAs via Docker, create the channel, and deploy the chaincode.

### Backend

```bash
cd backend
npm install
npm start          # Starts on port 5000
```

### Frontend

```bash
cd frontend
npm install
npm start          # Starts on port 3000
```

---

## API Endpoints

| Route Prefix | Description |
|---|---|
| `POST /api/auth/google` | Google OAuth authentication |
| `GET  /api/health` | Server health check |
| `GET/POST /api/degrees` | Degree management & blockchain operations |
| `GET/POST /api/approval` | Approval workflow actions |
| `GET/POST /api/approver` | Approver registration & management |
| `GET/POST /api/templates` | Degree template CRUD |
| `GET/POST /api/university` | University-specific operations |
| `GET/POST /api/hec` | HEC administrative actions |
| `GET/POST /api/network` | Fabric network status & control |

---

## Environment Variables

Create a `.env` file in the `backend/` directory:

```env
PORT=5000
NODE_ENV=development
SESSION_SECRET=your-session-secret

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000

# CouchDB
COUCHDB_URL=http://localhost:5984
COUCHDB_USER=admin
COUCHDB_PASSWORD=adminpw

# Email (for notifications)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

> **Note:** Never commit your `.env` file. Use `.env.example` as a template.

---

## Team

| Member | Contribution Log |
|---|---|
| Sher Shah | `contribution-work/sher-shah.txt` |
| Shayan Khan | `contribution-work/shayan-khan.txt` |
| Muhammad Talha | `contribution-work/muhammad-talha.txt` |

---

## License

This project was developed as a Final Year Project. Please add a `LICENSE` file if you intend to open-source it.

---

<p align="center">
  Built with ❤️ using Hyperledger Fabric, React, and Node.js
</p>
