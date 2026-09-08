# Multi-stage Dockerfile
# Stage 1: Frontend build
FROM node:20-slim AS frontend-build

WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/src ./src
COPY frontend/index.html ./
COPY frontend/tsconfig.json ./
COPY frontend/tsconfig.node.json ./
COPY frontend/vite.config.ts ./
RUN npm run build

# Stage 2: Backend runtime
FROM python:3.12-slim

WORKDIR /app

# Install uv package manager
RUN pip install uv

# Copy backend dependencies
COPY backend/pyproject.toml backend/uv.lock ./

# Sync dependencies (no dev dependencies for production)
RUN uv sync --no-dev

# Copy backend source code
COPY backend/app ./app

# Copy frontend build output
COPY --from=frontend-build /frontend/dist ./static

# Create data directory for SQLite
RUN mkdir -p /data

# Expose port
EXPOSE 8000

# Environment configuration
ENV DATABASE_URL=sqlite+aiosqlite:////data/plinko.db
ENV PYTHONUNBUFFERED=1

# Start uvicorn
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
