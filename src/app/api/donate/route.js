import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    title: "Support n9Router",
    message:
      "If n9Router helps your work, consider supporting development. Every contribution keeps the project alive and growing. Thank you! ❤️",
    channels: [
      {
        id: "kofi",
        label: "Ko-fi",
        description: "Buy me a coffee — international friendly",
        icon: "local_cafe",
        color: "#FF5E5B",
        url: "https://ko-fi.com/nightwalker89",
        qr: "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https://ko-fi.com/nightwalker89",
      },
      {
        id: "paypal",
        label: "PayPal",
        description: "Direct transfer via PayPal.Me",
        icon: "payments",
        color: "#0070BA",
        url: "https://paypal.me/nightwalker89",
        qr: "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https://paypal.me/nightwalker89",
      },
      {
        id: "momo",
        label: "MoMo",
        description: "Scan QR with MoMo app (Vietnam)",
        icon: "qr_code_2",
        color: "#A50064",
        qr: "https://www.image2url.com/r2/default/images/1780594518402-625cc279-962d-4332-aa97-51a1df510234.png",
      },
    ],
  });
}
