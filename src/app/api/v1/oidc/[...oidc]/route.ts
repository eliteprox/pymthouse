/**
 * Catch-all route that delegates all standard OIDC endpoints to node-oidc-provider.
 *
 * Handles: /api/v1/oidc/auth, /api/v1/oidc/token, /api/v1/oidc/userinfo,
 * /api/v1/oidc/jwks, /api/v1/oidc/device/auth, .well-known/openid-configuration, etc.
 */

import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/oidc/provider";
import { IncomingMessage, ServerResponse } from "http";
import { Socket } from "net";
import { normalizeProviderPath, PROVIDER_ENDPOINT_PATHS } from "@/lib/oidc/routes";
import { OIDC_MOUNT_PATH } from "@/lib/oidc/tokens";

const DEBUG_OIDC_LOGS = process.env.OIDC_DEBUG_LOGS === "1";

function resolveRedirectLocation(location: string, origin: string): URL {
  if (/^https?:\/\//i.test(location)) {
    return new URL(location);
  }

  // When provider emits relative paths, ensure they remain under our mount.
  if (
    location.startsWith("/") &&
    !location.startsWith(OIDC_MOUNT_PATH) &&
    Object.values(PROVIDER_ENDPOINT_PATHS).some((path) => location.startsWith(path))
  ) {
    return new URL(`${OIDC_MOUNT_PATH}${location}`, origin);
  }

  return new URL(location, origin);
}

/**
 * Convert a Web API Request/Response to the Node.js HTTP pair that
 * node-oidc-provider (a Koa app) expects, then convert the result back.
 */
async function handleOIDC(request: NextRequest): Promise<NextResponse> {
  const provider = await getProvider();

  // Build the path relative to the OIDC mount point.
  // The provider is mounted at /api/v1/oidc, so strip that prefix.
  const url = new URL(request.url);
  const mountPath = OIDC_MOUNT_PATH;
  let path = url.pathname;
  if (path.startsWith(mountPath)) {
    path = path.slice(mountPath.length) || "/";
  }

  // Alias legacy paths to node-oidc-provider routes.
  const normalizedPath = normalizeProviderPath(path);
  if (DEBUG_OIDC_LOGS && normalizedPath !== path) {
    console.info("[OIDC] route alias", { from: path, to: normalizedPath });
  }
  path = normalizedPath;

  // Create a Node.js IncomingMessage from the NextRequest
  const body = request.body ? Buffer.from(await request.arrayBuffer()) : null;
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = request.method;
  req.url = path + url.search;
  // OIDC context uses req.baseUrl to derive mountPath for urlFor() (returnTo, etc.).
  // Without this, mountPath is '' and resume URLs become /auth/:uid instead of /api/v1/oidc/auth/:uid.
  (req as IncomingMessage & { baseUrl?: string }).baseUrl = mountPath;

  // Copy headers
  request.headers.forEach((value, key) => {
    req.headers[key.toLowerCase()] = value;
  });
  // Ensure host header is set
  req.headers.host = url.host;

  // Push body data if present
  if (body && body.length > 0) {
    req.push(body);
  }
  req.push(null); // Signal end of stream

  // Create a ServerResponse
  const res = new ServerResponse(req);

  // Capture the response
  const chunks: Buffer[] = [];
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);

  res.write = function (chunk: any, ...args: any[]) {
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return originalWrite(chunk, ...args);
  } as any;

  return new Promise<NextResponse>((resolve) => {
    res.end = function (chunk?: any, ...args: any[]) {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      const responseBody = Buffer.concat(chunks);
      const statusCode = res.statusCode || 200;
      const headers = new Headers();

      // Copy response headers
      const rawHeaders = res.getHeaders();
      for (const [key, value] of Object.entries(rawHeaders)) {
        if (value !== undefined) {
          if (Array.isArray(value)) {
            for (const v of value) {
              headers.append(key, String(v));
            }
          } else {
            headers.set(key, String(value));
          }
        }
      }

      // Handle redirects — must forward Set-Cookie so the _interaction cookie reaches the browser
      if ([301, 302, 303, 307, 308].includes(statusCode)) {
        const location = headers.get("location");
        if (location) {
          const redirectResponse = NextResponse.redirect(
            resolveRedirectLocation(location, url.origin),
            statusCode as 301 | 302 | 303 | 307 | 308,
          );
          const setCookies = rawHeaders["set-cookie"];
          if (setCookies) {
            const cookies = Array.isArray(setCookies) ? setCookies : [setCookies];
            for (const cookie of cookies) {
              redirectResponse.headers.append("Set-Cookie", cookie);
            }
          }
          resolve(redirectResponse);
          return originalEnd(chunk, ...args);
        }
      }

      const nextResponse = new NextResponse(
        responseBody.length > 0 ? responseBody : null,
        { status: statusCode, headers },
      );

      resolve(nextResponse);
      return originalEnd(chunk, ...args);
    } as any;

    // Use the provider's callback to handle the request
    const callback = provider.callback();
    callback(req, res);
  });
}

export async function GET(request: NextRequest) {
  return handleOIDC(request);
}

export async function POST(request: NextRequest) {
  return handleOIDC(request);
}

export async function PUT(request: NextRequest) {
  return handleOIDC(request);
}

export async function DELETE(request: NextRequest) {
  return handleOIDC(request);
}

export async function OPTIONS(request: NextRequest) {
  return handleOIDC(request);
}
