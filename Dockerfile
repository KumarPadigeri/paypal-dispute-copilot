# 1) Build the web page
FROM node:20.19-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# 2) Run the API, which also serves the built page
FROM python:3.11-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt requirements-toolkit.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
 && pip install --no-cache-dir --no-deps -r requirements-toolkit.txt
COPY copilot ./copilot
COPY --from=web /web/dist ./web/dist
RUN useradd --create-home app
USER app
EXPOSE 8000
# Render sets PORT; 8000 when run locally
CMD ["sh", "-c", "uvicorn copilot.api:app --host 0.0.0.0 --port ${PORT:-8000}"]
