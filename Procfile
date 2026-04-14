# Procfile for platforms that support buildpacks (Railway, Heroku, etc.)
# This will start the go-livepeer signer using the downloaded binary

web: ./livepeer -remoteSigner -network=${SIGNER_NETWORK:-arbitrum-one-mainnet} -httpAddr=0.0.0.0:${PORT:-8081} -cliAddr=0.0.0.0:4935 -ethUrl=${ETH_RPC_URL:-https://arb1.arbitrum.io/rpc} -ethPassword=/app/.eth-password -datadir=/app/data -v=99
