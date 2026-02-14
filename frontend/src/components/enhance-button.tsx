"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enhancePrompt } from "@/lib/api";
import { toast } from "sonner";

interface EnhanceButtonProps {
  prompt: string;
  onEnhanced: (enhanced: string) => void;
  type?: string;
}

export function EnhanceButton({ prompt, onEnhanced, type = "video" }: EnhanceButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleEnhance() {
    if (!prompt.trim()) {
      toast.error("Enter a prompt first");
      return;
    }

    setLoading(true);
    try {
      const data = await enhancePrompt(prompt, type);
      onEnhanced(data.enhanced || data.prompt || prompt);
      toast.success("Prompt enhanced");
    } catch {
      toast.error("Failed to enhance prompt");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleEnhance}
      disabled={loading || !prompt.trim()}
    >
      {loading ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
      )}
      Enhance
    </Button>
  );
}
