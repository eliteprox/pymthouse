#!/usr/bin/env node

/**
 * Environment Configuration Validator for Vercel Deployment
 * 
 * Run this script to check if your environment variables are properly configured
 * Usage: node scripts/validate-env.js
 */

const requiredVars = {
  DATABASE_URL: {
    desc: "PostgreSQL connection string",
    example: "postgresql://user:pass@host/db?sslmode=require",
    validate: (val) => val.startsWith("postgresql://") || val.startsWith("postgres://"),
  },
  NEXTAUTH_URL: {
    desc: "Public URL of your deployed app",
    example: "https://your-app.vercel.app",
    validate: (val) => val.startsWith("http://") || val.startsWith("https://"),
  },
  NEXTAUTH_SECRET: {
    desc: "Random secret for NextAuth (min 32 chars)",
    example: "Run: openssl rand -base64 32",
    validate: (val) => val.length >= 32,
  },
  AUTH_TOKEN_PEPPER: {
    desc: "Server-side pepper for PBKDF2 token hashing (min 32 chars)",
    example: "Run: openssl rand -base64 48",
    validate: (val) => val.length >= 32,
  },
  SIGNER_INTERNAL_URL: {
    desc: "URL of deployed go-livepeer signer",
    example: "https://your-signer.up.railway.app",
    validate: (val) => val.startsWith("http://") || val.startsWith("https://"),
  },
  ETH_RPC_URL: {
    desc: "Ethereum RPC endpoint",
    example: "https://arb1.arbitrum.io/rpc",
    validate: (val) => val.startsWith("http://") || val.startsWith("https://"),
  },
  SIGNER_NETWORK: {
    desc: "Livepeer network configuration",
    example: "arbitrum-one-mainnet",
    validate: (val) => val.length > 0,
  },
};

const optionalVars = {
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  GITHUB_CLIENT_ID: "",
  GITHUB_CLIENT_SECRET: "",
  NEXT_PUBLIC_PRIVY_APP_ID: "",
  PRIVY_APP_SECRET: "",
  NAAP_METRICS_URL: "",
  SIGNER_CLI_URL: "",
};

console.log("🔍 Validating environment configuration for Vercel deployment...\n");

let hasErrors = false;
let hasWarnings = false;

// Check required variables
console.log("📋 Required Variables:");
for (const [key, config] of Object.entries(requiredVars)) {
  const value = process.env[key];
  
  if (!value) {
    console.log(`  ❌ ${key}: MISSING`);
    console.log(`     → ${config.desc}`);
    console.log(`     → Example: ${config.example}\n`);
    hasErrors = true;
  } else if (!config.validate(value)) {
    console.log(`  ⚠️  ${key}: INVALID FORMAT`);
    console.log(`     → ${config.desc}`);
    console.log(`     → Current: ${value.substring(0, 50)}...`);
    console.log(`     → Example: ${config.example}\n`);
    hasErrors = true;
  } else {
    // Show first/last few chars for security
    const displayValue = value.length > 50 
      ? `${value.substring(0, 20)}...${value.substring(value.length - 10)}`
      : value.substring(0, 30) + "...";
    console.log(`  ✅ ${key}: ${displayValue}`);
  }
}

// Check optional variables
console.log("\n📋 Optional Variables:");
let hasOAuth = false;
let hasPrivy = false;

for (const key of Object.keys(optionalVars)) {
  const value = process.env[key];
  
  if (value) {
    const displayValue = value.length > 50 
      ? `${value.substring(0, 20)}...`
      : value.substring(0, 30) + "...";
    console.log(`  ✅ ${key}: ${displayValue}`);
    
    if (key.includes("GOOGLE") || key.includes("GITHUB")) hasOAuth = true;
    if (key.includes("PRIVY")) hasPrivy = true;
  } else {
    console.log(`  ⚪ ${key}: Not set`);
  }
}

// Additional validation
console.log("\n🔍 Additional Checks:");

// Check OAuth pairing
const hasGoogleID = !!process.env.GOOGLE_CLIENT_ID;
const hasGoogleSecret = !!process.env.GOOGLE_CLIENT_SECRET;
const hasGitHubID = !!process.env.GITHUB_CLIENT_ID;
const hasGitHubSecret = !!process.env.GITHUB_CLIENT_SECRET;

if (hasGoogleID && !hasGoogleSecret) {
  console.log("  ⚠️  Google OAuth: CLIENT_ID set but CLIENT_SECRET missing");
  hasWarnings = true;
} else if (!hasGoogleID && hasGoogleSecret) {
  console.log("  ⚠️  Google OAuth: CLIENT_SECRET set but CLIENT_ID missing");
  hasWarnings = true;
} else if (hasGoogleID && hasGoogleSecret) {
  console.log("  ✅ Google OAuth: Properly configured");
}

if (hasGitHubID && !hasGitHubSecret) {
  console.log("  ⚠️  GitHub OAuth: CLIENT_ID set but CLIENT_SECRET missing");
  hasWarnings = true;
} else if (!hasGitHubID && hasGitHubSecret) {
  console.log("  ⚠️  GitHub OAuth: CLIENT_SECRET set but CLIENT_ID missing");
  hasWarnings = true;
} else if (hasGitHubID && hasGitHubSecret) {
  console.log("  ✅ GitHub OAuth: Properly configured");
}

if (!hasOAuth) {
  console.log("  ⚠️  No OAuth providers configured - you'll need to use token-based login");
  hasWarnings = true;
}

// Check Privy pairing
const hasPrivyApp = !!process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const hasPrivySecret = !!process.env.PRIVY_APP_SECRET;

if (hasPrivyApp && !hasPrivySecret) {
  console.log("  ⚠️  Privy: APP_ID set but APP_SECRET missing");
  hasWarnings = true;
} else if (!hasPrivyApp && hasPrivySecret) {
  console.log("  ⚠️  Privy: APP_SECRET set but APP_ID missing");
  hasWarnings = true;
} else if (hasPrivyApp && hasPrivySecret) {
  console.log("  ✅ Privy: Properly configured");
}

// Check production URL
const nextAuthUrl = process.env.NEXTAUTH_URL;
if (nextAuthUrl) {
  if (nextAuthUrl.includes("localhost") || nextAuthUrl.includes("127.0.0.1")) {
    console.log("  ⚠️  NEXTAUTH_URL points to localhost - update for production");
    hasWarnings = true;
  } else if (!nextAuthUrl.startsWith("https://")) {
    console.log("  ⚠️  NEXTAUTH_URL should use HTTPS in production");
    hasWarnings = true;
  } else {
    console.log("  ✅ NEXTAUTH_URL: Production-ready");
  }
}

// Check signer URL
const signerUrl = process.env.SIGNER_INTERNAL_URL;
if (signerUrl && (signerUrl.includes("localhost") || signerUrl.includes("127.0.0.1"))) {
  console.log("  ⚠️  SIGNER_INTERNAL_URL points to localhost - Vercel can't access local services");
  hasWarnings = true;
}

// Database SSL
const dbUrl = process.env.DATABASE_URL;
if (dbUrl && !dbUrl.includes("sslmode")) {
  console.log("  ⚠️  DATABASE_URL missing SSL mode - add '?sslmode=require' for production");
  hasWarnings = true;
}

// Summary
console.log("\n" + "=".repeat(70));
if (hasErrors) {
  console.log("❌ VALIDATION FAILED - Fix required variables before deploying");
  process.exit(1);
} else if (hasWarnings) {
  console.log("⚠️  VALIDATION PASSED WITH WARNINGS");
  console.log("   Your configuration will work but consider fixing warnings");
  console.log("   for production use.");
  process.exit(0);
} else {
  console.log("✅ VALIDATION PASSED - Environment is properly configured!");
  console.log("   You're ready to deploy to Vercel.");
  process.exit(0);
}
