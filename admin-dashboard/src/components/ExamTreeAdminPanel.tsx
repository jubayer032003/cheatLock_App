import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronRight,
  Edit3,
  Eye,
  EyeOff,
  FolderTree,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import {
  createExamTreeNode,
  createQuestionBankClass,
  deleteExamTreeNode,
  deleteQuestionBankClass,
  fetchAdminExamTree,
  setExamTreeNodeStatus,
  setQuestionBankClassStatus,
  updateExamTreeNode,
  updateQuestionBankClass,
} from "../lib/api";
import { Badge, Button, Card, EmptyState, ErrorState, SkeletonBlock, cn } from "./ui";
import type { ExamTreeCategory, ExamTreeNode } from "../types";

type SelectedItem =
  | { kind: "category"; item: ExamTreeCategory }
  | { kind: "node"; item: ExamTreeNode };

const nodeTypes: ExamTreeNode["type"][] = [
  "class",
  "level",
  "group",
  "admission_type",
  "unit",
  "subject",
  "chapter",
  "topic",
];

const nodeTypeLabels: Record<ExamTreeNode["type"], string> = {
  class: "Class",
  level: "Level",
  group: "Group",
  admission_type: "Admission Type",
  unit: "Unit",
  subject: "Subject",
  chapter: "Chapter",
  topic: "Topic",
};

const defaultNodeForm = {
  name: "",
  type: "subject" as ExamTreeNode["type"],
  displayOrder: "0",
  isActive: true,
};

const defaultCategoryForm = {
  name: "",
  slug: "",
  displayOrder: "0",
  isActive: true,
};

export function ExamTreeAdminPanel() {
  const [tree, setTree] = useState<ExamTreeCategory[]>([]);
  const [selected, setSelected] = useState<SelectedItem | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [nodeForm, setNodeForm] = useState(defaultNodeForm);
  const [categoryForm, setCategoryForm] = useState(defaultCategoryForm);

  async function loadTree() {
    setLoading(true);
    setError("");
    try {
      const next = await fetchAdminExamTree();
      setTree(next);
      setSelected((current) => {
        if (!current) return next[0] ? { kind: "category", item: next[0] } : null;
        const found = findSelected(next, current.item.id);
        return found || (next[0] ? { kind: "category", item: next[0] } : null);
      });
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Could not load self exam structure.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTree();
  }, []);

  useEffect(() => {
    if (!selected) {
      setCategoryForm(defaultCategoryForm);
      setNodeForm(defaultNodeForm);
      return;
    }
    if (selected.kind === "category") {
      setCategoryForm({
        name: selected.item.name,
        slug: selected.item.slug,
        displayOrder: String(selected.item.displayOrder || 0),
        isActive: selected.item.isActive,
      });
      setNodeForm({
        ...defaultNodeForm,
        type: selected.item.slug === "admission" ? "admission_type" : "class",
      });
      return;
    }
    setNodeForm({
      name: selected.item.name,
      type: selected.item.type,
      displayOrder: String(selected.item.displayOrder || 0),
      isActive: selected.item.isActive,
    });
  }, [selected]);

  const rows = useMemo(() => flattenTree(tree), [tree]);
  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.name, row.type, row.categoryName, row.path]
        .some((value) => value.toLowerCase().includes(needle))
    );
  }, [rows, search]);
  const totals = useMemo(() => ({
    categories: tree.length,
    nodes: rows.length,
    active: rows.filter((row) => row.isActive).length,
  }), [rows, tree.length]);
  const selectedPath = selected ? buildPath(tree, selected.item.id) : [];

  async function saveCategory() {
    if (!categoryForm.name.trim()) return setError("Category name is required.");
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (selected?.kind === "category") {
        await updateQuestionBankClass(selected.item.id, {
          name: categoryForm.name.trim(),
          slug: categoryForm.slug.trim() || undefined,
          displayOrder: Number(categoryForm.displayOrder) || 0,
          isActive: categoryForm.isActive,
        });
        setMessage("Category updated.");
      } else {
        await createQuestionBankClass({
          name: categoryForm.name.trim(),
          slug: categoryForm.slug.trim() || undefined,
          displayOrder: Number(categoryForm.displayOrder) || 0,
          isActive: categoryForm.isActive,
        });
        setMessage("Category created.");
      }
      setCategoryForm(defaultCategoryForm);
      await loadTree();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Could not save category.");
    } finally {
      setSaving(false);
    }
  }

  async function saveNode() {
    if (!selected) return setError("Select a parent item first.");
    if (!nodeForm.name.trim()) return setError("Name is required.");
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (selected.kind === "node" && nodeForm.name === selected.item.name && nodeForm.type === selected.item.type) {
        await updateExamTreeNode(selected.item.id, {
          categoryId: selected.item.categoryId,
          parentId: selected.item.parentId,
          name: nodeForm.name.trim(),
          type: nodeForm.type,
          displayOrder: Number(nodeForm.displayOrder) || 0,
          isActive: nodeForm.isActive,
          metadata: selected.item.metadata || {},
        });
        setMessage("Item updated.");
      } else {
        const categoryId = selected.kind === "category" ? selected.item.id : selected.item.categoryId;
        const parentId = selected.kind === "category" ? null : selected.item.id;
        await createExamTreeNode({
          categoryId,
          parentId,
          name: nodeForm.name.trim(),
          type: nodeForm.type,
          displayOrder: Number(nodeForm.displayOrder) || 0,
          isActive: nodeForm.isActive,
        });
        setMessage("Item created.");
        setNodeForm({ ...defaultNodeForm, type: nextTypeFor(selected) });
      }
      await loadTree();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Could not save item.");
    } finally {
      setSaving(false);
    }
  }

  async function updateSelectedNode() {
    if (!selected || selected.kind !== "node") return;
    if (!nodeForm.name.trim()) return setError("Name is required.");
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await updateExamTreeNode(selected.item.id, {
        categoryId: selected.item.categoryId,
        parentId: selected.item.parentId,
        name: nodeForm.name.trim(),
        type: nodeForm.type,
        displayOrder: Number(nodeForm.displayOrder) || 0,
        isActive: nodeForm.isActive,
        metadata: selected.item.metadata || {},
      });
      setMessage("Item updated.");
      await loadTree();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Could not update item.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleSelected() {
    if (!selected) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (selected.kind === "category") {
        await setQuestionBankClassStatus(selected.item.id, !selected.item.isActive);
      } else {
        await setExamTreeNodeStatus(selected.item.id, !selected.item.isActive);
      }
      setMessage(selected.item.isActive ? "Hidden from students." : "Visible to students.");
      await loadTree();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Could not change visibility.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSelected() {
    if (!selected) return;
    const label = selected.kind === "category" ? "class/category" : nodeTypeLabels[selected.item.type].toLowerCase();
    if (
      !window.confirm(
        `Delete this ${label} permanently?\n\n${selected.item.name}\n\nChild items and question-bank questions under it will also be deleted. This cannot be undone.`
      )
    ) {
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (selected.kind === "category") {
        await deleteQuestionBankClass(selected.item.id);
      } else {
        await deleteExamTreeNode(selected.item.id);
      }
      setSelected(null);
      setCategoryForm(defaultCategoryForm);
      setNodeForm(defaultNodeForm);
      setMessage("Deleted permanently.");
      await loadTree();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Could not delete this item.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950 dark:text-white">Classes and Subjects</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Add, edit, hide, or delete the items students use to find questions.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <SummaryBadge label="Categories" value={totals.categories} />
            <SummaryBadge label="Items" value={totals.nodes} />
            <SummaryBadge label="Active" value={totals.active} />
            <button className="secondary-button" type="button" onClick={loadTree}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>
      </Card>

      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
          {message}
        </div>
      )}
      {error && <ErrorState message={error} onRetry={loadTree} />}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.75fr)]">
        <Card className="p-0 overflow-hidden">
          <div className="border-b border-slate-200/80 p-4 dark:border-white/10">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-950 dark:text-white">Class List</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Select an item to edit, hide, delete, or add another item under it.</p>
              </div>
              <div className="relative w-full md:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  className="field-input pl-9"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search class, subject, unit, chapter..."
                />
              </div>
            </div>
          </div>

          <div className="max-h-[680px] overflow-auto">
            {loading ? (
              <div className="space-y-3 p-4">
                <SkeletonBlock className="h-12" />
                <SkeletonBlock className="h-12" />
                <SkeletonBlock className="h-12" />
              </div>
            ) : tree.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={FolderTree} title="No structure found" description="Create Academic and Admission categories to begin." />
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-[#111827] dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Location</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                  {tree.map((category) => (
                    <CategoryRow
                      key={category.id}
                      category={category}
                      selectedId={selected?.item.id}
                      onSelect={() => setSelected({ kind: "category", item: category })}
                    />
                  ))}
                  {filteredRows.map((row) => (
                    <NodeRow
                      key={row.id}
                      row={row}
                      selectedId={selected?.item.id}
                      onSelect={() => setSelected({ kind: "node", item: row.node })}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Selected item</p>
                <h3 className="mt-1 text-base font-bold text-slate-950 dark:text-white">{selected?.item.name || "Nothing selected"}</h3>
              </div>
              {selected && (
                <Badge tone={selected.item.isActive ? "success" : "warning"}>
                  {selected.item.isActive ? "Visible" : "Hidden"}
                </Badge>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">
              {selectedPath.length > 0 ? selectedPath.map((item, index) => (
                <span key={item.id} className="inline-flex items-center">
                  {index > 0 && <ChevronRight className="mx-1 text-slate-400" size={13} />}
                  {item.name}
                </span>
              )) : "Select a category or item from the table."}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="secondary" disabled={!selected || saving} onClick={toggleSelected}>
                {selected?.item.isActive ? <EyeOff size={14} /> : <Eye size={14} />}
                {selected?.item.isActive ? "Hide" : "Show"}
              </Button>
              <Button variant="danger" disabled={!selected || saving} onClick={deleteSelected}>
                <Trash2 size={14} />
                Delete
              </Button>
            </div>
          </Card>

          <Card className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-950 dark:text-white">Main Class Group</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Use this for main sections like Academic and Admission.</p>
            </div>
            <TextField label="Category name" value={categoryForm.name} onChange={(value) => setCategoryForm((prev) => ({ ...prev, name: value }))} placeholder="Academic" />
            <TextField label="Slug" value={categoryForm.slug} onChange={(value) => setCategoryForm((prev) => ({ ...prev, slug: value }))} placeholder="academic" />
            <TextField label="Display order" value={categoryForm.displayOrder} onChange={(value) => setCategoryForm((prev) => ({ ...prev, displayOrder: value }))} placeholder="1" />
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={categoryForm.isActive} onChange={(event) => setCategoryForm((prev) => ({ ...prev, isActive: event.target.checked }))} />
              Visible to students
            </label>
            <div className="flex flex-wrap gap-2">
              <Button disabled={saving || !categoryForm.name.trim()} onClick={saveCategory}>
                <Save size={14} /> {selected?.kind === "category" ? "Save Group" : "Create Group"}
              </Button>
              <Button variant="secondary" onClick={() => setCategoryForm(defaultCategoryForm)}>Clear</Button>
            </div>
          </Card>

          <Card className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-950 dark:text-white">Class, Subject, or Chapter</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Select where it should go, then add or update it.</p>
            </div>
            <TextField label="Name" value={nodeForm.name} onChange={(value) => setNodeForm((prev) => ({ ...prev, name: value }))} placeholder="Physics" />
            <label>
              <span className="field-label">Type</span>
              <select className="field-input" value={nodeForm.type} onChange={(event) => setNodeForm((prev) => ({ ...prev, type: event.target.value as ExamTreeNode["type"] }))}>
                {nodeTypes.map((type) => <option key={type} value={type}>{nodeTypeLabels[type]}</option>)}
              </select>
            </label>
            <TextField label="Display order" value={nodeForm.displayOrder} onChange={(value) => setNodeForm((prev) => ({ ...prev, displayOrder: value }))} placeholder="0" />
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={nodeForm.isActive} onChange={(event) => setNodeForm((prev) => ({ ...prev, isActive: event.target.checked }))} />
              Visible to students
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button disabled={!selected || saving || !nodeForm.name.trim()} onClick={saveNode}>
                <Plus size={14} /> Add Here
              </Button>
              <Button variant="secondary" disabled={selected?.kind !== "node" || saving || !nodeForm.name.trim()} onClick={updateSelectedNode}>
                <Edit3 size={14} /> Save Item
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function CategoryRow({ category, selectedId, onSelect }: { category: ExamTreeCategory; selectedId?: string; onSelect: () => void }) {
  return (
    <tr className={cn("cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.03]", selectedId === category.id && "bg-sky-50 dark:bg-sky-500/10")} onClick={onSelect}>
      <td className="px-4 py-3 font-bold text-slate-950 dark:text-white">
        <span className="inline-flex items-center gap-2">
          <BookOpen size={14} className="text-sky-600" />
          {category.name}
        </span>
      </td>
      <td className="px-4 py-3"><Badge tone="primary">Category</Badge></td>
      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{category.name}</td>
      <td className="px-4 py-3"><Badge tone={category.isActive ? "success" : "warning"}>{category.isActive ? "Visible" : "Hidden"}</Badge></td>
    </tr>
  );
}

function NodeRow({ row, selectedId, onSelect }: { row: FlatNode; selectedId?: string; onSelect: () => void }) {
  return (
    <tr className={cn("cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.03]", selectedId === row.id && "bg-sky-50 dark:bg-sky-500/10")} onClick={onSelect}>
      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
        <span style={{ paddingLeft: row.depth * 18 }} className="inline-flex items-center gap-2">
          <FolderTree size={14} className="text-slate-400" />
          {row.name}
        </span>
      </td>
      <td className="px-4 py-3"><Badge tone="neutral">{nodeTypeLabels[row.type]}</Badge></td>
      <td className="max-w-md truncate px-4 py-3 text-slate-500 dark:text-slate-400" title={row.path}>{row.path}</td>
      <td className="px-4 py-3"><Badge tone={row.isActive ? "success" : "warning"}>{row.isActive ? "Visible" : "Hidden"}</Badge></td>
    </tr>
  );
}

function TextField({ label, value, onChange, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label>
      <span className="field-label">{label}</span>
      <input className="field-input" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function SummaryBadge({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200">
      {label}: <strong className="text-slate-950 dark:text-white">{value}</strong>
    </span>
  );
}

type FlatNode = ExamTreeNode & {
  node: ExamTreeNode;
  categoryName: string;
  path: string;
  depth: number;
};

function flattenTree(tree: ExamTreeCategory[]) {
  const rows: FlatNode[] = [];
  const walk = (category: ExamTreeCategory, nodes: ExamTreeNode[], parents: string[], depth: number) => {
    nodes.forEach((node) => {
      const path = [...parents, node.name].join(" > ");
      rows.push({ ...node, node, categoryName: category.name, path, depth });
      walk(category, node.children || [], [...parents, node.name], depth + 1);
    });
  };
  tree.forEach((category) => walk(category, category.children || [], [category.name], 0));
  return rows;
}

function buildPath(tree: ExamTreeCategory[], id: string) {
  for (const category of tree) {
    if (category.id === id) return [{ id: category.id, name: category.name }];
    const path = findNodePath(category.children || [], id);
    if (path.length) return [{ id: category.id, name: category.name }, ...path];
  }
  return [];
}

function findNodePath(nodes: ExamTreeNode[], id: string): Array<{ id: string; name: string }> {
  for (const node of nodes) {
    if (node.id === id) return [{ id: node.id, name: node.name }];
    const path = findNodePath(node.children || [], id);
    if (path.length) return [{ id: node.id, name: node.name }, ...path];
  }
  return [];
}

function findSelected(tree: ExamTreeCategory[], id: string): SelectedItem | null {
  for (const category of tree) {
    if (category.id === id) return { kind: "category", item: category };
    const node = findNode(category.children || [], id);
    if (node) return { kind: "node", item: node };
  }
  return null;
}

function findNode(nodes: ExamTreeNode[], id: string): ExamTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findNode(node.children || [], id);
    if (child) return child;
  }
  return null;
}

function nextTypeFor(selected: SelectedItem) {
  if (selected.kind === "category") return selected.item.slug === "admission" ? "admission_type" : "class";
  if (selected.item.type === "class") return "subject";
  if (selected.item.type === "level") return "group";
  if (selected.item.type === "group") return "subject";
  if (selected.item.type === "admission_type") return selected.item.slug === "versity" ? "unit" : "subject";
  if (selected.item.type === "unit") return "subject";
  if (selected.item.type === "subject") return "chapter";
  return "topic";
}
