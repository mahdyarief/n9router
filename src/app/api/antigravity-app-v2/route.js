import {
  handleAntigravityGet,
  handleAntigravityPost,
} from "@/lib/antigravity-ide-lib";

export async function GET() {
  return handleAntigravityGet("antigravity-app-v2");
}

export async function POST(request) {
  return handleAntigravityPost("antigravity-app-v2", request);
}
