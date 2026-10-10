import React, { useState, useEffect, useMemo, useRef } from "react";
import Papa from "papaparse";
import { parseCSVRobustly } from "../utils/csvUtils";
import {
  Project,
  User,
  FeaturedProject,
  AllEmployee,
  SaleableProject,
} from "../types";
import { ZONES } from "../constants";
import FormField from "./FormField";
import SearchableSelect from "./SearchableSelect";
import Spinner from "./Spinner";
import { getEffectivePermissions } from "../utils/permissionUtils";
import { useToast } from "../hooks/useToast";
import { Toast } from "./Toast";

type SystemManagementTab =
  | "addProject"
  | "projectList"
  | "dashboardSettings"
  | "systemEntries"
  | "employeeList"
  | "preferredProjects";

interface SystemManagementProps {
  currentUser: User;
  projects: Project[];
  featuredProject: FeaturedProject;
  onAddProject: (projectData: Omit<Project, "id">) => Promise<void>;
  onUpdateProject: (updatedProject: Project) => Promise<void>;
  onDeleteProject: (projectId: number) => Promise<void>;
  onUpdateFeaturedProject: (newData: Partial<FeaturedProject>) => Promise<void>;
  onAddSystemEntry: (entryData: {
    entry_name: string;
    entry_type: string;
    description: string;
  }) => Promise<void>;
  allEmployees: AllEmployee[];
  setAllEmployees: React.Dispatch<React.SetStateAction<AllEmployee[]>>;
}

const EditProjectModal: React.FC<{
  isOpen: boolean;
  project: Project | null;
  onClose: () => void;
  onSave: (updatedProject: Project) => void;
  isSaving: boolean;
}> = ({ isOpen, project, onClose, onSave, isSaving }) => {
  const [name, setName] = useState("");
  const [zone, setZone] = useState("");
  const [address, setAddress] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setZone(project.zone);
      setAddress(project.address);
    }
  }, [project]);

  useEffect(() => {
    if (!isOpen) return;
    const modalElement = modalRef.current;
    if (!modalElement) return;

    const focusableElements = modalElement.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    firstElement.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    };
    modalElement.addEventListener("keydown", handleKeyDown);
    return () => modalElement.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!isOpen || !project) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ ...project, name, zone, address });
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-project-title"
    >
      <div
        ref={modalRef}
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <fieldset disabled={isSaving}>
            <div className="p-6">
              <h2
                id="edit-project-title"
                className="text-xl font-bold text-slate-800"
              >
                Edit Project
              </h2>
              <div className="mt-6 space-y-4">
                <FormField
                  id="editProjectName"
                  label="Project Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter project name"
                  required
                />
                <SearchableSelect
                  id="editProjectZone"
                  label="Project Zone"
                  options={ZONES}
                  value={zone}
                  onChange={setZone}
                  placeholder="Select a zone"
                  required
                />
                <FormField
                  id="editProjectAddress"
                  label="Project Address"
                  as="textarea"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Enter full address"
                  required
                />
              </div>
            </div>
            <div className="bg-white/40 backdrop-blur-md px-6 py-4 rounded-b-xl border-t border-white flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center justify-center w-32 px-4 py-2 text-sm font-medium text-white bg-orange-600 border border-transparent rounded-md shadow-sm hover:bg-orange-700 disabled:bg-slate-400"
              >
                {isSaving ? <Spinner /> : "Save Changes"}
              </button>
            </div>
          </fieldset>
        </form>
      </div>
    </div>
  );
};

const DeleteConfirmationModal: React.FC<{
  project: Project | null;
  onClose: () => void;
  onConfirm: () => void;
  isSaving: boolean;
}> = ({ project, onClose, onConfirm, isSaving }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!project) return;
    const modalElement = modalRef.current;
    if (!modalElement) return;

    const focusableElements = modalElement.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    firstElement.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    };
    modalElement.addEventListener("keydown", handleKeyDown);
    return () => modalElement.removeEventListener("keydown", handleKeyDown);
  }, [project]);

  if (!project) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-project-title"
    >
      <div
        ref={modalRef}
        className="bg-white rounded-xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        aria-describedby="delete-project-description"
      >
        <div className="p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2
            id="delete-project-title"
            className="text-xl font-bold text-slate-800 mt-4"
          >
            Delete Project
          </h2>
          <p
            id="delete-project-description"
            className="mt-2 text-sm text-slate-500"
          >
            Are you sure you want to delete the project{" "}
            <strong className="text-slate-700">{project.name}</strong>? This
            action cannot be undone.
          </p>
        </div>
        <div className="bg-slate-50 px-6 py-4 rounded-b-xl flex justify-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-6 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSaving}
            className="inline-flex items-center justify-center w-36 px-6 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md shadow-sm hover:bg-red-700 disabled:bg-red-400"
          >
            {isSaving ? <Spinner /> : "Confirm Delete"}
          </button>
        </div>
      </div>
    </div>
  );
};

const SystemManagement: React.FC<SystemManagementProps> = ({
  currentUser,
  projects,
  onAddProject,
  onUpdateProject,
  onDeleteProject,
  featuredProject,
  onUpdateFeaturedProject,
  onAddSystemEntry,
  allEmployees,
  setAllEmployees,
}) => {
  const permissions = getEffectivePermissions(currentUser);
  const { toasts, showSuccess, showError, dismiss } = useToast();

  const availableTabs = useMemo(() => {
    const tabs: SystemManagementTab[] = [];
    if (permissions.systemManagement_addProject?.view) tabs.push("addProject");
    if (permissions.systemManagement_projectList?.view)
      tabs.push("projectList");
    if (permissions.systemManagement_dashboardSettings?.view)
      tabs.push("dashboardSettings");
    tabs.push("employeeList");
    tabs.push("preferredProjects");
    tabs.push("systemEntries");
    return tabs;
  }, [permissions]);

  const [activeTab, setActiveTab] = useState<SystemManagementTab>(
    availableTabs[0] ?? "addProject",
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Employee List State
  // const [allEmployees, setAllEmployees] = useState<AllEmployee[]>([]); // Sourced from props
  const [showAllEmployeesTable, setShowAllEmployeesTable] = useState(true);
  const [isFormEditing, setIsFormEditing] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<AllEmployee | null>(null);
  const formSectionRef = useRef<HTMLDivElement>(null);
  const [employeeForm, setEmployeeForm] = useState({
    employeeId: "",
    name: "",
    designation: "",
    department: "",
    email: "",
    phone: "",
    isActive: true,
  });

  // Preferred Projects State
  const [saleableProjects, setSaleableProjects] = useState<SaleableProject[]>(
    [],
  );
  const [newSaleableProject, setNewSaleableProject] = useState("");
  const [isEditingSaleable, setIsEditingSaleable] = useState<number | null>(
    null,
  );
  const [editSaleableName, setEditSaleableName] = useState("");

  useEffect(() => {
    const fetchSaleableProjects = async () => {
      try {
        const res = await fetch("/api/saleable-projects");
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          if (Array.isArray(data)) setSaleableProjects(data);
        } catch (e) {
          console.error(
            "Failed to parse saleable-projects JSON. Response:",
            text.substring(0, 100),
          );
        }
      } catch (err) {
        console.error("Failed to load saleable projects", err);
      }
    };

    fetchSaleableProjects();
  }, []);

  const handleAddAllEmployee = async () => {
    const trimmedId = employeeForm.employeeId.trim();
    if (!trimmedId || !employeeForm.name) {
      showError("Employee ID and Name are required.");
      return;
    }

    // Warn instead of silently overwriting another employee when adding a NEW record
    // with an ID that already exists in the directory.
    if (!isFormEditing) {
      const clash = allEmployees.find(
        (e) => e.employee_id?.trim().toLowerCase() === trimmedId.toLowerCase(),
      );
      if (clash) {
        showError(`Employee ID "${trimmedId}" is already used by ${clash.name}. Use a different ID or edit that employee instead.`);
        return;
      }
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/all-employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...employeeForm, employeeId: trimmedId }),
      });
      if (response.ok) {
        const added = await response.json();
        setAllEmployees((prev) => {
          const filtered = prev.filter(
            (e) => e.employee_id !== added.employee_id,
          );
          return [...filtered, added].sort((a, b) =>
            a.name.localeCompare(b.name),
          );
        });
        resetEmployeeForm();
        showSuccess(isFormEditing ? "Employee updated successfully." : "Employee added successfully.");
      }
    } catch (error) {
      console.error(error);
      showError("Failed to save employee. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const resetEmployeeForm = () => {
    setEmployeeForm({ employeeId: "", name: "", designation: "", department: "", email: "", phone: "", isActive: true });
    setIsFormEditing(false);
  };

  const handleDeleteAllEmployee = async (id: number) => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/all-employees/${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setAllEmployees((prev) => prev.filter((p) => p.id !== id));
        setEmployeeToDelete(null);
        showSuccess("Employee deleted.");
      }
    } catch (error) {
      console.error(error);
      showError("Failed to delete employee.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActiveEmployee = async (emp: AllEmployee) => {
    try {
      const response = await fetch(`/api/all-employees/${emp.id}/toggle-active`, {
        method: "PATCH",
      });
      if (response.ok) {
        const updated = await response.json();
        setAllEmployees((prev) =>
          prev.map((e) => e.id === emp.id ? { ...e, is_active: updated.is_active } : e)
        );
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleDownloadAllEmployeeTemplate = () => {
    const csv = Papa.unparse({
      fields: [
        "Employee ID",
        "Name",
        "Designation",
        "Department",
        "Email",
        "Phone",
        "Status",
      ],
      data: [
        [
          "EMP-001",
          "John Doe",
          "Manager",
          "Sales",
          "john@example.com",
          "01700000000",
          "Active",
        ],
      ],
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "all_employees_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Exports the Employee Directory, respecting whatever search/status
  // filter is currently applied (same filter logic used by the table).
  const handleExportAllEmployees = () => {
    const filtered = allEmployees
      .filter(emp =>
        employeeStatusFilter === "active" ? !!emp.is_active :
        employeeStatusFilter === "inactive" ? !emp.is_active : true
      )
      .filter(emp => {
        if (!employeeSearchQuery.trim()) return true;
        const q = employeeSearchQuery.toLowerCase();
        return (
          emp.name?.toLowerCase().includes(q) ||
          emp.employee_id?.toLowerCase().includes(q) ||
          emp.designation?.toLowerCase().includes(q) ||
          emp.department?.toLowerCase().includes(q) ||
          emp.email?.toLowerCase().includes(q) ||
          emp.phone?.toLowerCase().includes(q)
        );
      });

    if (filtered.length === 0) {
      showError("No employees to export with the current filter.");
      return;
    }

    const csv = Papa.unparse({
      fields: [
        "Employee ID",
        "Name",
        "Designation",
        "Department",
        "Email",
        "Phone",
        "Status",
      ],
      data: filtered.map((emp) => [
        emp.employee_id,
        emp.name,
        emp.designation || "",
        emp.department || "",
        emp.email || "",
        emp.phone || "",
        emp.is_active ? "Active" : "Inactive",
      ]),
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const statusSuffix = employeeStatusFilter !== "all" ? `_${employeeStatusFilter}` : "";
    link.setAttribute(
      "download",
      `employee_list${statusSuffix}_${new Date().toISOString().split("T")[0]}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showSuccess(`Exported ${filtered.length} employee(s).`);
  };

  const handleBulkAllEmployeeUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    parseCSVRobustly(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results: any) => {
        const rawEmployees = results.data
          .map((row: any) => ({
            employeeId: row["Employee ID"]?.trim?.() ?? row["Employee ID"],
            name: row["Name"],
            designation: row["Designation"],
            department: row["Department"],
            email: row["Email"],
            phone: row["Phone"],
            isActive: row["Status"]?.toLowerCase() !== "inactive",
          }))
          .filter((e: any) => e.employeeId && e.name);

        if (rawEmployees.length === 0) {
          showError("No valid employee data found.");
          return;
        }

        // De-dupe within the same file: same Employee ID keeps only the last row
        // (matches how the server's ON DUPLICATE KEY UPDATE would resolve it anyway),
        // so the success count reflects what was actually saved.
        const byId = new Map<string, any>();
        for (const emp of rawEmployees) {
          byId.set(emp.employeeId.toLowerCase(), emp);
        }
        const employees = Array.from(byId.values());
        const duplicateCount = rawEmployees.length - employees.length;

        setIsSaving(true);
        try {
          const response = await fetch("/api/all-employees/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ employees }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(
              "Bulk upload failed. Status:",
              response.status,
              "Response:",
              errorText.substring(0, 500),
            );
            showError("Upload failed. See console for details.");
            return;
          }

          const res = await fetch("/api/all-employees");
          const data = await res.json();
          setAllEmployees(data);
          showSuccess(
            duplicateCount > 0
              ? `Successfully imported ${employees.length} employees. Skipped ${duplicateCount} duplicate row(s) with a repeated Employee ID.`
              : `Successfully imported ${employees.length} employees.`,
          );
        } catch (err) {
          console.error("Error during bulk upload:", err);
          showError("Error uploading employee list.");
        } finally {
          setIsSaving(false);
        }
        if (e.target) e.target.value = "";
      },
    });
  };

  const handleAddSaleableProject = async () => {
    if (!newSaleableProject) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/saleable-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName: newSaleableProject }),
      });
      if (response.ok) {
        const added = await response.json();
        setSaleableProjects((prev) =>
          [...prev.filter((p) => p.id !== added.id), added].sort((a, b) =>
            a.project_name.localeCompare(b.project_name),
          ),
        );
        setNewSaleableProject("");
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateSaleableProject = async (id: number) => {
    if (!editSaleableName) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/saleable-projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName: editSaleableName }),
      });
      if (response.ok) {
        const updated = await response.json();
        setSaleableProjects((prev) =>
          prev.map((p) => (p.id === id ? updated : p)),
        );
        setIsEditingSaleable(null);
        setEditSaleableName("");
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearSaleableProjects = async () => {
    if (
      !window.confirm(
        "Are you sure you want to clear the entire Preferred Projects list?",
      )
    )
      return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/saleable-projects", {
        method: "DELETE",
      });
      if (response.ok) {
        setSaleableProjects([]);
        alert("List cleared successfully.");
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportSaleableProjects = () => {
    if (saleableProjects.length === 0) {
      alert("Nothing to export.");
      return;
    }
    const csv = Papa.unparse({
      fields: ["ID", "Project Name"],
      data: saleableProjects.map((p) => [p.id, p.project_name]),
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `preferred_projects_${new Date().toISOString().split("T")[0]}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteSaleableProject = async (id: number) => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/saleable-projects/${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setSaleableProjects((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadSaleableTemplate = () => {
    const csv = Papa.unparse({
      fields: ["Project Name"],
      data: [["Project Name Example A"], ["Project Name Example B"]],
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "saleable_projects_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkSaleableUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    parseCSVRobustly(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results: any) => {
        const projects = results.data
          .map((row: any) => row["Project Name"])
          .filter(Boolean);
        if (projects.length === 0) {
          alert("No projects found in CSV.");
          return;
        }

        setIsSaving(true);
        try {
          const response = await fetch("/api/saleable-projects/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projects }),
          });
          if (response.ok) {
            const res = await fetch("/api/saleable-projects");
            const data = await res.json();
            setSaleableProjects(data);
            alert(
              `Successfully imported ${projects.length} preferred projects.`,
            );
          }
        } catch (err) {
          alert("Error uploading bulk projects.");
        } finally {
          setIsSaving(false);
        }
        if (e.target) e.target.value = "";
      },
    });
  };

  // Form state for adding
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectZone, setNewProjectZone] = useState("");
  const [newProjectAddress, setNewProjectAddress] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state for system entries
  const [newSystemEntry, setNewSystemEntry] = useState({
    entry_name: "",
    entry_type: "",
    description: "",
  });

  const handleAddSystemEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    await onAddSystemEntry(newSystemEntry);
    setIsSaving(false);
    setNewSystemEntry({ entry_name: "", entry_type: "", description: "" });
    alert("System entry added successfully!");
  };

  // Form state for dashboard settings
  const [featuredData, setFeaturedData] =
    useState<FeaturedProject>(featuredProject);

  useEffect(() => {
    setFeaturedData(featuredProject);
  }, [featuredProject]);

  // State for filtering
  const [searchQuery, setSearchQuery] = useState("");
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState("");
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Modal state
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);


  const canEditAddProject = permissions.systemManagement_addProject?.edit;
  const canEditProjectList = permissions.systemManagement_projectList?.edit;
  const canEditDashboardSettings =
    permissions.systemManagement_dashboardSettings?.edit;

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName || !newProjectZone || !newProjectAddress) {
      setError("All fields are required to add a project.");
      return;
    }
    setError(null);
    setIsSaving(true);

    await onAddProject({
      name: newProjectName,
      zone: newProjectZone,
      address: newProjectAddress,
    });

    setIsSaving(false);
    setNewProjectName("");
    setNewProjectZone("");
    setNewProjectAddress("");
    alert(`Project "${newProjectName}" added successfully!`);
    if (availableTabs.includes("projectList")) {
      setActiveTab("projectList"); // Switch to list view after adding
    }
  };

  const handleDownloadTemplate = () => {
    const headers = ["Project Name", "Project Zone", "Project Address"];
    const exampleData = [
      ["Example Project A", "Zone 1", "123 Dhaka St, Dhaka"],
      ["Example Project B", "Zone 2", "456 Chittagong Rd, Chittagong"],
    ];

    const csv = Papa.unparse({
      fields: headers,
      data: exampleData,
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "project_bulk_upload_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkProjectUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    parseCSVRobustly(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results: any) => {
        const data = results.data as any[];
        let successCount = 0;
        let errorCount = 0;

        setIsSaving(true);
        for (const row of data) {
          const name = row["Project Name"];
          const zone = row["Project Zone"];
          const address = row["Project Address"];

          if (name && zone && address) {
            try {
              await onAddProject({ name, zone, address });
              successCount++;
            } catch (err) {
              console.error("Error adding project:", row, err);
              errorCount++;
            }
          } else {
            errorCount++;
          }
        }
        setIsSaving(false);

        if (successCount > 0) {
          alert(
            `Successfully added ${successCount} projects.${errorCount > 0 ? ` Failed to add ${errorCount} projects.` : ""}`,
          );
          if (availableTabs.includes("projectList")) {
            setActiveTab("projectList");
          }
        } else if (errorCount > 0) {
          alert(`Failed to add any projects. Please check the file format.`);
        }

        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      },
      error: (err) => {
        console.error("CSV Parsing Error:", err);
        alert("Error parsing CSV file.");
      },
    });
  };

  const handleFeaturedDataChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFeaturedData((prev) => ({ ...prev, [id]: value }));
  };

  const handleFeaturedImageChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        if (result) {
          setFeaturedData((prev) => ({ ...prev, image: result }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveDashboardSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    await onUpdateFeaturedProject({
      ...featuredData,
      completion: Number(featuredData.completion) || 0,
    });
    setIsSaving(false);
    alert("Dashboard settings updated successfully!");
  };

  const handleSaveProjectUpdate = async (updatedProject: Project) => {
    setIsSaving(true);
    await onUpdateProject(updatedProject);
    setIsSaving(false);
    setProjectToEdit(null);
  };

  const handleConfirmDelete = async () => {
    if (projectToDelete) {
      setIsSaving(true);
      await onDeleteProject(projectToDelete.id);
      setIsSaving(false);
      setProjectToDelete(null);
    }
  };



  const filteredProjects = useMemo(() => {
    if (!searchQuery) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.zone.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.address.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [projects, searchQuery]);

  const getTabClasses = (tab: SystemManagementTab) => {
    return activeTab === tab
      ? "border-orange-500 text-orange-600"
      : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300";
  };

  return (
    <>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="bg-white/40 backdrop-blur-md p-6 rounded-xl border border-white shadow-sm">
          <h2 className="text-2xl font-bold text-slate-800">
            System Management
          </h2>
          <p className="text-slate-600 font-medium mt-1">
            Manage projects and dashboard settings.
          </p>
        </div>

        <div className="bg-white/40 backdrop-blur-md rounded-xl border border-white shadow-sm">
          <div className="border-b border-white px-6 pt-2">
            <nav className="flex gap-x-2" aria-label="Tabs">
              {availableTabs.includes("addProject") && (
                <button
                  onClick={() => setActiveTab("addProject")}
                  className={`whitespace-nowrap py-3 px-4 rounded-t-lg font-medium text-sm transition-colors ${getTabClasses("addProject")}`}
                >
                  Add Project
                </button>
              )}
              {availableTabs.includes("projectList") && (
                <button
                  onClick={() => setActiveTab("projectList")}
                  className={`whitespace-nowrap py-3 px-4 rounded-t-lg font-medium text-sm transition-colors ${getTabClasses("projectList")}`}
                >
                  Project List ({projects.length})
                </button>
              )}
              {availableTabs.includes("dashboardSettings") && (
                <button
                  onClick={() => setActiveTab("dashboardSettings")}
                  className={`whitespace-nowrap py-3 px-4 rounded-t-lg font-medium text-sm transition-colors ${getTabClasses("dashboardSettings")}`}
                >
                  Dashboard Settings
                </button>
              )}
              <button
                onClick={() => setActiveTab("employeeList")}
                className={`whitespace-nowrap py-3 px-4 rounded-t-lg font-medium text-sm transition-colors ${getTabClasses("employeeList")}`}
              >
                Employee List ({allEmployees.length})
              </button>
              <button
                onClick={() => setActiveTab("preferredProjects")}
                className={`whitespace-nowrap py-3 px-4 rounded-t-lg font-medium text-sm transition-colors ${getTabClasses("preferredProjects")}`}
              >
                Preferred Projects ({saleableProjects.length})
              </button>
              {availableTabs.includes("systemEntries") && (
                <button
                  onClick={() => setActiveTab("systemEntries")}
                  className={`whitespace-nowrap py-3 px-4 rounded-t-lg font-medium text-sm transition-colors ${getTabClasses("systemEntries")}`}
                >
                  System Entries
                </button>
              )}
            </nav>
          </div>

          <div className="p-6">
            {/* Add Project Tab */}
            {activeTab === "addProject" && (
              <div className="fade-in max-w-2xl mx-auto">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">
                  Add New Project
                </h3>
                <form onSubmit={handleAddProject} className="space-y-4">
                  <fieldset disabled={!canEditAddProject || isSaving}>
                    <FormField
                      id="newProjectName"
                      label="Project Name"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder="Enter project name"
                      required
                    />
                    <SearchableSelect
                      id="newProjectZone"
                      label="Project Zone"
                      options={ZONES}
                      value={newProjectZone}
                      onChange={setNewProjectZone}
                      placeholder="Select a zone"
                      required
                    />
                    <FormField
                      id="newProjectAddress"
                      label="Project Address"
                      as="textarea"
                      value={newProjectAddress}
                      onChange={(e) => setNewProjectAddress(e.target.value)}
                      placeholder="Enter full address"
                      required
                    />
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <div className="pt-2 flex justify-end">
                      <button
                        type="submit"
                        disabled={!canEditAddProject || isSaving}
                        className="inline-flex items-center justify-center w-36 px-4 py-2 text-sm font-medium text-white bg-orange-600 border border-transparent rounded-md shadow-sm hover:bg-orange-700 disabled:bg-slate-400"
                      >
                        {isSaving ? <Spinner /> : "Add Project"}
                      </button>
                    </div>
                  </fieldset>
                </form>

                <div className="mt-10 pt-8 border-t border-slate-200">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">
                    Bulk Project Upload
                  </h3>
                  <div className="bg-white/20 p-6 rounded-lg border border-dashed border-slate-300 backdrop-blur-sm">
                    <p className="text-sm text-slate-600 mb-6">
                      You can add multiple projects at once by uploading a CSV
                      file. Please make sure your file follows the required
                      format.
                    </p>

                    <div className="flex flex-wrap gap-4 items-center">
                      <button
                        onClick={handleDownloadTemplate}
                        className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 transition-colors"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                          />
                        </svg>
                        Download Template
                      </button>

                      <div className="relative">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".csv"
                          onChange={handleBulkProjectUpload}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          disabled={!canEditAddProject || isSaving}
                        />
                        <button
                          disabled={!canEditAddProject || isSaving}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md shadow-sm hover:bg-indigo-700 disabled:bg-slate-400 transition-colors"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                            />
                          </svg>
                          Upload CSV File
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Project List Tab */}
            {activeTab === "projectList" && (
              <div className="fade-in">
                <div className="mb-4">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search projects by name, zone, or address..."
                    className="w-full max-w-lg px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                        >
                          Name
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                        >
                          Zone
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                        >
                          Address
                        </th>
                        {canEditProjectList && (
                          <th scope="col" className="relative px-6 py-3">
                            <span className="sr-only">Actions</span>
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {filteredProjects.map((project) => (
                        <tr key={project.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                            {project.name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                            {project.zone}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 truncate max-w-sm">
                            {project.address}
                          </td>
                          {canEditProjectList && (
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-4">
                              <button
                                onClick={() => setProjectToEdit(project)}
                                className="text-orange-600 hover:text-orange-900"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => setProjectToDelete(project)}
                                className="text-red-600 hover:text-red-900"
                              >
                                Delete
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Dashboard Settings Tab */}
            {activeTab === "dashboardSettings" && (
              <div className="fade-in max-w-2xl mx-auto">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">
                  Dashboard Featured Project
                </h3>
                <form
                  onSubmit={handleSaveDashboardSettings}
                  className="space-y-4"
                >
                  <fieldset disabled={!canEditDashboardSettings || isSaving}>
                    <FormField
                      id="title"
                      label="Project Title"
                      value={featuredData.title}
                      onChange={handleFeaturedDataChange}
                      placeholder="e.g., Lake Lofts"
                      required
                    />
                    <FormField
                      id="location"
                      label="Location"
                      value={featuredData.location}
                      onChange={handleFeaturedDataChange}
                      placeholder="e.g., Dhanmondi"
                      required
                    />
                    <FormField
                      id="status"
                      label="Status"
                      value={featuredData.status}
                      onChange={handleFeaturedDataChange}
                      placeholder="e.g., Under Construction"
                      required
                    />
                    <div>
                      <label
                        htmlFor="completion"
                        className="block text-sm font-medium text-slate-700"
                      >
                        Completion (%)
                      </label>
                      <input
                        type="range"
                        id="completion"
                        min="0"
                        max="100"
                        value={featuredData.completion}
                        onChange={(e) =>
                          setFeaturedData((prev) => ({
                            ...prev,
                            completion: Number(e.target.value),
                          }))
                        }
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                      />
                      <div className="text-center text-sm text-slate-500">
                        {featuredData.completion}%
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">
                        Featured Image
                      </label>
                      <div className="mt-1 flex items-center gap-4">
                        <img
                          src={featuredData.image}
                          alt="Featured Project"
                          className="w-32 h-20 object-cover rounded-md border"
                        />
                        <label
                          htmlFor="featured-image-upload"
                          className="cursor-pointer px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Change Image
                        </label>
                        <input
                          id="featured-image-upload"
                          type="file"
                          onChange={handleFeaturedImageChange}
                          className="sr-only"
                          accept="image/*"
                        />
                      </div>
                    </div>
                    <div className="pt-2 flex justify-end">
                      <button
                        type="submit"
                        disabled={!canEditDashboardSettings || isSaving}
                        className="inline-flex items-center justify-center w-36 px-4 py-2 text-sm font-medium text-white bg-orange-600 border border-transparent rounded-md shadow-sm hover:bg-orange-700 disabled:bg-slate-400"
                      >
                        {isSaving ? <Spinner /> : "Save Settings"}
                      </button>
                    </div>
                  </fieldset>
                </form>
              </div>
            )}

            {/* Employee List Tab */}
            {activeTab === "employeeList" && (
              <div className="fade-in space-y-6">

                {/* ── Add / Edit Form ── */}
                <div
                  ref={formSectionRef}
                  className={`rounded-xl border transition-all ${
                    isFormEditing
                      ? "border-orange-200 bg-orange-50/40 shadow-sm shadow-orange-100"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  {/* Form header */}
                  <div className={`px-6 py-4 border-b flex items-center justify-between ${isFormEditing ? "border-orange-200" : "border-slate-200"}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isFormEditing ? "bg-orange-100" : "bg-slate-200"}`}>
                        {isFormEditing ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800">
                          {isFormEditing ? `Editing: ${employeeForm.name}` : "Add New Employee"}
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {isFormEditing ? `ID: ${employeeForm.employeeId}` : "Fill in the details below"}
                        </p>
                      </div>
                    </div>
                    {isFormEditing && (
                      <button
                        onClick={resetEmployeeForm}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Cancel Edit
                      </button>
                    )}
                  </div>

                  {/* Form fields */}
                  <div className="p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
                      <FormField
                        id="empId"
                        label="Employee ID *"
                        value={employeeForm.employeeId}
                        onChange={(e) => setEmployeeForm({ ...employeeForm, employeeId: e.target.value })}
                        placeholder="e.g. EMP-001"
                      />
                      <FormField
                        id="empName"
                        label="Full Name *"
                        value={employeeForm.name}
                        onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })}
                        placeholder="e.g. Rahim Uddin"
                      />
                      <FormField
                        id="empDesignation"
                        label="Designation"
                        value={employeeForm.designation}
                        onChange={(e) => setEmployeeForm({ ...employeeForm, designation: e.target.value })}
                        placeholder="e.g. Senior Engineer"
                      />
                      <FormField
                        id="empDepartment"
                        label="Department"
                        value={employeeForm.department}
                        onChange={(e) => setEmployeeForm({ ...employeeForm, department: e.target.value })}
                        placeholder="e.g. Construction"
                      />
                      <FormField
                        id="empEmail"
                        label="Email"
                        value={employeeForm.email}
                        onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })}
                        placeholder="e.g. rahim@company.com"
                      />
                      <FormField
                        id="empPhone"
                        label="Phone"
                        value={employeeForm.phone}
                        onChange={(e) => setEmployeeForm({ ...employeeForm, phone: e.target.value })}
                        placeholder="e.g. 01700000000"
                      />
                    </div>

                    {/* Bottom row: status + actions */}
                    <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-200/60">
                      {/* Status toggle */}
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-slate-500">Status</span>
                        <button
                          type="button"
                          onClick={() => setEmployeeForm({ ...employeeForm, isActive: !employeeForm.isActive })}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${employeeForm.isActive ? "bg-green-500" : "bg-slate-300"}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${employeeForm.isActive ? "translate-x-6" : "translate-x-1"}`} />
                        </button>
                        <span className={`text-xs font-semibold ${employeeForm.isActive ? "text-green-600" : "text-slate-400"}`}>
                          {employeeForm.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        {isFormEditing && (
                          <button
                            type="button"
                            onClick={resetEmployeeForm}
                            className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          onClick={handleAddAllEmployee}
                          disabled={isSaving}
                          className={`inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white shadow-sm transition-colors disabled:opacity-50 ${
                            isFormEditing ? "bg-orange-600 hover:bg-orange-700" : "bg-orange-600 hover:bg-orange-700"
                          }`}
                        >
                          {isSaving ? (
                            <><Spinner /><span>Saving...</span></>
                          ) : isFormEditing ? (
                            <><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg><span>Update Employee</span></>
                          ) : (
                            <><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg><span>Add Employee</span></>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* CSV tools */}
                  <div className="px-6 py-3 bg-white/60 border-t border-slate-200/60 rounded-b-xl flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-400 mr-1">Bulk import:</span>
                    <button
                      onClick={handleDownloadAllEmployeeTemplate}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-xs font-medium rounded-lg text-slate-600 bg-white hover:bg-slate-50 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download Template
                    </button>
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-xs font-medium rounded-lg text-slate-600 bg-white hover:bg-slate-50 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      Upload CSV
                      <input type="file" className="sr-only" accept=".csv" onChange={handleBulkAllEmployeeUpload} />
                    </label>
                  </div>
                </div>

                {/* ── Employee Table Card ── */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">

                  {/* Card Header */}
                  <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-800 text-sm leading-tight">Employee Directory</h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {allEmployees.filter(e => e.is_active).length} active · {allEmployees.filter(e => !e.is_active).length} inactive
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Search */}
                      <div className="relative">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                        </svg>
                        <input
                          type="text"
                          value={employeeSearchQuery}
                          onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                          placeholder="Search employees..."
                          className="pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-200 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400 w-48 transition-all"
                        />
                        {employeeSearchQuery && (
                          <button onClick={() => setEmployeeSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* Status filter pills */}
                      <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
                        {(["all", "active", "inactive"] as const).map((f) => {
                          const count = f === "all" ? allEmployees.length : f === "active" ? allEmployees.filter(e => e.is_active).length : allEmployees.filter(e => !e.is_active).length;
                          return (
                            <button
                              key={f}
                              onClick={() => setEmployeeStatusFilter(f)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                                employeeStatusFilter === f
                                  ? f === "active" ? "bg-white text-green-700 shadow-sm" : f === "inactive" ? "bg-white text-red-600 shadow-sm" : "bg-white text-slate-700 shadow-sm"
                                  : "text-slate-500 hover:text-slate-700"
                              }`}
                            >
                              {f === "active" && <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>}
                              {f === "inactive" && <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>}
                              {f === "all" ? "All" : f === "active" ? "Active" : "Inactive"}
                              <span className={`text-[10px] font-bold ${employeeStatusFilter === f ? "text-slate-500" : "text-slate-400"}`}>{count}</span>
                            </button>
                          );
                        })}
                      </div>

                      <button
                        onClick={handleExportAllEmployees}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-800 transition-colors"
                        title="Export the currently filtered list as Excel-compatible CSV"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Export Excel
                      </button>

                      <button
                        onClick={() => setShowAllEmployeesTable(!showAllEmployeesTable)}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                        title={showAllEmployeesTable ? "Collapse" : "Expand"}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${showAllEmployeesTable ? "" : "rotate-180"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Table */}
                  {showAllEmployeesTable && (() => {
                    const filteredEmps = allEmployees
                      .filter(emp => employeeStatusFilter === "active" ? !!emp.is_active : employeeStatusFilter === "inactive" ? !emp.is_active : true)
                      .filter(emp => {
                        if (!employeeSearchQuery.trim()) return true;
                        const q = employeeSearchQuery.toLowerCase();
                        return emp.name?.toLowerCase().includes(q) || emp.employee_id?.toLowerCase().includes(q) || emp.designation?.toLowerCase().includes(q) || emp.department?.toLowerCase().includes(q) || emp.email?.toLowerCase().includes(q) || emp.phone?.toLowerCase().includes(q);
                      });

                    const avatarColors = ["bg-violet-100 text-violet-700", "bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-700", "bg-pink-100 text-pink-700", "bg-cyan-100 text-cyan-700", "bg-orange-100 text-orange-700"];
                    const getInitials = (name: string) => name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
                    const getColor = (id: number) => avatarColors[id % avatarColors.length];

                    return (
                      <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
                        <table className="min-w-full">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                              <th className="px-4 py-3 text-left">
                                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">#</span>
                              </th>
                              <th className="px-4 py-3 text-left">
                                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Employee</span>
                              </th>
                              <th className="px-4 py-3 text-left">
                                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Role</span>
                              </th>
                              <th className="px-4 py-3 text-left">
                                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Department</span>
                              </th>
                              <th className="px-4 py-3 text-left">
                                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Contact</span>
                              </th>
                              <th className="px-4 py-3 text-center">
                                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</span>
                              </th>
                              <th className="px-4 py-3 text-right">
                                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Actions</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {filteredEmps.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="py-16 text-center">
                                  <div className="flex flex-col items-center gap-2">
                                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                      </svg>
                                    </div>
                                    <p className="text-sm font-medium text-slate-400">No employees found</p>
                                    <p className="text-xs text-slate-300">
                                      {employeeSearchQuery ? `No match for "${employeeSearchQuery}"` : `No ${employeeStatusFilter} employees`}
                                    </p>
                                  </div>
                                </td>
                              </tr>
                            ) : filteredEmps.map((emp, idx) => (
                              <tr
                                key={emp.id}
                                className={`group transition-colors hover:bg-orange-50/40 ${!emp.is_active ? "opacity-60" : ""}`}
                              >
                                {/* Row number */}
                                <td className="px-4 py-3 w-10">
                                  <span className="text-xs text-slate-300 font-mono">{idx + 1}</span>
                                </td>

                                {/* Avatar + Name + ID */}
                                <td className="px-4 py-3 min-w-[180px]">
                                  <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${getColor(emp.id)}`}>
                                      {getInitials(emp.name)}
                                    </div>
                                    <div>
                                      <p className="text-sm font-semibold text-slate-800 leading-tight">{emp.name}</p>
                                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">{emp.employee_id}</p>
                                    </div>
                                  </div>
                                </td>

                                {/* Designation */}
                                <td className="px-4 py-3 min-w-[140px]">
                                  <span className="text-sm text-slate-600">{emp.designation || <span className="text-slate-300 italic text-xs">—</span>}</span>
                                </td>

                                {/* Department */}
                                <td className="px-4 py-3 min-w-[130px]">
                                  {emp.department ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-xs font-medium">
                                      {emp.department}
                                    </span>
                                  ) : <span className="text-slate-300 italic text-xs">—</span>}
                                </td>

                                {/* Contact: email + phone stacked */}
                                <td className="px-4 py-3 min-w-[170px]">
                                  <div className="space-y-0.5">
                                    {emp.email ? (
                                      <div className="flex items-center gap-1.5">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                        </svg>
                                        <span className="text-xs text-slate-500 truncate max-w-[140px]">{emp.email}</span>
                                      </div>
                                    ) : null}
                                    {emp.phone ? (
                                      <div className="flex items-center gap-1.5">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                        </svg>
                                        <span className="text-xs text-slate-500">{emp.phone}</span>
                                      </div>
                                    ) : null}
                                    {!emp.email && !emp.phone && <span className="text-slate-300 italic text-xs">—</span>}
                                  </div>
                                </td>

                                {/* Status toggle */}
                                <td className="px-4 py-3 text-center">
                                  <button
                                    onClick={() => handleToggleActiveEmployee(emp)}
                                    title="Click to toggle status"
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                                      emp.is_active
                                        ? "bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                                        : "bg-slate-50 border-slate-200 text-slate-400 hover:bg-red-50 hover:border-red-200 hover:text-red-500"
                                    }`}
                                  >
                                    <span className={`w-1.5 h-1.5 rounded-full ${emp.is_active ? "bg-green-500" : "bg-slate-300"}`}></span>
                                    {emp.is_active ? "Active" : "Inactive"}
                                  </button>
                                </td>

                                {/* Actions */}
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => {
                                        setEmployeeForm({
                                          employeeId: emp.employee_id,
                                          name: emp.name,
                                          designation: emp.designation,
                                          department: emp.department,
                                          email: emp.email,
                                          phone: emp.phone,
                                          isActive: !!emp.is_active,
                                        });
                                        setIsFormEditing(true);
                                        formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-orange-50 border border-orange-200 text-orange-600 text-xs font-medium hover:bg-orange-100 transition-colors"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => setEmployeeToDelete(emp)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-red-50 border border-red-200 text-red-500 text-xs font-medium hover:bg-red-100 transition-colors"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                      Delete
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        {/* Footer */}
                        {filteredEmps.length > 0 && (
                          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                            <span className="text-xs text-slate-400">
                              Showing <span className="font-semibold text-slate-600">{filteredEmps.length}</span> of <span className="font-semibold text-slate-600">{allEmployees.length}</span> employees
                            </span>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                <span className="text-xs text-slate-400">{allEmployees.filter(e => e.is_active).length} Active</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                                <span className="text-xs text-slate-400">{allEmployees.filter(e => !e.is_active).length} Inactive</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Preferred Projects Tab */}
            {activeTab === "preferredProjects" && (
              <div className="fade-in max-w-4xl mx-auto">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 mb-6">
                  <h3 className="text-lg font-semibold text-slate-800 mb-2">
                    Manage Saleable Preferred Projects
                  </h3>
                  <p className="text-sm text-slate-500 mb-4">
                    Add projects here to analyze their visit frequency in Sales
                    Person Visit reports.
                  </p>

                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Select Existing Project
                        </label>
                        <select
                          value={newSaleableProject}
                          onChange={(e) =>
                            setNewSaleableProject(e.target.value)
                          }
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                        >
                          <option value="">Choose from project list...</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.name}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Or Manual Add (Type Name)
                        </label>
                        <input
                          type="text"
                          value={newSaleableProject}
                          onChange={(e) =>
                            setNewSaleableProject(e.target.value)
                          }
                          placeholder="Enter project name manually"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          onClick={handleAddSaleableProject}
                          disabled={!newSaleableProject || isSaving}
                          className="w-full sm:w-aut px-6 py-2 bg-orange-600 text-white rounded-md text-sm font-medium hover:bg-orange-700 disabled:bg-slate-400 h-[38px]"
                        >
                          {isSaving ? "Adding..." : "Add Project"}
                        </button>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-200">
                      <h4 className="text-sm font-semibold text-slate-700 mb-3">
                        Bulk & Maintenance
                      </h4>
                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={handleDownloadSaleableTemplate}
                          className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-300 text-xs font-medium rounded shadow-sm text-slate-700 bg-white hover:bg-slate-50"
                        >
                          Download Template
                        </button>
                        <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 border border-slate-300 text-xs font-medium rounded shadow-sm text-slate-700 bg-white hover:bg-slate-50">
                          Bulk Upload CSV
                          <input
                            type="file"
                            className="sr-only"
                            accept=".csv"
                            onChange={handleBulkSaleableUpload}
                          />
                        </label>
                        <button
                          onClick={handleExportSaleableProjects}
                          className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-300 text-xs font-medium rounded shadow-sm text-indigo-700 bg-white hover:bg-indigo-50"
                        >
                          Export Current List
                        </button>
                        <button
                          onClick={handleClearSaleableProjects}
                          className="inline-flex items-center gap-2 px-3 py-1.5 border border-red-300 text-xs font-medium rounded shadow-sm text-red-700 bg-white hover:bg-red-50"
                        >
                          Clear All
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-lg">
                  <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                    <h4 className="font-semibold text-slate-700">
                      Preferred Projects List ({saleableProjects.length})
                    </h4>
                  </div>
                  <div className="p-6">
                    {saleableProjects.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {saleableProjects.map((p) => (
                          <div
                            key={p.id}
                            className="flex justify-between items-center px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg group hover:border-orange-200 transition-colors"
                          >
                            {isEditingSaleable === p.id ? (
                              <div className="flex-1 flex gap-2">
                                <input
                                  type="text"
                                  value={editSaleableName}
                                  onChange={(e) =>
                                    setEditSaleableName(e.target.value)
                                  }
                                  className="flex-1 px-2 py-1 text-sm border rounded"
                                  autoFocus
                                />
                                <button
                                  onClick={() =>
                                    handleUpdateSaleableProject(p.id)
                                  }
                                  className="text-xs text-green-600 font-bold"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setIsEditingSaleable(null)}
                                  className="text-xs text-slate-500"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <>
                                <span className="text-sm text-slate-700 font-medium">
                                  {p.project_name}
                                </span>
                                <div className="flex items-center gap-3">
                                  <button
                                    onClick={() => {
                                      setIsEditingSaleable(p.id);
                                      setEditSaleableName(p.project_name);
                                    }}
                                    className="text-slate-400 hover:text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Edit"
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      className="h-4 w-4"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                      />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleDeleteSaleableProject(p.id)
                                    }
                                    className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Remove"
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      className="h-4 w-4"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                      />
                                    </svg>
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-slate-500">
                        No preferred projects added yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* System Entries Tab */}
            {activeTab === "systemEntries" && (
              <div className="fade-in max-w-2xl mx-auto">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">
                  Add System Entry
                </h3>
                <form onSubmit={handleAddSystemEntry} className="space-y-4">
                  <fieldset disabled={isSaving}>
                    <FormField
                      id="entry_name"
                      label="Entry Name"
                      value={newSystemEntry.entry_name}
                      onChange={(e) =>
                        setNewSystemEntry((prev) => ({
                          ...prev,
                          entry_name: e.target.value,
                        }))
                      }
                      placeholder="Entry Name"
                      required
                    />
                    <FormField
                      id="entry_type"
                      label="Entry Type"
                      value={newSystemEntry.entry_type}
                      onChange={(e) =>
                        setNewSystemEntry((prev) => ({
                          ...prev,
                          entry_type: e.target.value,
                        }))
                      }
                      placeholder="Entry Type"
                      required
                    />
                    <FormField
                      id="description"
                      label="Description"
                      as="textarea"
                      value={newSystemEntry.description}
                      onChange={(e) =>
                        setNewSystemEntry((prev) => ({
                          ...prev,
                          description: e.target.value,
                        }))
                      }
                      placeholder="Description"
                      required
                    />
                    <div className="pt-2 flex justify-end">
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="inline-flex items-center justify-center w-36 px-4 py-2 text-sm font-medium text-white bg-orange-600 border border-transparent rounded-md shadow-sm hover:bg-orange-700 disabled:bg-slate-400"
                      >
                        {isSaving ? <Spinner /> : "Add Entry"}
                      </button>
                    </div>
                  </fieldset>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>

      <EditProjectModal
        isOpen={!!projectToEdit}
        project={projectToEdit}
        onClose={() => setProjectToEdit(null)}
        onSave={handleSaveProjectUpdate}
        isSaving={isSaving}
      />
      <DeleteConfirmationModal
        project={projectToDelete}
        onClose={() => setProjectToDelete(null)}
        onConfirm={handleConfirmDelete}
        isSaving={isSaving}
      />

      {/* Employee Delete Confirm Modal */}
      {employeeToDelete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-800">Delete Employee?</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    <strong className="text-slate-700">{employeeToDelete.name}</strong> ({employeeToDelete.employee_id}) will be permanently removed. This cannot be undone.
                  </p>
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex justify-end gap-2">
              <button
                onClick={() => setEmployeeToDelete(null)}
                disabled={isSaving}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteAllEmployee(employeeToDelete.id)}
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isSaving ? <Spinner /> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast toasts={toasts} dismiss={dismiss} />
    </>
  );
};

export default SystemManagement;