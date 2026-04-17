# Apache + mod_authnz_jwt in front of go-livepeer (DMZ). Targets:
#   gateway   — Apache only; set SIGNER_UPSTREAM (e.g. http://signer:8081) for docker compose.
#   signer-dmz — includes livepeer; Railway single service (Apache on $PORT, signer on loopback).

FROM debian:bookworm-slim AS build-mod

ARG LIBJWT_VERSION=1.12.1
ARG MOD_AUTHNZ_JWT_VERSION=1.2.0

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    make \
    automake \
    git \
    g++ \
    libtool \
    pkg-config \
    autoconf \
    libssl-dev \
    check \
    libjansson-dev \
    libz-dev \
    apache2 \
    apache2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

RUN git clone https://github.com/benmcollins/libjwt.git && \
    cd libjwt && \
    git checkout tags/v${LIBJWT_VERSION} && \
    autoreconf -i && \
    ./configure && \
    make && \
    make install && \
    ldconfig

RUN git clone https://github.com/AnthonyDeroche/mod_authnz_jwt.git && \
    cd mod_authnz_jwt && \
    git checkout tags/v${MOD_AUTHNZ_JWT_VERSION} && \
    autoreconf -ivf && \
    PKG_CONFIG_PATH=/usr/local/lib/pkgconfig ./configure && \
    make && \
    make install

FROM debian:bookworm-slim AS gateway

RUN apt-get update && apt-get install -y --no-install-recommends \
    apache2 \
    ca-certificates \
    curl \
    gettext-base \
    python3 \
    python3-cryptography \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build-mod /usr/local/lib/libjwt.so* /usr/local/lib/
COPY --from=build-mod /usr/lib/apache2/modules/mod_authnz_jwt.so /usr/lib/apache2/modules/mod_authnz_jwt.so

RUN ldconfig && \
    printf '%s\n' 'LoadModule auth_jwt_module /usr/lib/apache2/modules/mod_authnz_jwt.so' \
      >/etc/apache2/mods-available/authnz_jwt.load && \
    a2enmod authnz_jwt && \
    a2enmod alias proxy proxy_http headers rewrite authn_core authz_core

COPY scripts/jwks_to_pem.py /opt/pymthouse/scripts/jwks_to_pem.py
COPY docker/signer-dmz/apache/ports.conf.in /etc/apache2/templates/ports.conf.in
COPY docker/signer-dmz/apache/signer-dmz.conf.in /etc/apache2/templates/signer-dmz.conf.in
COPY docker/signer-dmz/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh /opt/pymthouse/scripts/jwks_to_pem.py

RUN mkdir -p /var/www/static && printf "OK\n" > /var/www/static/healthz

ENTRYPOINT ["/entrypoint.sh"]

FROM gateway AS signer-dmz

RUN apt-get update && apt-get install -y --no-install-recommends wget && \
    wget -q https://github.com/livepeer/go-livepeer/releases/download/v0.8.10/livepeer-linux-amd64.tar.gz && \
    tar -xzf livepeer-linux-amd64.tar.gz && \
    mv livepeer-linux-amd64/livepeer /usr/local/bin/livepeer && \
    chmod +x /usr/local/bin/livepeer && \
    rm -rf livepeer-linux-amd64.tar.gz livepeer-linux-amd64 && \
    rm -rf /var/lib/apt/lists/*

RUN mkdir -p /data

ENV SIGNER_NETWORK=arbitrum-one-mainnet
ENV SIGNER_PORT=8081
ENV ETH_RPC_URL=https://arb1.arbitrum.io/rpc
ENV SIGNER_ETH_ADDR=""
ENV SIGNER_REMOTE_DISCOVERY=0
