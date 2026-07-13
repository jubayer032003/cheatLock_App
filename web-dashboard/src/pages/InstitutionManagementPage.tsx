import { useState, useEffect } from "react";
import { 
  Building2, 
  Settings, 
  Sliders, 
  Award, 
  Plus, 
  Trash2, 
  Save, 
  Palette, 
  ShieldCheck 
} from "lucide-react";
import { fetchTenantSettings, updateTenantSettings } from "../lib/api";
import { Card } from "../components/ui";

interface Department {
  name: string;
  code: string;
  faculties: string[];
  programs: string[];
}

export function InstitutionManagementPage() {
  const [tenant, setTenant] = useState<any>(null);
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#8b5cf6");
  const [theme, setTheme] = useState("dark");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  // AI Thresholds
  const [faceMissing, setFaceMissing] = useState(25);
  const [multipleFaces, setMultipleFaces] = useState(30);
  const [phoneDetected, setPhoneDetected] = useState(20);
  const [speechDetected, setSpeechDetected] = useState(10);
  const [repeatedSwitch, setRepeatedSwitch] = useState(15);
  const [livenessFailure, setLivenessFailure] = useState(40);

  // Security Policies
  const [allowClipboard, setAllowClipboard] = useState(false);
  const [requireLiveness, setRequireLiveness] = useState(true);
  const [requireVAD, setRequireVAD] = useState(true);
  const [enforceKiosk, setEnforceKiosk] = useState(true);

  // Departments List
  const [departments, setDepartments] = useState<Department[]>([]);
  const [newDepName, setNewDepName] = useState("");
  const [newDepCode, setNewDepCode] = useState("");

  useEffect(() => {
    fetchTenantSettings()
      .then((data) => {
        setTenant(data);
        setName(data.name || "");
        setLogoUrl(data.branding?.logoUrl || "");
        setPrimaryColor(data.branding?.primaryColor || "#8b5cf6");
        setTheme(data.branding?.theme || "dark");

        const ai = data.settings?.aiThresholds || {};
        setFaceMissing(ai.faceMissingWeight ?? 25);
        setMultipleFaces(ai.multipleFacesWeight ?? 30);
        setPhoneDetected(ai.phoneDetectedWeight ?? 20);
        setSpeechDetected(ai.speechDetectedWeight ?? 10);
        setRepeatedSwitch(ai.repeatedSwitchWeight ?? 15);
        setLivenessFailure(ai.livenessFailureWeight ?? 40);

        const sec = data.settings?.securityPolicies || {};
        setAllowClipboard(sec.allowClipboard ?? false);
        setRequireLiveness(sec.requireLiveness ?? true);
        setRequireVAD(sec.requireVAD ?? true);
        setEnforceKiosk(sec.enforceKiosk ?? true);

        setDepartments(data.departments || []);
        setLoading(false);
      })
      .catch(() => {
        setMessage("Could not load institution details.");
        setLoading(false);
      });
  }, []);

  const handleAddDepartment = () => {
    if (!newDepName.trim() || !newDepCode.trim()) return;
    const dep: Department = {
      name: newDepName.trim(),
      code: newDepCode.trim().toUpperCase(),
      faculties: [],
      programs: [],
    };
    setDepartments((prev) => [...prev, dep]);
    setNewDepName("");
    setNewDepCode("");
  };

  const handleRemoveDepartment = (code: string) => {
    setDepartments((prev) => prev.filter((d) => d.code !== code));
  };

  const handleSaveSettings = async () => {
    setMessage("");
    try {
      const payload = {
        name,
        branding: { logoUrl, primaryColor, theme },
        settings: {
          aiThresholds: {
            faceMissingWeight: faceMissing,
            multipleFacesWeight: multipleFaces,
            phoneDetectedWeight: phoneDetected,
            speechDetectedWeight: speechDetected,
            repeatedSwitchWeight: repeatedSwitch,
            livenessFailureWeight: livenessFailure,
          },
          securityPolicies: {
            allowClipboard,
            requireLiveness,
            requireVAD,
            enforceKiosk,
          },
        },
        departments,
      };
      const updated = await updateTenantSettings(payload);
      setTenant(updated);
      setMessage("Settings saved successfully.");
    } catch {
      setMessage("Failed to update organization settings.");
    }
  };

  if (loading) {
    return <p className="p-8 text-center text-xs font-mono text-slate-500">Loading settings...</p>;
  }

  return (
    <div className="space-y-6 text-slate-100 font-sans">
      
      {/* Page Header */}
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
        <p className="text-xs font-mono font-bold text-violet-400 uppercase tracking-widest">SaaS Command Panel</p>
        <h2 className="mt-1 text-xl font-bold text-white tracking-wider">Institution Settings</h2>
        <p className="mt-2 text-xs text-slate-400">Configure institutional details, branding theme colors, AI thresholds, and licensing states.</p>
      </section>

      {message && (
        <div className="p-3 bg-violet-950/20 border border-violet-500/20 text-violet-400 text-xs font-mono rounded text-center">
          {message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        
        {/* Branding & Info Section */}
        <div className="space-y-6">
          <Card className="p-5 bg-slate-900 border-slate-800 flex flex-col gap-4">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <Palette size={14} className="text-violet-400" />
              Branding & Info
            </h3>
            
            <div className="space-y-3.5 text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="text-slate-500 font-mono">Institution Name</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-350 focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-slate-500 font-mono">Logo Image URL</label>
                <input 
                  type="text" 
                  value={logoUrl} 
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-355 placeholder-slate-700 focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-500 font-mono">Theme Color</label>
                  <input 
                    type="color" 
                    value={primaryColor} 
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 h-9 rounded cursor-pointer p-1"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-500 font-mono">Dark Mode</label>
                  <select 
                    value={theme} 
                    onChange={(e) => setTheme(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-350 focus:border-violet-500 focus:outline-none h-9"
                  >
                    <option value="light">Light Theme</option>
                    <option value="dark">Dark Theme</option>
                  </select>
                </div>
              </div>
            </div>
          </Card>

          {/* Licensing Info Card */}
          <Card className="p-5 bg-slate-900 border-slate-800 flex flex-col gap-4">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <Award size={14} className="text-violet-400" />
              SaaS License Status
            </h3>

            <div className="bg-slate-950 border border-slate-850 rounded p-4 text-xs font-mono space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Tier:</span>
                <span className="text-violet-400 font-bold uppercase">{tenant?.license?.type || "Trial Tier"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Max Concurrent Slots:</span>
                <span className="text-white font-bold">{tenant?.license?.maxConcurrentStudents || 50} Students</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Renewal Expiration:</span>
                <span className="text-slate-300">
                  {tenant?.license?.expiresAt ? new Date(tenant.license.expiresAt).toLocaleDateString() : "Unlimited"}
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* AI Thresholds Sensitivity Sliders */}
        <Card className="p-5 bg-slate-900 border-slate-800 flex flex-col gap-4">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <Sliders size={14} className="text-violet-400" />
            AI Suspicion Weights
          </h3>

          <div className="space-y-3.5 text-xs font-mono">
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-slate-400">
                <span>Face Absence weight:</span>
                <span>{faceMissing} pt</span>
              </div>
              <input 
                type="range" min={0} max={100} value={faceMissing} 
                onChange={(e) => setFaceMissing(Number(e.target.value))}
                className="accent-violet-500 bg-slate-950 h-1.5 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-slate-400">
                <span>Multiple Faces weight:</span>
                <span>{multipleFaces} pt</span>
              </div>
              <input 
                type="range" min={0} max={100} value={multipleFaces} 
                onChange={(e) => setMultipleFaces(Number(e.target.value))}
                className="accent-violet-500 bg-slate-950 h-1.5 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-slate-400">
                <span>Phone Detection weight:</span>
                <span>{phoneDetected} pt</span>
              </div>
              <input 
                type="range" min={0} max={100} value={phoneDetected} 
                onChange={(e) => setPhoneDetected(Number(e.target.value))}
                className="accent-violet-500 bg-slate-950 h-1.5 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-slate-400">
                <span>Speech/VAD weight:</span>
                <span>{speechDetected} pt</span>
              </div>
              <input 
                type="range" min={0} max={100} value={speechDetected} 
                onChange={(e) => setSpeechDetected(Number(e.target.value))}
                className="accent-violet-500 bg-slate-950 h-1.5 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-slate-400">
                <span>Tab/App Switch weight:</span>
                <span>{repeatedSwitch} pt</span>
              </div>
              <input 
                type="range" min={0} max={100} value={repeatedSwitch} 
                onChange={(e) => setRepeatedSwitch(Number(e.target.value))}
                className="accent-violet-500 bg-slate-950 h-1.5 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-slate-400">
                <span>Liveness Test Failure weight:</span>
                <span>{livenessFailure} pt</span>
              </div>
              <input 
                type="range" min={0} max={100} value={livenessFailure} 
                onChange={(e) => setLivenessFailure(Number(e.target.value))}
                className="accent-violet-500 bg-slate-950 h-1.5 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </Card>
      </div>

      {/* Security Policies */}
      <Card className="p-5 bg-slate-900 border-slate-800 flex flex-col gap-4">
        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
          <ShieldCheck size={14} className="text-violet-400" />
          Proctoring Security Policies
        </h3>

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 text-xs font-mono">
          <label className="flex items-center gap-2 p-3 bg-slate-950 border border-slate-850 rounded cursor-pointer select-none">
            <input 
              type="checkbox" checked={allowClipboard} 
              onChange={(e) => setAllowClipboard(e.target.checked)}
              className="accent-violet-500"
            />
            <span>Allow Clipboard Sync</span>
          </label>
          <label className="flex items-center gap-2 p-3 bg-slate-950 border border-slate-850 rounded cursor-pointer select-none">
            <input 
              type="checkbox" checked={requireLiveness} 
              onChange={(e) => setRequireLiveness(e.target.checked)}
              className="accent-violet-500"
            />
            <span>Enforce Liveness Challenge</span>
          </label>
          <label className="flex items-center gap-2 p-3 bg-slate-950 border border-slate-850 rounded cursor-pointer select-none">
            <input 
              type="checkbox" checked={requireVAD} 
              onChange={(e) => setRequireVAD(e.target.checked)}
              className="accent-violet-500"
            />
            <span>Require VAD Mic check</span>
          </label>
          <label className="flex items-center gap-2 p-3 bg-slate-950 border border-slate-850 rounded cursor-pointer select-none">
            <input 
              type="checkbox" checked={enforceKiosk} 
              onChange={(e) => setEnforceKiosk(e.target.checked)}
              className="accent-violet-500"
            />
            <span>Block Multi-monitor checks</span>
          </label>
        </div>
      </Card>

      {/* Departments & Faculty Mapping Section */}
      <Card className="p-5 bg-slate-900 border-slate-800 flex flex-col gap-4">
        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
          <Building2 size={14} className="text-violet-400" />
          Academic Departments ({departments.length})
        </h3>

        {/* List of departments */}
        <div className="space-y-2">
          {departments.map((dep) => (
            <div 
              key={dep.code}
              className="flex justify-between items-center bg-slate-950 border border-slate-850 p-3 rounded font-mono text-xs"
            >
              <div>
                <span className="font-bold text-white">{dep.name}</span>
                <span className="ml-2 text-slate-500">[{dep.code}]</span>
              </div>
              <button 
                type="button"
                onClick={() => handleRemoveDepartment(dep.code)}
                className="text-red-400 hover:text-red-500"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {departments.length === 0 && (
            <p className="py-4 text-xs font-mono text-slate-500 text-center">No departments created yet.</p>
          )}
        </div>

        {/* Add department form */}
        <div className="flex gap-2.5 pt-2">
          <input 
            type="text" 
            placeholder="Department Name (e.g. Science)" 
            value={newDepName}
            onChange={(e) => setNewDepName(e.target.value)}
            className="flex-1 bg-slate-950 border border-slate-800 text-xs rounded px-2.5 py-1.5 text-slate-300 focus:outline-none"
          />
          <input 
            type="text" 
            placeholder="Code (e.g. SCI)" 
            value={newDepCode}
            onChange={(e) => setNewDepCode(e.target.value)}
            className="w-32 bg-slate-950 border border-slate-800 text-xs rounded px-2.5 py-1.5 text-slate-300 focus:outline-none"
          />
          <button 
            type="button"
            onClick={handleAddDepartment}
            className="px-3.5 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded text-xs font-bold transition flex items-center gap-1"
          >
            <Plus size={13} /> Add
          </button>
        </div>
      </Card>

      <button 
        type="button"
        onClick={handleSaveSettings}
        className="w-full py-2 bg-violet-600 hover:bg-violet-700 text-white rounded font-bold transition flex items-center justify-center gap-1.5 text-xs uppercase tracking-wider"
      >
        <Save size={14} />
        Save Institution Configurations
      </button>

    </div>
  );
}
