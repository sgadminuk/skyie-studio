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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground mt-1">
            Manage your video generation projects
          </p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)}>
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create New Project</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[200px] space-y-2">
                <Label htmlFor="projectName">Project Name</Label>
                <Input
                  id="projectName"
                  placeholder="My awesome video"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
              </div>
              <div className="w-48 space-y-2">
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
                {creating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Create
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Projects Grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium">No projects yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create your first project to organize your work
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const WorkflowIcon = WORKFLOW_ICONS[project.workflow] || Video;
            return (
              <Card key={project.id} className="group relative">
                <CardHeader className="flex flex-row items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <WorkflowIcon className="h-4 w-4 text-primary" />
                    </div>
                    <CardTitle className="text-base truncate">
                      {project.name}
                    </CardTitle>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400"
                    onClick={() => handleDelete(project.id)}
                    disabled={deletingId === project.id}
                  >
                    {deletingId === project.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary">
                      {WORKFLOW_LABELS[project.workflow] || project.workflow}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {project.updated_at
                        ? new Date(project.updated_at).toLocaleDateString()
                        : new Date(project.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
