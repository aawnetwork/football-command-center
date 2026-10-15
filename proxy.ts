import { NextResponse, type NextRequest } from "next/server";
import { canUseExportStudio } from "./app/lib/export-access";
import { validExportPassword } from "./app/lib/export-password";
import { testerGateEnabled, testerMachineRoute, validTesterPassword } from "./app/lib/tester-access";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const broadcast = path === "/admin/broadcasts" || path.startsWith("/admin/broadcasts/");
  const admin = path === "/admin" || path.startsWith("/admin/") && !broadcast || path.startsWith("/api/admin/");
  if (!admin) {
    if (!testerGateEnabled(process.env) || testerMachineRoute(path, request.method)) return NextResponse.next();
    if (!validTesterPassword(request.headers.get("authorization"), process.env)) {
      return new NextResponse("AAW Hub is available to invited testers only. Username: aaw.", {
        status: 401, headers: { "WWW-Authenticate": 'Basic realm="AAW Hub Testing", charset="UTF-8"', "Cache-Control": "private, no-store" },
      });
    }
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  const local = canUseExportStudio(process.env.NODE_ENV, request.headers.get("host"));
  if (local || validExportPassword(request.headers.get("authorization"), process.env.EXPORT_STUDIO_PASSWORD)) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  return new NextResponse("Export Studio requires a configured password (minimum 16 characters). Username: aaw.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="AAW Export Studio", charset="UTF-8"', "Cache-Control": "private, no-store" },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
