import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { User } from "../models/User.js";
import { issueToken, requireAuth } from "../middleware/auth.js";

const router = Router();
const credentialsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(72)
});

router.post("/register", async (request, response) => {
  const parsed = credentialsSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({ error: "Enter a valid email and a password of 8-72 characters." });
  }
  if (Buffer.byteLength(parsed.data.password, "utf8") > 72) {
    return response.status(400).json({ error: "Password must be at most 72 UTF-8 bytes." });
  }

  const email = parsed.data.email.toLowerCase();
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  try {
    const user = await User.create({ email, passwordHash });
    return response.status(201).json({
      token: issueToken(user._id),
      user: { id: user._id.toString(), email: user.email }
    });
  } catch (error) {
    if (error?.code === 11000) {
      return response.status(409).json({ error: "An account with that email already exists." });
    }
    throw error;
  }
});

router.post("/login", async (request, response) => {
  const parsed = credentialsSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({ error: "Enter a valid email and password." });
  }
  const user = await User.findOne({ email: parsed.data.email.toLowerCase() }).select("+passwordHash");
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return response.status(401).json({ error: "Email or password is incorrect." });
  }
  return response.json({
    token: issueToken(user._id),
    user: { id: user._id.toString(), email: user.email }
  });
});

router.get("/me", requireAuth, (request, response) => {
  response.json({
    user: { id: request.user._id.toString(), email: request.user.email }
  });
});

export default router;
