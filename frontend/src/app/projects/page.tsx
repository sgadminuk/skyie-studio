"use client";

import { useEffect, useState, useCallback } from "react";
import {
  FolderOpen,
  Plus,
  Trash2,
  Loader2,
  Video,
  Mic,
  Film,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getProjects, createProject, deleteProject } from "@/lib/api";
import { toast } from "sonner";

interface Project {
  id: string;
  name: string;
  workflow: string;
  params: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const WORKFLOW_ICONS: Record<string, React.ElementType> = {
  talking_head: Mic,
  broll: Film,
  full_production: Video,
};

const WORKFLOW_LABELS: Record<string, string> = {
  talking_head: "Talking Head",
  broll: "B-Roll",
  full_production: "Full Production",
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWorkflow, setNewWorkflow] = useState("talking_head");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const data = await getProjects();
      setProjects(data.projects || data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      await createProject({
        name: newName.trim(),
        workflow: newWorkflow,
        params: {},
      });
      toast.success("Project created");
      setNewName("");
      setShowCreate(false);
      fetchProjects();
    } catch {
      toast.error("Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      toast.success("Project deleted");
    } catch {
      toast.error("Failed to delete project");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-[clamp(32px,5vh,64px)]">
      {/* Header */}
      <header className="flex items-end justify-between gap-6 flex-wrap">
        <div className="flex flex-col gap-2">
          <span className="text-mono-sm text-ink/40">PROJECTS · §00</span>
          <h1 className="text-h2 text-ink">Saved configurations.</h1>
          <p className="text-ink/60 max-w-[60ch]">
            Re-render existing projects with the same parameters, or branch off into a new variation.
          </p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)}>
          <Plus className="h-4 w-4" />
          New project
        </Button>
      </header>

      {/* Create form */}
      {showCreate && (
        <section
          aria-labelledby="create-heading"
          className="border border-ink/15 px-6 py-5 flex flex-col gap-4"
        >
          <header className="flex items-baseline gap-3">
            <span className="text-mono-sm text-ink/40">§01</span>
            <h2 id="create-heading" className="text-h3 text-ink">New project.</h2>
          </header>
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px] flex flex-col gap-2">
              <Label htmlFor="projectName">Project name</Label>
              <Input
                id="projectName"
                placeholder="my-awesome-video"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
              />
            </div>
            <div className="w-48 flex flex-col gap-2">
              <Label>Workflow</Label>
              <Select value={newWorkflow} onValueChange={setNewWorkflow}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="talking_head">Talking Head</SelectItem>
                  <SelectItem value="broll">B-Roll</SelectItem>
                  <SelectItem value="full_production">Full Production</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={creating || !newName.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create
            </Button>
          </form>
        </section>
      )}

      {/* Projects list */}
      <section aria-labelledby="list-heading" className="flex flex-col gap-4">
        <header className="flex items-baseline gap-3">
          <span className="text-mono-sm text-ink/40">§02</span>
          <h2 id="list-heading" className="text-h3 text-ink">All projects.</h2>
          {!loading && (
            <span className="text-mono-sm text-ink/40">
              {String(projects.length).padStart(3, "0")} total
            </span>
          )}
        </header>

        {loading ? (
          <div className="grid gap-[1px] sm:grid-cols-2 lg:grid-cols-3 bg-ink/15">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-paper p-6 flex flex-col gap-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="border border-ink/15 px-6 py-12 flex flex-col items-center gap-3">
            <FolderOpen className="h-10 w-10 text-ink/30" />
            <span className="text-h3 text-ink">No projects yet.</span>
            <span className="text-mono-sm text-ink/55">
              Create one to organise your generations.
            </span>
          </div>
        ) : (
          <div className="grid gap-[1px] sm:grid-cols-2 lg:grid-cols-3 bg-ink/15">
            {projects.map((project) => {
              const WorkflowIcon = WORKFLOW_ICONS[project.workflow] || Video;
              return (
                <article
                  key={project.id}
                  className="group relative bg-paper p-6 flex flex-col gap-4"
                >
                  <header className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-ink/[0.06] border border-ink/10">
                        <WorkflowIcon className="h-4 w-4 text-ink/70" />
                      </div>
                      <h3 className="text-h3 text-ink truncate">{project.name}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(project.id)}
                      disabled={deletingId === project.id}
                      aria-label="Delete project"
                      className="h-8 w-8 flex items-center justify-center text-ink/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                    >
                      {deletingId === project.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </header>
                  <footer className="flex items-baseline justify-between border-t border-ink/15 pt-3">
                    <span className="text-mono-sm text-ink/55">
                      {WORKFLOW_LABELS[project.workflow] || project.workflow}
                    </span>
                    <span className="text-mono-sm text-ink/40">
                      {project.updated_at
                        ? new Date(project.updated_at).toLocaleDateString()
                        : new Date(project.created_at).toLocaleDateString()}
                    </span>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
