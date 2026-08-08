import bcrypt from "bcrypt";
import { signToken } from "../../lib/jwt";
import { badRequest, unauthorized } from "../../lib/errors";
import type { UserRepo } from "./auth.repo";

export function createAuthService(userRepo: UserRepo) {
  return {
    async register(email: string, password: string) {
      const existing = await userRepo.findByEmail(email);
      if (existing) badRequest("Email already registered");
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await userRepo.create(email, passwordHash);
      const token = await signToken({
        sub: String(user.id),
        email: user.email,
      });
      return { token, user: { id: String(user.id), email: user.email } };
    },
    async login(email: string, password: string) {
      const user = await userRepo.findByEmail(email);
      if (!user) unauthorized("Invalid credentials");
      const ok = await bcrypt.compare(password, user!.passwordHash);
      if (!ok) unauthorized("Invalid credentials");
      const token = await signToken({
        sub: String(user!.id),
        email: user!.email,
      });
      return { token, user: { id: String(user!.id), email: user!.email } };
    },
  };
}
export type AuthService = ReturnType<typeof createAuthService>;
