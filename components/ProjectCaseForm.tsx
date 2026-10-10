import React, { useState, useRef, useEffect, useMemo } from "react";
import _ from "lodash";
import PhotoUploader from "./PhotoUploader";
import PhotoAnnotator from "./PhotoAnnotator";
import FormField from "./FormField";
import Spinner from "./Spinner";
import { resizeImage } from "../utils/imageUtils";
import { User, Project, AnalysisResult, ProjectCase, PhotoAnnotation } from "../types";
import SearchableSelect from "./SearchableSelect";
import { getEffectivePermissions } from "../utils/permissionUtils";
import { DEPARTMENTS } from "../constants";
import { useLoading } from "../contexts/LoadingContext";
import { analyzeProjectCase } from "../services/geminiService";

interface ProjectCaseFormProps {
  currentUser: User;
  projects: Project[];
  onCaseSaved?: (savedCase: ProjectCase) => void;
}

const ProjectCaseForm: React.FC<ProjectCaseFormProps> = ({
  currentUser,
  projects,
  onCaseSaved,
}) => {
  const { showLoading, hideLoading } = useLoading();
  const [projectName, setProjectName] = useState("");
  const [projectZone, setProjectZone] = useState("");
  const [caseName, setCaseName] = useState("");
  const [liableDept, setLiableDept] = useState("");
  const [comments, setComments] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<PhotoAnnotation[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const permissions = getEffectivePermissions(currentUser);
  const canEdit = permissions.projectCase?.edit;

  const projectNames = useMemo(
    () => _.uniq(projects.map((p) => p.name || "Unnamed")).sort(),
    [projects],
  );
  const projectZoneMap = useMemo(
    () =>
      projects.reduce(
        (acc, project) => {
          acc[project.name] = project.zone;
          return acc;
        },
        {} as Record<string, string>,
      ),
    [projects],
  );

  useEffect(() => {
    if (!isCameraOpen) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      return;
    }

    let isCancelled = false;
    const videoEl = videoRef.current;

    const startCamera = async () => {
      if (!videoEl) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (isCancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        videoEl.srcObject = stream;
        videoEl.play();
      } catch (err) {
        console.error("Error accessing camera:", err);
        setError("Could not access camera. Please check permissions.");
        setIsCameraOpen(false);
      }
    };

    startCamera();

    return () => {
      isCancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isCameraOpen]);

  const handleProjectNameChange = (selectedProject: string) => {
    setProjectName(selectedProject);
    const zone = projectZoneMap[selectedProject] || "";
    setProjectZone(zone);
  };

  const handleFieldChange =
    (setter: React.Dispatch<React.SetStateAction<string>>) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setter(e.target.value);
    };

  const handleLiableDeptChange = (value: string) => {
    setLiableDept(value);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const resized = await resizeImage(reader.result as string);
          setPhoto(resized);
        } catch (err) {
          setError("Failed to process image.");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemovePhoto = () => {
    setPhoto(null);
    setAnnotations([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleOpenCamera = () => setIsCameraOpen(true);
  const closeCamera = () => {
    setCapturedImage(null);
    setIsCameraOpen(false);
  };

  const handleCapture = () => {
    if (videoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const context = canvas.getContext("2d");
      if (context) {
        context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        setCapturedImage(canvas.toDataURL("image/jpeg"));
      }
    }
  };

  const handleRetake = () => setCapturedImage(null);

  const handleUsePhoto = async () => {
    if (!capturedImage) return;
    try {
      const resized = await resizeImage(capturedImage);
      setPhoto(resized);
      closeCamera();
    } catch (err) {
      setError("Failed to process captured photo.");
      closeCamera();
    }
  };

  const resetForm = () => {
    setProjectName("");
    setProjectZone("");
    setCaseName("");
    setLiableDept("");
    setComments("");
    setPhoto(null);
    setAnnotations([]);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!projectName.trim()) {
      setError("Please select a project.");
      return;
    }
    if (!caseName.trim()) {
      setError("Please enter a case name.");
      return;
    }
    if (!liableDept.trim()) {
      setError("Please select the liable department.");
      return;
    }
    if (!photo) {
      setError("Please add a visual for the case.");
      return;
    }
    setIsSubmitting(true);
    showLoading();
    setError(null);

    const analysisResult = await analyzeProjectCase(caseName, comments, photo);

    const newCase: ProjectCase = {
      id: Date.now() + Math.random(),
      projectName,
      projectZone,
      caseName: caseName.trim(),
      liableDept,
      comments: comments.trim(),
      photo,
      annotations,
      category: analysisResult?.category || "Other",
      priority: analysisResult?.priority || "Low",
      summary: analysisResult?.summary || "",
      reporter: currentUser.name || "Unknown",
      reporterId: currentUser.id,
      date: new Date().toISOString().split("T")[0],
      createdAt: new Date().toISOString(),
    };

    try {
      const res = await fetch("/api/project_cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCase),
      });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);

      const saved: ProjectCase = await res.json().catch(() => newCase);
      onCaseSaved?.(saved);

      const alertMessage = analysisResult
        ? `Case report submitted successfully! AI classified this as a '${analysisResult.category}' issue with '${analysisResult.priority}' priority.`
        : "Case report submitted successfully! (AI analysis was not available).";
      alert(alertMessage);
      resetForm();
    } catch (err) {
      console.error("Failed to save case report", err);
      setError("Failed to submit case report. Please check your connection and try again.");
    } finally {
      hideLoading();
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="bg-white rounded-2xl shadow-lg border-slate-200">
          <header className="bg-slate-50 p-4 border-b border-slate-200 rounded-t-2xl">
            <div className="text-center">
              <h1 className="text-xl font-bold text-slate-800">
                Project Case Report
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {canEdit
                  ? "Fill out the details for the project case."
                  : "You are viewing this form in read-only mode."}
              </p>
            </div>
          </header>
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6">
            <fieldset disabled={!canEdit || isSubmitting} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SearchableSelect
                  id="projectName"
                  label="Project Name*"
                  options={projectNames}
                  value={projectName}
                  onChange={handleProjectNameChange}
                  placeholder="Select a project"
                  required
                />
                <FormField
                  id="projectZone"
                  label="Project Zone"
                  value={projectZone}
                  onChange={() => {}}
                  placeholder="Auto-fills from Project Name"
                  readOnly
                />
              </div>
              <FormField
                id="caseName"
                label="Case Name*"
                value={caseName}
                onChange={handleFieldChange(setCaseName)}
                placeholder="e.g., Column Crack at Level 3"
                required
              />
              <SearchableSelect
                id="liableDept"
                label="Liable Dept.*"
                options={DEPARTMENTS}
                value={liableDept}
                onChange={handleLiableDeptChange}
                placeholder="Type or select a department"
                required
                readOnly={!canEdit}
              />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Case Photo
                </label>
                {photo ? (
                  <div className="mt-2 max-w-md">
                    <PhotoAnnotator
                      photo={photo}
                      annotations={annotations}
                      onChange={setAnnotations}
                      editable={canEdit}
                    />
                    {canEdit && (
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        className="mt-2 text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        Remove photo
                      </button>
                    )}
                  </div>
                ) : (
                  canEdit && (
                    <div className="mt-2">
                      <PhotoUploader
                        id="case-visual-upload"
                        onFileChange={handleFileChange}
                        onCameraClick={handleOpenCamera}
                        fileInputRef={fileInputRef}
                      />
                    </div>
                  )
                )}
              </div>
              <FormField
                id="comments"
                label="Description / Comments"
                as="textarea"
                value={comments}
                onChange={handleFieldChange(setComments)}
                placeholder="Add any details or comments about this case."
              />

              {error && (
                <p className="text-sm text-red-600 text-center p-2 bg-red-50 rounded-md">
                  {error}
                </p>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || !canEdit}
                  className="w-full inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:bg-slate-400 disabled:cursor-not-allowed hover:-translate-y-0.5 active:translate-y-0 disabled:transform-none"
                >
                  {isSubmitting ? (
                    <>
                      <Spinner className="w-5 h-5 mr-3" />
                      Submitting...
                    </>
                  ) : (
                    "Submit Case Report"
                  )}
                </button>
              </div>
            </fieldset>
          </form>
        </div>
      </div>
      {isCameraOpen && (
        <div
          className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="camera-title"
        >
          <h2 id="camera-title" className="sr-only">
            Camera View
          </h2>
          <div className="relative w-full h-full flex items-center justify-center">
            {!capturedImage ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              ></video>
            ) : (
              <img
                src={capturedImage}
                alt="Captured preview"
                className="w-full h-full object-contain"
              />
            )}
            <button
              onClick={closeCamera}
              className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full"
              aria-label="Close camera"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-black/50 flex items-center justify-center space-x-4">
            {!capturedImage ? (
              <button
                onClick={handleCapture}
                className="p-4 bg-white rounded-full text-slate-800"
                aria-label="Capture photo"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-8 w-8"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </button>
            ) : (
              <>
                <button
                  onClick={handleRetake}
                  className="p-3 bg-white/90 text-slate-800 rounded-full flex items-center gap-2 text-base sm:text-lg font-semibold px-4 sm:px-6"
                  aria-label="Retake photo"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
                    />
                  </svg>
                  Retake
                </button>
                <button
                  onClick={handleUsePhoto}
                  className="p-3 bg-orange-600 text-white rounded-full flex items-center gap-2 text-base sm:text-lg font-semibold px-4 sm:px-6"
                  aria-label="Use this photo"
                >
                  Use Photo
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default ProjectCaseForm;
