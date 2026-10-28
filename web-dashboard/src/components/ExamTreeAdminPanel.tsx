import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, BookOpen, ChevronRight, GraduationCap, Layers, Plus, RefreshCw, School, ToggleLeft, ToggleRight } from "lucide-react";
import { createExamTreeNode, fetchAdminExamTree, setExamTreeNodeStatus } from "../lib/api";
import { Badge, Card, EmptyState, ErrorState, SkeletonBlock, cn } from "./ui";
import type { ExamTreeCategory, ExamTreeNode } from "../types";

const nodeTypes: ExamTreeNode["type"][] = ["class", "level", "group", "admission_type", "unit", "subject", "chapter", "topic"];

export function ExamTreeAdminPanel() {
  const [tree, setTree] = useState<ExamTreeCategory[]>([]);
  const [selected, setSelected] = useState<ExamTreeCategory | ExamTreeNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ name: "", type: "subject" as ExamTreeNode["type"] });

  async function loadTree() {
    setLoading(true);
    setError("");
    try {
      const next = await fetchAdminExamTree();
      setTree(next);
      setSelected((current) => current ? findById(next, current.id) || next[0] || null : next[0] || null);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Could not load exam tree.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTree();
  }, []);

  const selectedCategoryId = selected && "children" in selected && !("categoryId" in selected) ? selected.id : (selected as ExamTreeNode | null)?.categoryId;
  const selectedNodeId = selected && "categoryId" in selected ? selected.id : null;
  const childCount = selected && "children" in selected ? (selected.children || []).length : 0;

  async function addChild() {
    if (!selectedCategoryId || !form.name.trim()) return;
    setSaving(true);
    setError("");
    try {
      await createExamTreeNode({
        categoryId: selectedCategoryId,
        parentId: selectedNodeId,
        name: form.name,
        type: form.type,
        color: colorForType(form.type),
      });
      setForm({ name: "", type: "subject" });
      setMessage("Structure updated.");
      await loadTree();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Could not add item.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleNode(node: ExamTreeNode) {
    setSaving(true);
    try {
      await setExamTreeNodeStatus(node.id, !node.isActive);
      await loadTree();
    } finally {
      setSaving(false);
    }
  }

  const totals = useMemo(() => {
    let nodes = 0;
    let active = 0;
    const walk = (items: ExamTreeNode[]) => items.forEach((item) => {
      nodes += 1;
      if (item.isActive) active += 1;
      walk(item.children || []);
    });
    tree.forEach((category) => walk(category.children || []));
    return { nodes, active };
  }, [tree]);

  return (
    <div className="space-y-4 exam-tree-workspace">
      <Card className="overflow-hidden p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">Self Exam Architecture</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950 dark:text-white">Academic and Admission hierarchy</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{totals.active} active items across {totals.nodes} total nodes.</p>
          </div>
          <button className="secondary-button" type="button" onClick={loadTree}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </Card>

      {message && <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100">{message}</div>}
      {error && <ErrorState message={error} onRetry={loadTree} />}

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <Card className="p-4">
          {loading ? (
            <div className="space-y-3">
              <SkeletonBlock className="h-14" />
              <SkeletonBlock className="h-44" />
            </div>
          ) : tree.length === 0 ? (
            <EmptyState icon={School} title="No hierarchy found" description="Apply the new Supabase hierarchy migration, then refresh." />
          ) : (
            <div className="space-y-4">
              {tree.map((category) => (
                <div key={category.id} className="rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.035]">
                  <button className="flex w-full items-center justify-between gap-3 text-left" type="button" onClick={() => setSelected(category)}>
                    <span className="flex items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-md text-white shadow-sm" style={{ backgroundColor: category.color || "#2563eb" }}>
                        {category.slug === "admission" ? <GraduationCap size={20} /> : <School size={20} />}
                      </span>
                      <span>
                        <span className="block font-bold text-slate-950 dark:text-white">{category.name}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{(category.children || []).length} top-level items</span>
                      </span>
                    </span>
                    <ChevronRight size={18} className="text-slate-400" />
                  </button>
                  <div className="mt-3 space-y-2">
                    {(category.children || []).map((node) => (
                      <TreeNodeRow key={node.id} node={node} depth={0} selectedId={selected?.id} onSelect={setSelected} onToggle={toggleNode} saving={saving} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Selected</p>
              <h3 className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{selected?.name || "Choose an item"}</h3>
              {selected && "type" in selected && <Badge tone="info" className="mt-2">{selected.type.replace("_", " ")}</Badge>}
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{childCount} child items. Add the next level students should choose.</p>
            </div>

            <div className="grid gap-3">
              <label>
                <span className="field-label">Name</span>
                <input className="field-input" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Physics, Unit A, Chapter 1" />
              </label>
              <label>
                <span className="field-label">Type</span>
                <select className="field-input" value={form.type} onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value as ExamTreeNode["type"] }))}>
                  {nodeTypes.map((type) => <option key={type} value={type}>{type.replace("_", " ")}</option>)}
                </select>
              </label>
              <button className="primary-button" type="button" disabled={!selected || saving || !form.name.trim()} onClick={addChild}>
                <Plus size={16} /> Add child
              </button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function TreeNodeRow({ node, depth, selectedId, onSelect, onToggle, saving }: {
  node: ExamTreeNode;
  depth: number;
  selectedId?: string;
  onSelect: (node: ExamTreeNode) => void;
  onToggle: (node: ExamTreeNode) => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className={cn("group flex items-center justify-between gap-3 rounded-md border p-2 transition hover:-translate-y-0.5", selectedId === node.id ? "border-cyan-400 bg-cyan-50 dark:bg-cyan-400/10" : "border-slate-200 bg-white/70 dark:border-white/10 dark:bg-white/[0.025]")} style={{ marginLeft: depth * 18 }}>
        <button className="flex min-w-0 flex-1 items-center gap-2 text-left" type="button" onClick={() => onSelect(node)}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-white" style={{ backgroundColor: node.color || colorForType(node.type) }}>
            {node.type === "subject" ? <BookOpen size={16} /> : node.type === "group" ? <Layers size={16} /> : <BadgeCheck size={16} />}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">{node.name}</span>
            <span className="text-xs capitalize text-slate-500 dark:text-slate-400">{node.type.replace("_", " ")}</span>
          </span>
        </button>
        <button className="icon-button" type="button" disabled={saving} onClick={() => onToggle(node)} title={node.isActive ? "Deactivate" : "Activate"}>
          {node.isActive ? <ToggleRight size={18} className="text-emerald-500" /> : <ToggleLeft size={18} className="text-slate-400" />}
        </button>
      </div>
      {(node.children || []).map((child) => (
        <TreeNodeRow key={child.id} node={child} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} onToggle={onToggle} saving={saving} />
      ))}
    </div>
  );
}

function findById(tree: ExamTreeCategory[], id: string) {
  for (const category of tree) {
    if (category.id === id) return category;
    const found = findNode(category.children || [], id);
    if (found) return found;
  }
  return null;
}

function findNode(nodes: ExamTreeNode[], id: string): ExamTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children || [], id);
    if (found) return found;
  }
  return null;
}

function colorForType(type: ExamTreeNode["type"]) {
  return {
    class: "#06b6d4",
    level: "#6366f1",
    group: "#ec4899",
    admission_type: "#8b5cf6",
    unit: "#f59e0b",
    subject: "#10b981",
    chapter: "#2563eb",
    topic: "#14b8a6",
  }[type];
}
