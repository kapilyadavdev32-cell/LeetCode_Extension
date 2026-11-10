import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { User } from "../models/User.js";

export async function requireAuth(request, response, next) {
  const authorization = request.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) {
    return response.status(401).json({ error: "Authentication required." });
  }

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return response.status(401).json({ error: "Invalid or expired authentication token." });
  }
  if (typeof payload !== "object" || typeof payload.sub !== "string") {
    return response.status(401).json({ error: "Invalid authentication token." });
  }
  const user = await User.findById(payload.sub).select("_id email");
  if (!user) return response.status(401).json({ error: "Account no longer exists." });
  request.user = user;
  return next();
}

export function issueToken(userId) {
  return jwt.sign({}, config.jwtSecret, {
    subject: userId.toString(),
    expiresIn: config.jwtExpiresIn
  });
}
