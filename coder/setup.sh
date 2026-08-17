#!/bin/bash
# IDCS Coder - Quick Setup Script
# Run from the repository root: bash coder/setup.sh

set -e

echo "═══════════════════════════════════════"
echo "  IDCS Coder - Setup Script"
echo "═══════════════════════════════════════"

# 1. Backend migrations
echo ""
echo "▶ Running backend migrations..."
cd backend
python manage.py migrate coder
echo "✓ Coder migrations applied"

# 2. Frontend dependencies
echo ""
echo "▶ Installing coder frontend dependencies..."
cd ../coder
npm install
echo "✓ Dependencies installed"

echo ""
echo "═══════════════════════════════════════"
echo "  Setup complete!"
echo ""
echo "  To run:"
echo "  Backend:  cd backend && python manage.py runserver"
echo "  Frontend: cd coder   && npm run dev"
echo ""
echo "  URLs:"
echo "  API:      http://localhost:8000/api/coder/"
echo "  Frontend: http://localhost:5174"
echo "═══════════════════════════════════════"
