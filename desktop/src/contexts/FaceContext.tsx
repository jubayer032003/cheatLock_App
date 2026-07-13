import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { useAuth } from "./AuthContext";
import { useCamera } from "./CameraContext";
import { useToast } from "../hooks/useToast";
import { faceRecognitionService, FaceResultEvent, FaceResultStatus } from "../services/FaceRecognitionService";
import { useSuspicion } from "./SuspicionContext";

interface FaceContextType {
  status: FaceResultStatus;
  similarity: number;
  distance: number;
  trackedFaces: { x: number; y: number; width: number; height: number; id: number }[];
  primaryFaceBox: { x: number; y: number; width: number; height: number; id: number } | null;
  isProctoring: boolean;
  registeredDescriptor: number[] | null;
  setRegisteredFaceProfile: (descriptor: number[]) => void;
  startFaceProctoring: (examId: string) => void;
  stopFaceProctoring: () => void;
}

const FaceContext = createContext<FaceContextType | undefined>(undefined);

export function FaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { pipeline } = useCamera();
  const { showToast } = useToast();
  const { reportViolationEvent } = useSuspicion();

  const [status, setStatus] = useState<FaceResultStatus>("FACE_MISSING");
  const [similarity, setSimilarity] = useState(0);
  const [distance, setDistance] = useState(Number.POSITIVE_INFINITY);
  const [trackedFaces, setTrackedFaces] = useState<{ x: number; y: number; width: number; height: number; id: number }[]>([]);
  const [primaryFaceBox, setPrimaryFaceBox] = useState<{ x: number; y: number; width: number; height: number; id: number } | null>(null);
  const [isProctoring, setIsProctoring] = useState(false);
  const [registeredDescriptor, setRegisteredDescriptor] = useState<number[] | null>(null);

  const examIdRef = useRef<string | null>(null);
  const violationsCountRef = useRef(0);

  // 1. Load cached face profile on user login change
  useEffect(() => {
    if (user) {
      const saved = localStorage.getItem(`cheatlock_face_descriptor_${user.identifier}`);
      if (saved) {
        try {
          const descriptor = JSON.parse(saved) as number[];
          setRegisteredDescriptor(descriptor);
        } catch {
          setRegisteredDescriptor(null);
        }
      } else {
        setRegisteredDescriptor(null);
      }
    } else {
      setRegisteredDescriptor(null);
    }
  }, [user]);

  const setRegisteredFaceProfile = (descriptor: number[]) => {
    if (!user) return;
    localStorage.setItem(`cheatlock_face_descriptor_${user.identifier}`, JSON.stringify(descriptor));
    setRegisteredDescriptor(descriptor);
  };

  const handleFaceResult = async (event: FaceResultEvent) => {
    setStatus(event.status);
    setSimilarity(event.similarity);
    setDistance(event.distance);
    setTrackedFaces(event.allFaceBoxes);
    setPrimaryFaceBox(event.primaryFaceBox);

    const examId = examIdRef.current;
    if (!examId || !user) return;

    // Trigger warnings for anomaly states
    if (event.status !== "FACE_MATCH") {
      violationsCountRef.current += 1;
      // Warning Toast (throttled to avoid spamming the UI)
      if (violationsCountRef.current % 5 === 1) {
        showToast(`AI Alert: ${event.message}`, "warning");
      }

      // Report to centralized suspicion score engine
      reportViolationEvent(event.status, "Face", 1.0, event.message);
    }
  };

  const startFaceProctoring = (examId: string) => {
    examIdRef.current = examId;
    violationsCountRef.current = 0;
    setIsProctoring(true);
    
    // Start continuous evaluation on pipeline frame events
    faceRecognitionService.start(pipeline, registeredDescriptor);
    faceRecognitionService.registerListener(handleFaceResult);
  };

  const stopFaceProctoring = () => {
    examIdRef.current = null;
    setIsProctoring(false);
    
    faceRecognitionService.unregisterListener(handleFaceResult);
    faceRecognitionService.stop();

    setStatus("FACE_MISSING");
    setSimilarity(0);
    setDistance(Number.POSITIVE_INFINITY);
    setTrackedFaces([]);
    setPrimaryFaceBox(null);
  };

  return (
    <FaceContext.Provider
      value={{
        status,
        similarity,
        distance,
        trackedFaces,
        primaryFaceBox,
        isProctoring,
        registeredDescriptor,
        setRegisteredFaceProfile,
        startFaceProctoring,
        stopFaceProctoring,
      }}
    >
      {children}
    </FaceContext.Provider>
  );
}

export function useFace() {
  const context = useContext(FaceContext);
  if (!context) {
    throw new Error("useFace must be used inside a FaceProvider");
  }
  return context;
}
