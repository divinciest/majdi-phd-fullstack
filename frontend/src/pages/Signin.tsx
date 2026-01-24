import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate, Link } from "react-router-dom";
import { AuthAPI } from "@/features/auth/api";
import { toast } from "@/hooks/use-toast";

export default function Signin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await AuthAPI.signin({ email, password });
      toast({ title: "Signed in", description: email });
      navigate("/");
    } catch (err: any) {
      toast({ title: "Sign in failed", description: err?.message || String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="flex justify-between items-center pt-2">
              <Link to="/signup" className="text-sm underline">Create account</Link>
              <Button type="submit" disabled={loading}>{loading ? "Signing in..." : "Sign in"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
