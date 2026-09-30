import QRCode from "qrcode";

const url = "http://192.168.0.102:5173";
await QRCode.toFile("./web-app-qr.png", url, { width: 400, margin: 2 });
console.log("QR generated for:", url);
