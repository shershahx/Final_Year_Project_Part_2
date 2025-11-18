#!/bin/bash

# Project directory
PROJECT="/home/shershah/hyperledger"

cd "$PROJECT"

echo "==== Sync Started ===="

# Make sure Git always uses merge for pulls
git config pull.rebase false

# Pull latest changes safely
echo "Pulling from remote..."
git pull origin main --allow-unrelated-histories --no-rebase

# Add all changes
echo "Adding changes..."
git add .

# Commit (only if there are changes)
if git diff --cached --quiet; then
    echo "No changes to commit."
else
    git commit -m "Auto-sync: $(date)"
fi

# Push changes
echo "Pushing to GitHub..."
git push origin main

echo "==== Sync Complete ===="
