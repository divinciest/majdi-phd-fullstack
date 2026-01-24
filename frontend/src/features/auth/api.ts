import { http } from "@/lib/http";

export type User = { id: number; email: string; createdAt: string; isActive: boolean };

export const AuthAPI = {
  signup: (payload: { email: string; password: string }) => http<User>(`/signup`, { method: "POST", body: JSON.stringify(payload) }),
  signin: (payload: { email: string; password: string }) => http<User>(`/signin`, { method: "POST", body: JSON.stringify(payload) }),
  signout: () => http<void>(`/signout`, { method: "POST" }),
};
