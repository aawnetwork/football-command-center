import { NextResponse, type NextRequest } from "next/server";
import { canUseExportStudio } from "./app/lib/export-access";
import { validExportPassword } from "./app/lib/export-password";

export function proxy(request: NextRequest) {
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

export const config = { matcher: "/admin/exports/:path*" };
