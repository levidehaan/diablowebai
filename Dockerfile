# Dockerfile for Diablo Web AI Build Environment
#
# This container provides a reproducible environment for building
# the Neural Augmentation enhanced Diablo Web engine.
#
# Build: docker build -t diabloweb-neural .
# Run:   docker run -it -v $(pwd):/src diabloweb-neural

FROM emscripten/emsdk:3.1.47

LABEL maintainer="DiabloWebAI Project"
LABEL description="Build environment for Neural Augmented Diablo Web"

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ninja-build \
    python3 \
    python3-pip \
    cmake \
    git \
    curl \
    wget \
    pkg-config \
    libsdl2-dev \
    libsodium-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js LTS
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g npm@latest

# Install Puppeteer dependencies for headless testing
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Create working directory
WORKDIR /src

# Create devilution build directory
RUN mkdir -p /build/devilution

# Set up Emscripten environment
ENV EMSDK=/emsdk
ENV PATH="/emsdk:/emsdk/upstream/emscripten:${PATH}"

# Verify Emscripten installation
RUN emcc --version

# Copy package files for dependency caching
COPY package*.json ./

# Install npm dependencies
RUN npm ci

# Default command
CMD ["npm", "start"]

# --- Multi-stage build for production ---

FROM emscripten/emsdk:3.1.47 AS builder

WORKDIR /src

# Install build dependencies
RUN apt-get update && apt-get install -y \
    ninja-build \
    python3 \
    cmake \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

COPY package*.json ./
RUN npm ci

COPY . .

# Build production bundle
RUN npm run build

# --- Devilution WASM Build Stage ---

FROM emscripten/emsdk:3.1.47 AS wasm-builder

WORKDIR /devilution

# Install build dependencies
RUN apt-get update && apt-get install -y \
    ninja-build \
    python3 \
    cmake \
    git \
    libsdl2-dev \
    && rm -rf /var/lib/apt/lists/*

# Clone devilution source (the fork that targets web)
ARG DEVILUTION_REPO=https://github.com/AJenbo/devilutionX.git
ARG DEVILUTION_BRANCH=master

RUN git clone --depth 1 --branch ${DEVILUTION_BRANCH} ${DEVILUTION_REPO} . \
    || echo "Using existing source"

# Configure for Emscripten
RUN mkdir -p build && cd build && \
    emcmake cmake .. \
        -G Ninja \
        -DCMAKE_BUILD_TYPE=Release \
        -DBUILD_TESTING=OFF \
        -DDEVILUTIONX_SYSTEM_BZIP2=OFF \
        -DDEVILUTIONX_SYSTEM_LIBSODIUM=OFF \
        -DDEVILUTIONX_SYSTEM_LIBFMT=OFF \
        -DDEVILUTIONX_SYSTEM_SDL2=OFF \
        || echo "CMake configuration may need adjustment for specific fork"

# Build (this may fail depending on the fork)
# RUN cd build && ninja

# --- Nginx for serving ---

FROM nginx:alpine AS production

COPY --from=builder /src/build /usr/share/nginx/html

# Configure nginx for SPA
RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    location ~* \.(wasm|jscc)$ { \
        add_header Content-Type application/wasm; \
        add_header Cross-Origin-Embedder-Policy require-corp; \
        add_header Cross-Origin-Opener-Policy same-origin; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
