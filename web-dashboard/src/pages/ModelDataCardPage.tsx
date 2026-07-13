import { useState, useMemo } from "react";
import { 
  BrainCircuit, 
  Database, 
  Cpu, 
  FileText, 
  ShieldAlert, 
  UserCheck, 
  Camera, 
  Volume2, 
  Phone, 
  Activity, 
  Server, 
  Lock, 
  Scale,
  ExternalLink,
  ChevronRight,
  Eye,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  BarChart3,
  Layers,
  PieChart
} from "lucide-react";
import { Card, PageHeader, Badge } from "../components/ui";
import { 
  Area, 
  AreaChart, 
  Bar, 
  BarChart, 
  Line, 
  LineChart, 
  ResponsiveContainer, 
  Tooltip, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Legend 
} from "recharts";

interface ModelDetails {
  name: string;
  provider: string;
  license: string;
  description: string;
  architecture: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  latency: string;
  inputs: string;
  outputs: string;
  formula: string;
  formulaName: string;
}

export function ModelDataCardPage() {
  const [activeTab, setActiveTab] = useState<"model" | "institutional" | "predictive" | "management">("model");
  const [selectedModel, setSelectedModel] = useState<number>(0);

  // Model specs details
  const models: ModelDetails[] = [
    {
      name: "Google ML Kit Face Detection",
      provider: "Google",
      license: "Google APIs Terms of Service (Proprietary / Free)",
      description: "Performs real-time face tracking and pose estimation on the edge. Used to confirm student presence and detect secondary screen viewing anomalies.",
      architecture: "Mobile-optimized Single Shot Detector (SSD) face locator with landmark regressor.",
      accuracy: 98.4,
      precision: 97.6,
      recall: 99.1,
      f1: 98.3,
      latency: "14 ms",
      inputs: "Camera frame buffer (NV21 / YUV_420_888 format)",
      outputs: "Bounding boxes, landmark coordinates, and Euler angles (Yaw, Roll)",
      formulaName: "Head Pose Anomaly Trigger",
      formula: "FaceStatus = LOOKING_AWAY if |Yaw| > 28° or |Roll| > 22°"
    },
    {
      name: "MobileFaceNet Identity Verification",
      provider: "Open-Source Community / Sheng Chen et al.",
      license: "MIT License / Apache 2.0",
      description: "Generates high-fidelity face embeddings to compare the active candidate with the registered student profile during authentication and periodically during exams.",
      architecture: "Lightweight MobileFaceNet CNN optimized for high-accuracy face verification on mobile processors.",
      accuracy: 96.8,
      precision: 96.2,
      recall: 97.4,
      f1: 96.8,
      latency: "38 ms (TFLite CPU)",
      inputs: "112x112 pixel cropped grayscale face image, normalized via (x - 127.5) / 128.0",
      outputs: "192-dimensional floating-point vector embedding",
      formulaName: "Normalized Euclidean Distance Matcher",
      formula: "d(u_live, u_profile) = √Σ (u_live,i - u_profile,i)² < 0.60"
    },
    {
      name: "Google ML Kit Image Labeling (Phone Detector)",
      provider: "Google",
      license: "Google APIs Terms of Service (Proprietary / Free)",
      description: "Analyzes the video frame labels to flag secondary device usage (e.g., smartphones, tablets) in the candidate's immediate environment.",
      architecture: "Quantized MobileNetV2 image classification network running on-device.",
      accuracy: 92.1,
      precision: 90.5,
      recall: 93.8,
      f1: 92.1,
      latency: "22 ms",
      inputs: "Downscaled camera frame bitmap",
      outputs: "A list of labeled entities with associated confidence scores (0.0 to 1.0)",
      formulaName: "Phone Recognition Flag",
      formula: "PhoneDetected = true if Max(Confidence[phone_synonyms]) >= 0.55"
    },
    {
      name: "Google ML Kit Text Recognition (OCR Engine)",
      provider: "Google",
      license: "Google APIs Terms of Service (Proprietary / Free)",
      description: "Digitizes handwritten physical sheets via a multi-stage local image enhancement pipeline, inserting answers directly into text fields.",
      architecture: "Convolutional neural network + CTC recurrent network optimized for text line detection and transcription.",
      accuracy: 94.5,
      precision: 93.1,
      recall: 95.8,
      f1: 94.4,
      latency: "450 ms (Pre-processed bitmap)",
      inputs: "Enhanced, shadow-removed grayscale bitmap (maximum side 1800px)",
      outputs: "Hierarchical block, paragraph, line, and element text strings",
      formulaName: "Shadow-Removing Division Normalization",
      formula: "I_norm(x,y) = Min(255, Max(0, [I(x,y) * 255] / μ_local(x,y)))"
    }
  ];

  // Schema metrics for operational log collections
  const telemetryData = [
    {
      type: "Face Embeddings",
      icon: UserCheck,
      source: "Front camera stream via MobileFaceNet TFLite",
      freq: "Session enrollment & 30-sec verification check",
      storage: "On-device local SQLite database / Android SharedPreferences",
      privacy: "High",
      privacyDesc: "Strictly local. Embeddings cannot reconstruct images; never uploaded to server."
    },
    {
      type: "Screen Snapshots",
      icon: Camera,
      source: "Device screen buffer capture",
      freq: "Every 2 seconds during active exam",
      storage: "Transient storage in MongoDB Cloud",
      privacy: "Medium",
      privacyDesc: "Compressed, scaled to max 320px width, base64-encoded, and deleted post-exam."
    },
    {
      type: "Suspicion Alerts",
      icon: ShieldAlert,
      source: "AI inference events (App Swapping, Look Away)",
      freq: "Event-driven (triggered on deviation)",
      storage: "MongoDB Database",
      privacy: "Low",
      privacyDesc: "Minimal JSON payloads detailing alert type, timestamp, and severity."
    },
    {
      type: "Ambient Audio Level",
      icon: Volume2,
      source: "Device Microphone via AudioRecord API",
      freq: "Continuous local polling (decibel calculation)",
      storage: "Transient volatile memory (RAM only)",
      privacy: "High",
      privacyDesc: "Only decibel level analyzed locally. No audio recordings are saved or uploaded."
    },
    {
      type: "Document OCR Scans",
      icon: FileText,
      source: "Camera document scanner capture",
      freq: "Manual user trigger on answer submission",
      storage: "MongoDB Exam Answers schema",
      privacy: "Medium",
      privacyDesc: "Digitized text is submitted as the answer sheet. Captured image is deleted."
    }
  ];

  // 1. Weekly violation trend dataset
  const weeklyTrends = [
    { name: "Week 1", AppSwitches: 120, LookAways: 240, Objects: 45 },
    { name: "Week 2", AppSwitches: 150, LookAways: 210, Objects: 50 },
    { name: "Week 3", AppSwitches: 90, LookAways: 180, Objects: 30 },
    { name: "Week 4", AppSwitches: 110, LookAways: 160, Objects: 35 },
    { name: "Week 5", AppSwitches: 60, LookAways: 120, Objects: 20 },
    { name: "Week 6", AppSwitches: 45, LookAways: 85, Objects: 15 },
  ];

  // 2. Predictive Risk indicators
  const riskProjections = [
    { name: "0-20%", Students: 450, color: "#10b981" },
    { name: "20-40%", Students: 180, color: "#06b6d4" },
    { name: "40-60%", Students: 90, color: "#f59e0b" },
    { name: "60-80%", Students: 35, color: "#ef4444" },
    { name: "80-100%", Students: 12, color: "#be123c" },
  ];

  // 3. Behavioral statistics
  const behaviorStats = {
    eyeMovements: 12.4, // avg look aways/hr
    phoneAppearance: 0.8, // avg phones/hr
    audioTriggers: 3.5, // avg decibel triggers/hr
    windowSwitches: 2.1, // avg tab switches/hr
  };

  // 4. Model Versioning for AB Tests comparison
  const modelVersions = [
    { version: "v2.4.1 (Active)", type: "Production", accuracy: 96.8, latency: "38ms", split: "90%", status: "STABLE" },
    { version: "v2.5.0 (Beta)", type: "A/B Test", accuracy: 97.5, latency: "32ms", split: "10%", status: "DEPLOYED" },
    { version: "v2.4.0", type: "Rollback target", accuracy: 95.4, latency: "42ms", split: "0%", status: "ARCHIVED" },
  ];

  return (
    <div className="space-y-6 text-slate-100 font-sans">
      
      {/* Page Header */}
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
        <p className="text-xs font-mono font-bold text-violet-400 uppercase tracking-widest">AI transparency & compliance</p>
        <h2 className="mt-1 text-xl font-bold text-white tracking-wider">AI Analytics & Data Card</h2>
        <p className="mt-2 text-xs text-slate-400">Review training datasets, prediction scoring indicators, A/B test deployments, and model specifications.</p>
      </section>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 text-xs">
        <button
          onClick={() => setActiveTab("model")}
          className={`px-4 py-2 border-b-2 font-mono ${activeTab === "model" ? "border-violet-500 text-white font-bold" : "border-transparent text-slate-400 hover:text-slate-200"}`}
        >
          <span className="flex items-center gap-1.5"><BrainCircuit size={13} /> Model & Data Cards</span>
        </button>
        <button
          onClick={() => setActiveTab("institutional")}
          className={`px-4 py-2 border-b-2 font-mono ${activeTab === "institutional" ? "border-violet-500 text-white font-bold" : "border-transparent text-slate-400 hover:text-slate-200"}`}
        >
          <span className="flex items-center gap-1.5"><BarChart3 size={13} /> Institutional Analytics</span>
        </button>
        <button
          onClick={() => setActiveTab("predictive")}
          className={`px-4 py-2 border-b-2 font-mono ${activeTab === "predictive" ? "border-violet-500 text-white font-bold" : "border-transparent text-slate-400 hover:text-slate-200"}`}
        >
          <span className="flex items-center gap-1.5"><TrendingUp size={13} /> Predictive & Behavioral</span>
        </button>
        <button
          onClick={() => setActiveTab("management")}
          className={`px-4 py-2 border-b-2 font-mono ${activeTab === "management" ? "border-violet-500 text-white font-bold" : "border-transparent text-slate-400 hover:text-slate-200"}`}
        >
          <span className="flex items-center gap-1.5"><Layers size={13} /> Model Management</span>
        </button>
      </div>

      {/* TAB 1: Models and schemas specs */}
      {activeTab === "model" && (
        <div className="grid gap-6 lg:grid-cols-[350px_1fr]">
          
          {/* Models list menu */}
          <div className="space-y-3">
            <h3 className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-500 px-1">Pre-trained Models ({models.length})</h3>
            {models.map((model, idx) => (
              <button
                key={model.name}
                onClick={() => setSelectedModel(idx)}
                className={`w-full text-left p-4 rounded-lg border transition flex items-start gap-3 ${
                  selectedModel === idx
                    ? "bg-violet-950/20 border-violet-500/30 text-white"
                    : "bg-slate-900/60 border-slate-850 hover:bg-slate-800 text-slate-300"
                }`}
                type="button"
              >
                <div className={`mt-0.5 rounded p-1.5 ${
                  selectedModel === idx ? "bg-violet-900/40 text-violet-400" : "bg-slate-950 text-slate-500"
                }`}>
                  {idx === 0 && <Eye size={15} />}
                  {idx === 1 && <UserCheck size={15} />}
                  {idx === 2 && <Phone size={15} />}
                  {idx === 3 && <FileText size={15} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-xs leading-tight">{model.name}</p>
                  <p className="mt-1 text-[9px] text-slate-500 truncate">Provider: {model.provider}</p>
                </div>
              </button>
            ))}

            <Card className="p-4 bg-slate-900 border-slate-850 space-y-2">
              <span className="text-[10px] uppercase font-bold text-slate-500 font-mono flex items-center gap-1">
                <Cpu size={12} className="text-violet-400" />
                Edge Processing
              </span>
              <p className="text-[10px] text-slate-400 leading-normal">
                Models execute locally on students' hardware. Ensures complete data privacy by blocking continuous video streaming uploads.
              </p>
            </Card>
          </div>

          {/* Model Specification Card details */}
          <div className="space-y-6">
            <Card className="p-5 bg-slate-900 border-slate-850 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-bold text-white tracking-wide">
                    {models[selectedModel].name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                    {models[selectedModel].description}
                  </p>
                </div>
                <span className="text-[9px] uppercase font-mono px-2 py-0.5 bg-violet-950/20 border border-violet-500/20 text-violet-400 rounded shrink-0">
                  Pre-trained
                </span>
              </div>

              {/* Specs parameters */}
              <div className="grid gap-3 sm:grid-cols-2 text-xs font-mono">
                <div className="p-3 bg-slate-950 border border-slate-850 rounded">
                  <span className="text-slate-500 block text-[9px] uppercase">Provider</span>
                  <span className="text-slate-350 font-bold">{models[selectedModel].provider}</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-850 rounded">
                  <span className="text-slate-500 block text-[9px] uppercase">Licensing terms</span>
                  <span className="text-slate-350 font-bold truncate block">{models[selectedModel].license}</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-850 rounded sm:col-span-2">
                  <span className="text-slate-500 block text-[9px] uppercase">Model Architecture</span>
                  <span className="text-slate-400 font-sans leading-normal block mt-0.5">{models[selectedModel].architecture}</span>
                </div>
              </div>

              {/* Accuracy scores */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400">Evaluation Metrics</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                  {[
                    { label: "Accuracy", value: models[selectedModel].accuracy },
                    { label: "Precision", value: models[selectedModel].precision },
                    { label: "Recall", value: models[selectedModel].recall },
                    { label: "F1-Score", value: models[selectedModel].f1 }
                  ].map((stat) => (
                    <div key={stat.label} className="bg-slate-950 border border-slate-850 rounded p-3 font-mono">
                      <span className="text-slate-500 block text-[8px] uppercase">{stat.label}</span>
                      <span className="text-white font-black text-sm mt-0.5 block">{stat.value}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Equation */}
              <div className="p-4 bg-slate-950 border border-violet-500/20 rounded relative overflow-hidden font-mono">
                <div className="absolute top-0 left-0 w-1 h-full bg-violet-500" />
                <span className="text-[9px] font-bold uppercase text-violet-400">{models[selectedModel].formulaName}</span>
                <div className="mt-1 text-xs text-violet-200 overflow-x-auto py-1 scrollbar-thin">
                  {models[selectedModel].formula}
                </div>
              </div>
            </Card>

            {/* Privacy Schemas */}
            <Card className="p-5 bg-slate-900 border-slate-850 space-y-4">
              <div>
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
                  Operational Telemetry Schema
                </h3>
                <p className="text-[10px] text-slate-500 font-mono mt-1">Summary of details logged temporarily during exams</p>
              </div>

              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {telemetryData.map((row) => {
                  const Icon = row.icon;
                  return (
                    <div key={row.type} className="p-3 bg-slate-950 border border-slate-850 rounded flex justify-between items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Icon className="text-slate-500" size={14} />
                        <span className="text-xs font-bold text-white">{row.type}</span>
                      </div>
                      <span className={`text-[8.5px] uppercase font-mono px-2 py-0.5 rounded ${
                        row.privacy === "High" ? "bg-emerald-950/20 border border-emerald-500/20 text-emerald-400" : "bg-amber-950/20 border border-amber-500/20 text-amber-400"
                      }`}>
                        {row.privacy} Privacy
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: Institutional Exec Analytics */}
      {activeTab === "institutional" && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="bg-slate-900 border border-slate-800 rounded p-4 text-center font-mono">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Average Risk Score</span>
              <p className="text-2xl font-black text-violet-400 mt-1">42.8%</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded p-4 text-center font-mono">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">AI Accuracy</span>
              <p className="text-2xl font-black text-emerald-400 mt-1">96.5%</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded p-4 text-center font-mono">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">False Positive Rate</span>
              <p className="text-2xl font-black text-amber-400 mt-1">2.1%</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded p-4 text-center font-mono">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">False Negative Rate</span>
              <p className="text-2xl font-black text-red-400 mt-1">1.2%</p>
            </div>
          </div>

          <Card className="p-5 bg-slate-900 border-slate-800">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800 pb-3">
              <Activity className="text-violet-400" size={14} />
              Weekly Violation Trends (Institution-Wide)
            </h3>
            <div className="h-64 rounded bg-slate-950 p-3 mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weeklyTrends}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis dataKey="name" stroke="#64748b" style={{ fontSize: "10px" }} />
                  <YAxis stroke="#64748b" style={{ fontSize: "10px" }} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155" }} />
                  <Legend />
                  <Line type="monotone" dataKey="LookAways" stroke="#8b5cf6" strokeWidth={2.5} />
                  <Line type="monotone" dataKey="AppSwitches" stroke="#3b82f6" strokeWidth={2.5} />
                  <Line type="monotone" dataKey="Objects" stroke="#ef4444" strokeWidth={2.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: Predictive & Behavioral Analytics */}
      {activeTab === "predictive" && (
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          
          <div className="space-y-6">
            {/* Risk Projections Bar Chart */}
            <Card className="p-5 bg-slate-900 border-slate-800">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800 pb-3">
                <PieChart size={14} className="text-violet-400" />
                Student Integrity Risk Distribution
              </h3>
              <div className="h-60 rounded bg-slate-950 p-3 mt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={riskProjections}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                    <XAxis dataKey="name" stroke="#64748b" style={{ fontSize: "10px" }} />
                    <YAxis stroke="#64748b" style={{ fontSize: "10px" }} />
                    <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155" }} />
                    <Bar dataKey="Students" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Behavioral stats breakdown details */}
            <Card className="p-5 bg-slate-900 border-slate-800 space-y-4">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
                Behavioral Metric Frequencies
              </h3>
              <div className="grid gap-3 grid-cols-2 text-center text-xs font-mono">
                <div className="bg-slate-950 border border-slate-850 p-3 rounded">
                  <span className="text-slate-500 block text-[8px] uppercase">Avg Look Aways/Hour</span>
                  <span className="text-white font-bold text-sm mt-0.5 block">{behaviorStats.eyeMovements}</span>
                </div>
                <div className="bg-slate-950 border border-slate-850 p-3 rounded">
                  <span className="text-slate-500 block text-[8px] uppercase">Phone Apperance/Hour</span>
                  <span className="text-white font-bold text-sm mt-0.5 block">{behaviorStats.phoneAppearance}</span>
                </div>
                <div className="bg-slate-950 border border-slate-850 p-3 rounded">
                  <span className="text-slate-500 block text-[8px] uppercase">Audio decibel spikes/Hour</span>
                  <span className="text-white font-bold text-sm mt-0.5 block">{behaviorStats.audioTriggers}</span>
                </div>
                <div className="bg-slate-950 border border-slate-850 p-3 rounded">
                  <span className="text-slate-500 block text-[8px] uppercase">Tab/App Switches/Hour</span>
                  <span className="text-white font-bold text-sm mt-0.5 block">{behaviorStats.windowSwitches}</span>
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            {/* Predictive forecasts card */}
            <Card className="p-5 bg-slate-900 border-slate-800 space-y-4">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
                Predictive Risk Indicators
              </h3>
              <div className="space-y-3.5 text-xs font-mono">
                <div className="p-3.5 bg-slate-950 border border-slate-850 rounded">
                  <span className="text-slate-550 block text-[9.5px] uppercase">High Risk Student Ratio</span>
                  <p className="mt-1 text-sm font-bold text-white">4.2% of current cohort</p>
                  <p className="text-[10px] text-slate-500 font-sans mt-0.5">Forecasts percentage of students likely exceeding 70% risk index.</p>
                </div>
                <div className="p-3.5 bg-slate-950 border border-slate-850 rounded">
                  <span className="text-slate-550 block text-[9.5px] uppercase">Network Drop Hazard</span>
                  <p className="mt-1 text-sm font-bold text-white">1.8% probability</p>
                  <p className="text-[10px] text-slate-500 font-sans mt-0.5">Likelihood of active exam interruptions due to local routing anomalies.</p>
                </div>
                <div className="p-3.5 bg-slate-950 border border-slate-850 rounded">
                  <span className="text-slate-550 block text-[9.5px] uppercase">Liveness Test Bypasses</span>
                  <p className="mt-1 text-sm font-bold text-white">0.5% predicted rate</p>
                  <p className="text-[10px] text-slate-500 font-sans mt-0.5">Probability of static image or video loop feed injections.</p>
                </div>
              </div>
            </Card>
          </div>

        </div>
      )}

      {/* TAB 4: Model Management & A/B testing */}
      {activeTab === "management" && (
        <div className="space-y-6">
          <Card className="p-5 bg-slate-900 border-slate-800 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <RefreshCw size={14} className="text-violet-400 animate-spin" />
                Active Model Versions & A/B Splits
              </h3>
              <button 
                type="button" 
                onClick={() => alert("Model rollback sequence initiated.")}
                className="py-1 px-3 bg-red-950/20 border border-red-500/30 text-red-400 rounded text-[10px] font-mono hover:bg-slate-900 transition"
              >
                Rollback Active Model
              </button>
            </div>

            {/* Model Table */}
            <div className="border border-slate-850 rounded overflow-hidden">
              <table className="w-full text-left font-mono text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-500 border-b border-slate-800 uppercase text-[9px]">
                  <tr>
                    <th className="p-3">Model Version</th>
                    <th className="p-3">Task Type</th>
                    <th className="p-3">AI Accuracy</th>
                    <th className="p-3">Avg Latency</th>
                    <th className="p-3">A/B Traffic split</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 bg-slate-950/40">
                  {modelVersions.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-900">
                      <td className="p-3 font-bold text-white">{item.version}</td>
                      <td className="p-3">{item.type}</td>
                      <td className="p-3 text-emerald-400">{item.accuracy}%</td>
                      <td className="p-3">{item.latency}</td>
                      <td className="p-3 font-bold text-violet-400">{item.split}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

    </div>
  );
}
