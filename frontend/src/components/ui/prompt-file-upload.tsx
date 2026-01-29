import * as React from "react";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Upload, X, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

interface PromptFileUploadProps {
  label: string;
  description?: string;
  accept?: string;
  value: File | null;
  onChange: (file: File | null) => void;
  maxPreviewLength?: number;
  className?: string;
  required?: boolean;
}

export function PromptFileUpload({
  label,
  description,
  accept = ".txt",
  value,
  onChange,
  maxPreviewLength = 500,
  className,
  required = false,
}: PromptFileUploadProps) {
  const [preview, setPreview] = useState<string>("");
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | null) => {
    if (file) {
      if (!file.name.toLowerCase().endsWith(".txt")) {
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setPreview(text);
      };
      reader.readAsText(file);
    } else {
      setPreview("");
    }
    onChange(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleClear = () => {
    handleFile(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const truncatedPreview = preview.length > maxPreviewLength
    ? preview.substring(0, maxPreviewLength) + "..."
    : preview;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </label>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="h-6 px-2 text-xs"
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>
      
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
        id={`prompt-upload-${label.replace(/\s+/g, "-").toLowerCase()}`}
      />

      {!value ? (
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
            dragActive
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50"
          )}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drop a .txt file here or click to browse
          </p>
        </div>
      ) : (
        <Card className="bg-muted/50">
          <CardContent className="p-3">
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate">{value.name}</p>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {(value.size / 1024).toFixed(1)} KB
                  </span>
                </div>
                
                {preview && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Preview:</span>
                      {preview.length > maxPreviewLength && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowFullPreview(!showFullPreview)}
                          className="h-5 px-1 text-xs"
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          {showFullPreview ? "Less" : "More"}
                        </Button>
                      )}
                    </div>
                    <pre className="text-xs bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap break-words max-h-32 overflow-y-auto font-mono">
                      {showFullPreview ? preview : truncatedPreview}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
