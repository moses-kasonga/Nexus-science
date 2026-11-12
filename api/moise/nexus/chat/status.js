import { proxyMoise } from "../../../../server/moise-proxy.js";

export default function handler(req, res) {
  return proxyMoise(req, res, "/nexus/chat/status", "GET");
}
