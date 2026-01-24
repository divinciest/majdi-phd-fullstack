import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "@/hooks/store";
import { createRun } from "@/features/runs/runsSlice";
import { toast } from "@/hooks/use-toast";
import { UploadsAPI } from "@/features/uploads/api";

export default function RunCreate() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const creating = useAppSelector((s) => s.runs.creating);

  const [name, setName] = useState("");
  const [llmProvider, setLlmProvider] = useState("OpenAI GPT-4");
  const [prompt, setPrompt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [methods, setMethods] = useState<string[]>([]);
  const [aggregationLinksCount, setAggregationLinksCount] = useState<string>("");
  const [linksText, setLinksText] = useState("");
  const [perLinkPrompt, setPerLinkPrompt] = useState("");

  const toggleMethod = (m: string) => {
    setMethods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Prepare optional links array
      const links = linksText
        .split(/\n|,/)
        .map((q) => q.trim())
        .filter(Boolean);

      if (links.length === 0 && methods.length === 0) {
        toast({
          title: "Invalid input",
          description: "Select at least one search provider when no custom links are provided.",
          variant: "destructive",
        });
        return;
      }

      // Upload file if provided
      let tableFileUrl: string | undefined = undefined;
      if (file) {
        const up = await UploadsAPI.upload(file);
        tableFileUrl = up.url;
      }

      const agg = aggregationLinksCount.trim() ? Number(aggregationLinksCount) : undefined;
      if (agg !== undefined && (Number.isNaN(agg) || agg < 0)) {
        toast({ title: "Invalid aggregation count", description: "Provide a non-negative integer.", variant: "destructive" });
        return;
      }

      const res = await dispatch(
        createRun({
          name,
          llmProvider,
          searchMethods: methods,
          searchQueries: [],
          links: links.length ? links : undefined,
          aggregationLinksCount: agg,
          prompt: prompt || undefined,
          tableFileUrl,
          perLinkPrompt: perLinkPrompt || undefined,
        })
      ).unwrap();
      toast({ title: "Run created", description: `${res.name} started`, variant: "default" });
      navigate("/runs");
    } catch (err: any) {
      toast({ title: "Failed to create run", description: err?.message || String(err), variant: "destructive" });
    }
  };

  return (
    <div className="h-full bg-background p-6">
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Create Run</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="llm">LLM Provider</Label>
              <Input id="llm" value={llmProvider} onChange={(e) => setLlmProvider(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prompt">Prompt</Label>
              <Textarea id="prompt" rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="file">Excel/CSV File</Label>
              <Input id="file" type="file" accept=".csv,.txt,.xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>

            <div className="space-y-2">
              <Label>Search Providers</Label>
              <div className="flex gap-3">
                {(["Google Scholar", "ScienceDirect", "ResearchGate"]).map((m) => (
                  <label key={m} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={methods.includes(m)} onChange={() => toggleMethod(m)} />
                    {m}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="agg">Aggregation links count (optional)</Label>
                <Input id="agg" type="number" min={0} value={aggregationLinksCount} onChange={(e) => setAggregationLinksCount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="perLinkPrompt">Per-link prompt (optional)</Label>
                <Input id="perLinkPrompt" value={perLinkPrompt} onChange={(e) => setPerLinkPrompt(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="links">Optional custom links (comma or newline separated)</Label>
              <Textarea id="links" rows={3} value={linksText} onChange={(e) => setLinksText(e.target.value)} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
              <Button type="submit" disabled={creating}>{creating ? "Creating..." : "Create Run"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
