import { useState, useEffect, useMemo } from "react";
import { 
  Users, 
  UserPlus, 
  Upload, 
  Search, 
  Trash2, 
  Key, 
  UserMinus, 
  CheckCircle, 
  Filter, 
  AlertCircle 
} from "lucide-react";
import { 
  fetchTenantUsers, 
  createTenantUser, 
  bulkImportTenantUsers, 
  toggleUserSuspension, 
  resetUserPassword, 
  deleteTenantUser 
} from "../lib/api";
import { Card } from "../components/ui";

type ActiveTab = "directory" | "create" | "bulk";

export function UserManagementPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("directory");
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Create single user form state
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("STUDENT");
  const [department, setDepartment] = useState("");
  const [program, setProgram] = useState("");
  const [batch, setBatch] = useState("");

  // Bulk Import state
  const [csvContent, setCsvContent] = useState("");
  const [parsedPreview, setParsedPreview] = useState<any[]>([]);

  const loadUsers = () => {
    fetchTenantUsers()
      .then(setUsers)
      .catch(() => setErrorMessage("Could not load users list."));
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setErrorMessage("");
    if (!name || !identifier || !password) {
      setErrorMessage("Please fill all required fields.");
      return;
    }
    try {
      await createTenantUser({
        name,
        identifier,
        password,
        role,
        department,
        program,
        batch,
      });
      setMessage(`User ${name} created successfully.`);
      setName("");
      setIdentifier("");
      setPassword("");
      loadUsers();
    } catch {
      setErrorMessage("Failed to create user.");
    }
  };

  // CSV Parser: name, identifier, role, department, program, batch
  const handleParseCsv = () => {
    setMessage("");
    setErrorMessage("");
    if (!csvContent.trim()) {
      setErrorMessage("CSV field is empty.");
      return;
    }

    const lines = csvContent.split("\n");
    const parsed = [];

    for (const line of lines) {
      const parts = line.split(",").map((p) => p.trim());
      if (parts.length < 2) continue; // must at least have name, identifier

      parsed.push({
        name: parts[0] || "",
        identifier: parts[1] || "",
        role: parts[2] || "STUDENT",
        department: parts[3] || "",
        program: parts[4] || "",
        batch: parts[5] || "",
      });
    }

    setParsedPreview(parsed);
  };

  const handleBulkImport = async () => {
    setMessage("");
    setErrorMessage("");
    if (parsedPreview.length === 0) return;
    try {
      const res = await bulkImportTenantUsers(parsedPreview);
      setMessage(`Import complete. Successfully added ${res.importedCount} users. Skipped ${res.skippedCount}.`);
      setCsvContent("");
      setParsedPreview([]);
      loadUsers();
    } catch {
      setErrorMessage("Failed to import bulk users.");
    }
  };

  const handleToggleSuspension = async (userId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    try {
      await toggleUserSuspension(userId, nextStatus);
      loadUsers();
    } catch {
      setErrorMessage("Failed to toggle suspension.");
    }
  };

  const handleResetPassword = async (userId: string) => {
    if (!confirm("Are you sure you want to reset this user's password?")) return;
    try {
      await resetUserPassword(userId);
      alert("Password has been reset to: CheatLock123!");
    } catch {
      setErrorMessage("Failed to reset password.");
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user permanently?")) return;
    try {
      await deleteTenantUser(userId);
      loadUsers();
    } catch {
      setErrorMessage("Failed to delete user.");
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch = 
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.identifier.toLowerCase().includes(search.toLowerCase());
      
      const matchesRole = roleFilter === "ALL" || u.role === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [users, search, roleFilter]);

  return (
    <div className="space-y-6 text-slate-100 font-sans">
      
      {/* Header */}
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
        <p className="text-xs font-mono font-bold text-violet-400 uppercase tracking-widest">SaaS Command Panel</p>
        <h2 className="mt-1 text-xl font-bold text-white tracking-wider">User Directory</h2>
        <p className="mt-2 text-xs text-slate-400">View user catalog, reset passwords, suspend credentials, or import student enrollments via CSV.</p>
      </section>

      {/* Tabs selectors */}
      <div className="flex border-b border-slate-800 text-xs">
        <button
          onClick={() => setActiveTab("directory")}
          className={`px-4 py-2 border-b-2 font-mono ${activeTab === "directory" ? "border-violet-500 text-white font-bold" : "border-transparent text-slate-400 hover:text-slate-200"}`}
        >
          <span className="flex items-center gap-1.5"><Users size={13} /> Directory</span>
        </button>
        <button
          onClick={() => setActiveTab("create")}
          className={`px-4 py-2 border-b-2 font-mono ${activeTab === "create" ? "border-violet-500 text-white font-bold" : "border-transparent text-slate-400 hover:text-slate-200"}`}
        >
          <span className="flex items-center gap-1.5"><UserPlus size={13} /> Create User</span>
        </button>
        <button
          onClick={() => setActiveTab("bulk")}
          className={`px-4 py-2 border-b-2 font-mono ${activeTab === "bulk" ? "border-violet-500 text-white font-bold" : "border-transparent text-slate-400 hover:text-slate-200"}`}
        >
          <span className="flex items-center gap-1.5"><Upload size={13} /> CSV Bulk Upload</span>
        </button>
      </div>

      {message && (
        <div className="p-3 bg-emerald-950/20 border border-emerald-500/20 text-emerald-400 text-xs font-mono rounded flex items-center gap-2">
          <CheckCircle size={15} />
          {message}
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-red-950/20 border border-red-500/20 text-red-400 text-xs font-mono rounded flex items-center gap-2">
          <AlertCircle size={15} />
          {errorMessage}
        </div>
      )}

      {/* TAB 1: User Directory List */}
      {activeTab === "directory" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
              <input 
                type="text" 
                placeholder="Search user name or identifier..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-xs rounded pl-8 pr-2.5 py-1.5 text-slate-350 focus:border-violet-500 focus:outline-none"
              />
            </div>

            {/* Role Filter */}
            <div className="flex items-center gap-2 text-xs font-mono">
              <Filter size={13} className="text-slate-500" />
              <select 
                value={roleFilter} 
                onChange={(e) => setRoleFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-350 focus:border-violet-500 focus:outline-none"
              >
                <option value="ALL">All Roles</option>
                <option value="SUPER_ADMIN">Super Admin</option>
                <option value="INSTITUTION_ADMIN">Institution Admin</option>
                <option value="DEPARTMENT_ADMIN">Department Admin</option>
                <option value="TEACHER">Teacher</option>
                <option value="PROCTOR">Proctor</option>
                <option value="STUDENT">Student</option>
                <option value="OBSERVER">Observer</option>
                <option value="AUDITOR">Auditor</option>
              </select>
            </div>
          </div>

          {/* Directory Grid */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {filteredUsers.map((user) => (
              <div 
                key={user._id}
                className="flex items-center justify-between p-3.5 bg-slate-900 border border-slate-850 rounded-lg hover:border-slate-700 transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-white">{user.name}</p>
                    <span className="text-[8.5px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-violet-400">
                      {user.role}
                    </span>
                    {user.status === "SUSPENDED" && (
                      <span className="text-[8.5px] uppercase font-mono px-1.5 py-0.5 rounded bg-red-950/20 border border-red-500/20 text-red-400">
                        Suspended
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono">{user.identifier}</p>
                  {(user.department || user.program) && (
                    <p className="text-[10px] text-slate-400 font-mono">
                      Dept: {user.department || "N/A"} | Prog: {user.program || "N/A"}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleToggleSuspension(user._id, user.status)}
                    className={`p-1.5 rounded border transition ${user.status === "ACTIVE" ? "bg-slate-950 border-slate-800 text-amber-500 hover:bg-slate-800" : "bg-amber-950/20 border-amber-500/30 text-amber-400 font-bold"}`}
                    title={user.status === "ACTIVE" ? "Suspend User" : "Activate User"}
                  >
                    <UserMinus size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResetPassword(user._id)}
                    className="p-1.5 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-white transition"
                    title="Reset Password"
                  >
                    <Key size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteUser(user._id)}
                    className="p-1.5 rounded bg-slate-950 border border-slate-800 text-red-400 hover:text-red-500 transition"
                    title="Delete User"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
            {filteredUsers.length === 0 && (
              <p className="py-8 text-xs font-mono text-slate-500 text-center">No directory results match filters.</p>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Create Single User */}
      {activeTab === "create" && (
        <form onSubmit={handleCreateUser}>
          <Card className="p-5 bg-slate-900 border-slate-850 space-y-4">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
              Single Account Setup
            </h3>

            <div className="grid gap-4 md:grid-cols-2 text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="text-slate-500 font-mono">Full Name *</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-300 focus:border-violet-500 focus:outline-none"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-slate-500 font-mono">User Identifier (Email/Username) *</label>
                <input 
                  type="text" 
                  value={identifier} 
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. johndoe@university.edu"
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-300 focus:border-violet-500 focus:outline-none"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-slate-500 font-mono">Temporary Password *</label>
                <input 
                  type="password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="CheatLock123!"
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-300 focus:border-violet-500 focus:outline-none"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-slate-500 font-mono">Role *</label>
                <select 
                  value={role} 
                  onChange={(e) => setRole(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-300 focus:border-violet-500 focus:outline-none h-9"
                  required
                >
                  <option value="STUDENT">Student</option>
                  <option value="TEACHER">Teacher</option>
                  <option value="PROCTOR">Proctor</option>
                  <option value="DEPARTMENT_ADMIN">Department Admin</option>
                  <option value="INSTITUTION_ADMIN">Institution Admin</option>
                  <option value="SUPER_ADMIN">Super Admin</option>
                  <option value="OBSERVER">Observer</option>
                  <option value="AUDITOR">Auditor</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-slate-500 font-mono">Department</label>
                <input 
                  type="text" 
                  value={department} 
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="CS"
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-300 focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-slate-500 font-mono">Program</label>
                <input 
                  type="text" 
                  value={program} 
                  onChange={(e) => setProgram(e.target.value)}
                  placeholder="BSc Computer Science"
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-300 focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-slate-500 font-mono">Batch</label>
                <input 
                  type="text" 
                  value={batch} 
                  onChange={(e) => setBatch(e.target.value)}
                  placeholder="2026"
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-300 focus:border-violet-500 focus:outline-none"
                />
              </div>
            </div>

            <button 
              type="submit"
              className="w-full py-2 bg-violet-600 hover:bg-violet-700 text-white rounded font-bold transition flex items-center justify-center gap-1.5 text-xs uppercase tracking-wider"
            >
              Add User
            </button>
          </Card>
        </form>
      )}

      {/* TAB 3: CSV Bulk Import */}
      {activeTab === "bulk" && (
        <div className="space-y-4">
          <Card className="p-5 bg-slate-900 border-slate-850 space-y-4">
            <div>
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
                Paste CSV Contents
              </h3>
              <p className="text-[10px] text-slate-500 font-mono mt-1">
                Format: name, identifier, role, department, program, batch (one user per line)
              </p>
            </div>

            <textarea 
              rows={6}
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              placeholder="John Doe, john@school.edu, STUDENT, CS, Computer Science, 2026&#10;Alice Smith, alice@school.edu, TEACHER, CS, N/A, N/A"
              className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 text-slate-200 placeholder-slate-800 resize-none font-mono text-xs focus:border-violet-500 focus:outline-none"
            />

            <button 
              type="button"
              onClick={handleParseCsv}
              className="w-full py-2 bg-slate-950 hover:bg-slate-800 text-white border border-slate-800 rounded font-bold transition text-xs uppercase tracking-wider"
            >
              Parse CSV Data
            </button>
          </Card>

          {parsedPreview.length > 0 && (
            <Card className="p-5 bg-slate-900 border-slate-850 space-y-4">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
                Preview Parsed Directory ({parsedPreview.length} items)
              </h3>

              <div className="max-h-[300px] overflow-y-auto border border-slate-800 rounded">
                <table className="w-full border-collapse text-left font-mono text-[10px] text-slate-300">
                  <thead className="bg-slate-950 text-slate-550 border-b border-slate-800 uppercase text-[8.5px]">
                    <tr>
                      <th className="p-2.5">Name</th>
                      <th className="p-2.5">Identifier</th>
                      <th className="p-2.5">Role</th>
                      <th className="p-2.5">Dept</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {parsedPreview.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-850">
                        <td className="p-2.5 font-bold text-white">{item.name}</td>
                        <td className="p-2.5">{item.identifier}</td>
                        <td className="p-2.5">{item.role}</td>
                        <td className="p-2.5">{item.department || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button 
                type="button"
                onClick={handleBulkImport}
                className="w-full py-2 bg-violet-600 hover:bg-violet-700 text-white rounded font-bold transition text-xs uppercase tracking-wider"
              >
                Import Verified Rows
              </button>
            </Card>
          )}
        </div>
      )}

    </div>
  );
}
