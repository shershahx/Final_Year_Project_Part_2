#!/bin/bash

# Your project directory
PROJECT="/home/shershah/hyperledger"

cd "$PROJECT"

# Add all changes
git add .

# OPTIONAL: If you want to skip some files, add them in .gitignore

# Commit with timestamp
git commit -m "Auto-sync: $(date)"

# Push to GitHub
git push origin main
