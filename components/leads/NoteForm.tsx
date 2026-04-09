"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Send } from "lucide-react";

export function NoteForm({ leadId, apiPath }: { leadId?: string; apiPath?: string }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  const notesUrl = apiPath ?? (leadId ? `/api/leads/${leadId}/notes` : null);

  const submit = async () => {
    if (!content.trim() || !notesUrl) return;
    setLoading(true);
    try {
      const res = await fetch(notesUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        setContent("");
        toast.success("Note added");
        router.refresh();
      } else {
        toast.error("Failed to add note");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Textarea
        placeholder="Add a note..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={2}
        className="resize-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.ctrlKey) submit();
        }}
      />
      <Button
        size="icon"
        onClick={submit}
        disabled={loading || !content.trim() || !notesUrl}
        className="shrink-0 self-end"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </Button>
    </div>
  );
}
