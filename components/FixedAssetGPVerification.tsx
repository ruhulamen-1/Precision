import React, { useState, useEffect } from "react";
import {
  User,
  FixedAssetGPVerification as FixedAssetGPVerificationType,
  GPDetail,
} from "../types";
import {
  Save,
  Plus,
  Edit2,
  X,
  Check,
  Trash2,
  Calendar,
  ClipboardList,
} from "lucide-react";
import { getEffectivePermissions } from "../utils/permissionUtils";

const getLocalDateString = () => {
  const tzOffset = new Date().getTimezoneOffset() * 60000;
  return new Date(Date.now() - tzOffset).toISOString().split("T")[0];
};

interface Props {
  currentUser: User;
}

const FixedAssetGPVerification: React.FC<Props> = ({ currentUser }) => {
  const permissions =
    getEffectivePermissions(currentUser).fixedAssetGPVerification;
  const canEdit = permissions?.edit || currentUser.role === "super_admin";
  const canAudit = permissions?.audit || currentUser.role === "super_admin";

  const [records, setRecords] = useState<FixedAssetGPVerificationType[]>([]);
  const [isAddingInline, setIsAddingInline] = useState(false);
  const [newInlineDetails, setNewInlineDetails] = useState<GPDetail[]>([
    {
      gp_date: getLocalDateString(),
      reference: "",
      updated_by: currentUser.name || "",
      issues_count: null,
      remarks: "",
      checked_by: "",
      check_status: "Pending",
    },
  ]);
  const [newInlineData, setNewInlineData] = useState<
    Partial<FixedAssetGPVerificationType>
  >({});
  const [searchQuery, setSearchQuery] = useState("");
  const [inlineEditId, setInlineEditId] = useState<number | null>(null);
  const [inlineFormData, setInlineFormData] = useState<
    Partial<FixedAssetGPVerificationType>
  >({});

  const fetchRecords = async () => {
    try {
      const res = await fetch("/api/fixed-asset-gp-verification");
      if (res.ok) {
        const data = await res.json();
        setRecords(data);
      }
    } catch (error) {
      console.error("Failed to fetch records", error);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const handleSave = async (data: any, id?: number) => {
    try {
      // Ensure we never accidentally POST when we mean to PUT
      const resolvedId = id || data?.id || null;
      const method = resolvedId ? "PUT" : "POST";
      const url = resolvedId
        ? `/api/fixed-asset-gp-verification/${resolvedId}`
        : "/api/fixed-asset-gp-verification";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        await fetchRecords();
        setInlineEditId(null);
        setIsAddingInline(false);
      } else {
        alert("Failed to save record");
      }
    } catch (error) {
      console.error("Error saving record:", error);
      alert("Error saving record");
    }
  };

  const startAddingReference = (record: FixedAssetGPVerificationType) => {
    setInlineEditId(record.id || null);
    let gp_details: GPDetail[] = [];
    if (record.gp_details) {
      try {
        const parsed =
          typeof record.gp_details === "string"
            ? JSON.parse(record.gp_details)
            : record.gp_details;
        gp_details = Array.isArray(parsed) && parsed.length > 0 ? parsed : [
          {
            gp_date: record.gp_date,
            reference: record.reference,
            updated_by: record.updated_by,
            issues_count: record.issues_count,
            remarks: record.remarks,
            checked_by: record.checked_by,
            check_status: record.check_status as any,
          },
        ];
      } catch (e) {
        gp_details = [
          {
            gp_date: record.gp_date,
            reference: record.reference,
            updated_by: record.updated_by,
            issues_count: record.issues_count,
            remarks: record.remarks,
            checked_by: record.checked_by,
            check_status: record.check_status as any,
          },
        ];
      }
    } else {
      // gp_details is null — seed from the record's own top-level fields
      gp_details = [
        {
          gp_date: record.gp_date,
          reference: record.reference,
          updated_by: record.updated_by,
          issues_count: record.issues_count,
          remarks: record.remarks,
          checked_by: record.checked_by,
          check_status: record.check_status as any,
        },
      ];
    }

    // Deduplicate: remove any blank/empty reference rows that may have been saved previously
    const deduped = gp_details.filter((d, i) => {
      if (i === 0) return true; // always keep the first row
      return d.reference && d.reference.trim() !== "";
    });

    // Add the new blank row
    const updatedDetails: GPDetail[] = [
      ...deduped,
      {
        gp_date: getLocalDateString(),
        reference: "",
        updated_by: currentUser.name || "",
        issues_count: null,
        remarks: "",
        checked_by: "",
        check_status: "Pending" as const,
      },
    ];

    setInlineFormData({ ...record, gp_details: updatedDetails });
    setIsAddingInline(false);
  };

  const handleEdit = (record: FixedAssetGPVerificationType) => {
    setInlineEditId(record.id || null);

    let gp_details: GPDetail[] = [];
    if (record.gp_details) {
      try {
        const parsed =
          typeof record.gp_details === "string"
            ? JSON.parse(record.gp_details)
            : record.gp_details;
        gp_details = Array.isArray(parsed) && parsed.length > 0 ? parsed : [
          {
            gp_date: record.gp_date,
            reference: record.reference,
            updated_by: record.updated_by,
            issues_count: record.issues_count,
            remarks: record.remarks,
            checked_by: record.checked_by,
            check_status: record.check_status as
              | "Pending"
              | "Checked"
              | "Returned",
          },
        ];
      } catch (e) {
        gp_details = [
          {
            gp_date: record.gp_date,
            reference: record.reference,
            updated_by: record.updated_by,
            issues_count: record.issues_count,
            remarks: record.remarks,
            checked_by: record.checked_by,
            check_status: record.check_status as
              | "Pending"
              | "Checked"
              | "Returned",
          },
        ];
      }
    } else {
      // gp_details is null — seed from the record's own top-level fields
      gp_details = [
        {
          gp_date: record.gp_date,
          reference: record.reference,
          updated_by: record.updated_by,
          issues_count: record.issues_count,
          remarks: record.remarks,
          checked_by: record.checked_by,
          check_status: record.check_status as
            | "Pending"
            | "Checked"
            | "Returned",
        },
      ];
    }

    setInlineFormData({ ...record, gp_details: gp_details as GPDetail[] });
    setIsAddingInline(false);
  };

  const handleDelete = async (id: number) => {
    if (currentUser.role !== "super_admin") {
      alert("Only super admins can delete records");
      return;
    }
    if (window.confirm("Are you sure you want to delete this record?")) {
      try {
        const res = await fetch(`/api/fixed-asset-gp-verification/${id}`, {
          method: "DELETE",
        });
        if (res.ok) fetchRecords();
      } catch (error) {
        console.error("Error deleting record", error);
      }
    }
  };

  const handleInlineSave = async () => {
    // Use inlineFormData.id as the authoritative source to avoid race conditions
    const recordId = (inlineFormData as any).id || inlineEditId;
    if (!recordId) {
      console.error("handleInlineSave: no record id found, aborting to prevent duplicate POST");
      return;
    }
    handleSave(inlineFormData, recordId);
  };

  const handleNewSave = async () => {
    const firstDetail = newInlineDetails[0];
    if (!firstDetail.gp_date || !firstDetail.reference) {
      alert("Please fill GP Date and Reference for at least the first row");
      return;
    }

    await handleSave({
      gp_date: firstDetail.gp_date,
      reference: firstDetail.reference,
      updated_by: firstDetail.updated_by,
      issues_count: firstDetail.issues_count,
      remarks: firstDetail.remarks,
      checked_by: firstDetail.checked_by,
      check_status: firstDetail.check_status || "Pending",
      gp_details: newInlineDetails,
    });

    setIsAddingInline(false);
    setNewInlineDetails([
      {
        gp_date: getLocalDateString(),
        reference: "",
        updated_by: currentUser.name || "",
        issues_count: null,
        remarks: "",
        checked_by: "",
        check_status: "Pending",
      },
    ]);
  };

  const filteredRecords = records.filter((r) => {
    const refQuery = searchQuery.toLowerCase();
    const primaryRefMatch = r.reference?.toLowerCase().includes(refQuery);

    let detailRefMatch = false;
    if (r.gp_details) {
      try {
        const details =
          typeof r.gp_details === "string"
            ? JSON.parse(r.gp_details)
            : r.gp_details;
        detailRefMatch = details.some((d: GPDetail) =>
          d.reference?.toLowerCase().includes(refQuery),
        );
      } catch (e) {
        console.error("Error parsing gp_details for search", e);
      }
    }

    const searchMatch =
      primaryRefMatch ||
      detailRefMatch ||
      r.updated_by?.toLowerCase().includes(refQuery) ||
      r.checked_by?.toLowerCase().includes(refQuery);

    return searchMatch;
  });

  const allDetailsCount = records.reduce((acc, r) => {
    const details = (
      typeof r.gp_details === "string"
        ? JSON.parse(r.gp_details)
        : r.gp_details || []
    ) as GPDetail[];
    return acc + details.length;
  }, 0);

  const checkedDetailsCount = records.reduce((acc, r) => {
    const details = (
      typeof r.gp_details === "string"
        ? JSON.parse(r.gp_details)
        : r.gp_details || []
    ) as GPDetail[];
    return acc + details.filter((d) => d.check_status === "Checked").length;
  }, 0);

  const pendingDetailsCount = records.reduce((acc, r) => {
    const details = (
      typeof r.gp_details === "string"
        ? JSON.parse(r.gp_details)
        : r.gp_details || []
    ) as GPDetail[];
    return (
      acc +
      details.filter((d) => !d.check_status || d.check_status === "Pending")
        .length
    );
  }, 0);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="w-full sm:w-auto">
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">
            Fixed Asset Distribution GP Verification
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Manage GP Verification records.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-grow sm:flex-grow-0 min-w-[200px]">
            <input
              type="text"
              placeholder="Search Reference..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          {!isAddingInline && canEdit && (
            <button
              onClick={() => {
                setIsAddingInline(true);
                setInlineEditId(null);
                setNewInlineData({
                  gp_date: getLocalDateString(),
                  reference: "",
                  updated_by: currentUser.name || "",
                  issues_count: null,
                  remarks: "",
                  checked_by: canAudit ? currentUser.name : "",
                  check_status: "Pending",
                });
              }}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 transition-all font-bold"
            >
              <Plus className="w-4 h-4" />
              Add New Record
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-1">
              Total Records
            </p>
            <h3 className="text-3xl font-black text-slate-800">
              {allDetailsCount}
            </h3>
          </div>
        </div>
        <div className="bg-emerald-50 rounded-3xl p-6 shadow-sm border border-emerald-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-emerald-600 uppercase tracking-widest mb-1">
              Checked
            </p>
            <h3 className="text-3xl font-black text-emerald-700">
              {checkedDetailsCount}
            </h3>
          </div>
        </div>
        <div className="bg-amber-50 rounded-3xl p-6 shadow-sm border border-amber-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-amber-600 uppercase tracking-widest mb-1">
              Pending
            </p>
            <h3 className="text-3xl font-black text-amber-700">
              {pendingDetailsCount}
            </h3>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-[11px] font-bold uppercase tracking-widest border-b border-slate-100">
                <th className="p-4 pl-6">GP Date</th>
                <th className="p-4">Reference</th>
                <th className="p-4">Update By</th>
                <th className="p-4 text-center">Issues</th>
                <th className="p-4">Remarks</th>
                <th className="p-4">Check By</th>
                <th className="p-4">Status</th>
                <th className="p-4">Update Date</th>
                <th className="p-4 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isAddingInline && (
                <React.Fragment>
                  {newInlineDetails.map((detail, idx) => (
                    <tr
                      key={`new-${idx}`}
                      className="bg-indigo-50/50 animate-in fade-in duration-300"
                    >
                      <td className="p-3 pl-6">
                        <input
                          type="date"
                          value={detail.gp_date}
                          onChange={(e) => {
                            const nd = [...newInlineDetails];
                            nd[idx].gp_date = e.target.value;
                            setNewInlineDetails(nd);
                          }}
                          className="w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="text"
                          placeholder="Ref"
                          value={detail.reference}
                          onChange={(e) => {
                            const nd = [...newInlineDetails];
                            nd[idx].reference = e.target.value;
                            setNewInlineDetails(nd);
                          }}
                          className="w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="text"
                          value={detail.updated_by || ""}
                          onChange={(e) => {
                            const nd = [...newInlineDetails];
                            nd[idx].updated_by = e.target.value;
                            setNewInlineDetails(nd);
                          }}
                          className="w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="number"
                          value={detail.issues_count ?? ""}
                          onChange={(e) => {
                            const nd = [...newInlineDetails];
                            nd[idx].issues_count = e.target.value
                              ? parseInt(e.target.value)
                              : null;
                            setNewInlineDetails(nd);
                          }}
                          className="w-16 text-xs p-1.5 border rounded-lg bg-white shadow-sm mx-auto block"
                        />
                      </td>
                      <td className="p-3">
                        <textarea
                          rows={1}
                          value={detail.remarks}
                          onChange={(e) => {
                            const nd = [...newInlineDetails];
                            nd[idx].remarks = e.target.value;
                            setNewInlineDetails(nd);
                          }}
                          className="w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="text"
                          value={detail.checked_by || ""}
                          onChange={(e) => {
                            const nd = [...newInlineDetails];
                            nd[idx].checked_by = e.target.value;
                            setNewInlineDetails(nd);
                          }}
                          disabled={!canAudit}
                          className="w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm disabled:bg-slate-50"
                        />
                      </td>
                      <td className="p-3">
                        <select
                          value={detail.check_status || "Pending"}
                          onChange={(e) => {
                            const nd = [...newInlineDetails];
                            const status = e.target.value as any;
                            nd[idx].check_status = status;
                            if (status === "Checked") {
                              nd[idx].checked_by = currentUser.name || "";
                            }
                            setNewInlineDetails(nd);
                          }}
                          disabled={!canAudit}
                          className="w-full text-xs p-1.5 border rounded-lg bg-white shadow-sm disabled:bg-slate-50"
                        >
                          <option value="Pending">Pending</option>
                          <option value="Checked">Checked</option>
                          <option value="Returned">Returned</option>
                        </select>
                      </td>
                      <td className="p-3 text-slate-400 text-[10px] text-center font-bold">
                        NEW
                      </td>
                      <td className="p-3 pr-6 text-right">
                        <div className="flex justify-end gap-1">
                          {idx === 0 && (
                            <button
                              onClick={() => {
                                const nd = [...newInlineDetails];
                                nd.push({
                                  gp_date: getLocalDateString(),
                                  reference: "",
                                  updated_by: currentUser.name || "",
                                  issues_count: null,
                                  remarks: "",
                                  checked_by: "",
                                  check_status: "Pending",
                                });
                                setNewInlineDetails(nd);
                              }}
                              className="p-1.5 text-indigo-600 bg-white border border-indigo-100 rounded-lg hover:bg-indigo-50"
                              title="Add another row"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          )}
                          {idx > 0 && (
                            <button
                              onClick={() => {
                                const nd = [...newInlineDetails];
                                nd.splice(idx, 1);
                                setNewInlineDetails(nd);
                              }}
                              className="p-1.5 text-rose-500 bg-white border border-rose-100 rounded-lg hover:bg-rose-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          {idx === 0 && (
                            <>
                              <button
                                onClick={handleNewSave}
                                className="p-1.5 text-emerald-600 bg-white border border-emerald-100 rounded-lg shadow-sm hover:bg-emerald-50"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setIsAddingInline(false)}
                                className="p-1.5 text-slate-400 bg-white border border-slate-100 rounded-lg shadow-sm hover:bg-rose-50"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              )}
              {filteredRecords.map((r) => {
                const isEditing = r.id === inlineEditId;
                const rawDetails = (
                  typeof r.gp_details === "string"
                    ? JSON.parse(r.gp_details)
                    : r.gp_details || []
                ) as GPDetail[];
                // If gp_details is empty, fall back to top-level fields so the row always renders
                const details: GPDetail[] = rawDetails.length > 0 ? rawDetails : [
                  {
                    gp_date: r.gp_date,
                    reference: r.reference,
                    updated_by: r.updated_by,
                    issues_count: r.issues_count,
                    remarks: r.remarks,
                    checked_by: r.checked_by,
                    check_status: r.check_status as any,
                  },
                ];

                if (isEditing) {
                  return (
                    <React.Fragment key={r.id}>
                      {((inlineFormData.gp_details as GPDetail[]) || []).map(
                        (detail, idx) => (
                          <tr
                            key={`${r.id}-${idx}`}
                            className="bg-indigo-50/30 border-l-4 border-indigo-500 transition-colors"
                          >
                            <td className="p-3 pl-6">
                              <input
                                type="date"
                                value={detail.gp_date}
                                onChange={(e) => {
                                  if (!canEdit) return;
                                  const nd = [
                                    ...((inlineFormData.gp_details as GPDetail[]) ||
                                      []),
                                  ];
                                  nd[idx].gp_date = e.target.value;
                                  setInlineFormData({
                                    ...inlineFormData,
                                    gp_details: nd,
                                  });
                                }}
                                disabled={!canEdit}
                                className="w-full text-xs p-1.5 border rounded-lg bg-white disabled:bg-slate-50"
                              />
                            </td>
                            <td className="p-3 font-bold">
                              <input
                                type="text"
                                value={detail.reference}
                                onChange={(e) => {
                                  if (!canEdit) return;
                                  const nd = [
                                    ...((inlineFormData.gp_details as GPDetail[]) ||
                                      []),
                                  ];
                                  nd[idx].reference = e.target.value;
                                  setInlineFormData({
                                    ...inlineFormData,
                                    gp_details: nd,
                                  });
                                }}
                                disabled={!canEdit}
                                className="w-full text-xs p-1.5 border rounded-lg bg-white disabled:bg-slate-50"
                              />
                            </td>
                            <td className="p-3">
                              <input
                                type="text"
                                value={detail.updated_by || ""}
                                onChange={(e) => {
                                  if (!canEdit) return;
                                  const nd = [
                                    ...((inlineFormData.gp_details as GPDetail[]) ||
                                      []),
                                  ];
                                  nd[idx].updated_by = e.target.value;
                                  setInlineFormData({
                                    ...inlineFormData,
                                    gp_details: nd,
                                  });
                                }}
                                disabled={!canEdit}
                                className="w-full text-xs p-1.5 border rounded-lg bg-white disabled:bg-slate-50"
                              />
                            </td>
                            <td className="p-3">
                              <input
                                type="number"
                                value={detail.issues_count ?? ""}
                                onChange={(e) => {
                                  if (!canEdit) return;
                                  const nd = [
                                    ...((inlineFormData.gp_details as GPDetail[]) ||
                                      []),
                                  ];
                                  nd[idx].issues_count = e.target.value
                                    ? parseInt(e.target.value)
                                    : null;
                                  setInlineFormData({
                                    ...inlineFormData,
                                    gp_details: nd,
                                  });
                                }}
                                disabled={!canEdit}
                                className="w-16 mx-auto block text-xs p-1.5 border rounded-lg bg-white disabled:bg-slate-50"
                              />
                            </td>
                            <td className="p-3">
                              <textarea
                                rows={1}
                                value={detail.remarks || ""}
                                onChange={(e) => {
                                  if (!canEdit) return;
                                  const nd = [
                                    ...((inlineFormData.gp_details as GPDetail[]) ||
                                      []),
                                  ];
                                  nd[idx].remarks = e.target.value;
                                  setInlineFormData({
                                    ...inlineFormData,
                                    gp_details: nd,
                                  });
                                }}
                                disabled={!canEdit}
                                className="w-full text-xs p-1.5 border rounded-lg bg-white disabled:bg-slate-50"
                              />
                            </td>
                            <td className="p-3">
                              <input
                                type="text"
                                value={detail.checked_by || ""}
                                onChange={(e) => {
                                  const nd = [
                                    ...((inlineFormData.gp_details as GPDetail[]) ||
                                      []),
                                  ];
                                  nd[idx].checked_by = e.target.value;
                                  setInlineFormData({
                                    ...inlineFormData,
                                    gp_details: nd,
                                  });
                                }}
                                disabled={!canAudit}
                                className="w-full text-xs p-1.5 border rounded-lg bg-white disabled:bg-slate-50"
                              />
                            </td>
                            <td className="p-3">
                              <select
                                value={detail.check_status || "Pending"}
                                onChange={(e) => {
                                  const nd = [
                                    ...((inlineFormData.gp_details as GPDetail[]) ||
                                      []),
                                  ];
                                  const status = e.target.value as any;
                                  nd[idx].check_status = status;
                                  if (status === "Checked") {
                                    nd[idx].checked_by = currentUser.name || "";
                                  }
                                  setInlineFormData({
                                    ...inlineFormData,
                                    gp_details: nd,
                                  });
                                }}
                                disabled={!canAudit}
                                className="w-full text-xs p-1.5 border rounded-lg bg-white disabled:bg-slate-50"
                              >
                                <option value="Pending">Pending</option>
                                <option value="Checked">Checked</option>
                                <option value="Returned">Returned</option>
                              </select>
                            </td>
                            <td className="p-3 text-center text-[10px] text-slate-400">
                              Editing...
                            </td>
                            <td className="p-3 pr-6 text-right">
                              <div className="flex justify-end gap-1">
                                {idx === 0 && canEdit && (
                                  <button
                                    onClick={() => {
                                      const nd = [
                                        ...((inlineFormData.gp_details as GPDetail[]) ||
                                          []),
                                      ];
                                      nd.push({
                                        gp_date: getLocalDateString(),
                                        reference: "",
                                        updated_by: currentUser.name || "",
                                        issues_count: null,
                                        remarks: "",
                                        checked_by: "",
                                        check_status: "Pending",
                                      });
                                      setInlineFormData({
                                        ...inlineFormData,
                                        gp_details: nd,
                                      });
                                    }}
                                    className="p-1.5 text-indigo-600 bg-white border border-indigo-100 rounded-lg hover:bg-indigo-50"
                                    title="Add another reference"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                )}
                                {idx > 0 && canEdit && (
                                  <button
                                    onClick={() => {
                                      const nd = [
                                        ...((inlineFormData.gp_details as GPDetail[]) ||
                                          []),
                                      ];
                                      nd.splice(idx, 1);
                                      setInlineFormData({
                                        ...inlineFormData,
                                        gp_details: nd,
                                      });
                                    }}
                                    className="p-1.5 text-rose-500 bg-white border border-rose-100 rounded-lg hover:bg-rose-50"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                                {idx === 0 && (
                                  <>
                                    <button
                                      onClick={handleInlineSave}
                                      className="p-1.5 text-emerald-600 bg-white border border-emerald-100 rounded-lg shadow-sm hover:bg-emerald-50"
                                    >
                                      <Check className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => setInlineEditId(null)}
                                      className="p-1.5 text-slate-400 bg-white border border-slate-100 rounded-lg shadow-sm hover:bg-rose-50"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ),
                      )}
                    </React.Fragment>
                  );
                }

                return (
                  <React.Fragment key={r.id}>
                    {details.map((detail, idx) => {
                      const rowColor =
                        detail.check_status === "Checked"
                          ? "bg-emerald-50/10"
                          : detail.check_status === "Returned"
                            ? "bg-rose-50/10"
                            : "hover:bg-slate-50/50";
                      return (
                        <tr
                          key={`${r.id}-${idx}`}
                          className={`${rowColor} transition-colors ${idx > 0 ? "border-t border-dashed border-slate-100" : ""}`}
                        >
                          <td className="p-4 pl-6 text-sm">
                            {detail.gp_date
                              ? new Date(detail.gp_date).toLocaleDateString(
                                  "en-GB",
                                  {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  },
                                )
                              : "-"}
                          </td>
                          <td className="p-4 text-sm font-semibold">
                            {detail.reference}
                          </td>
                          <td className="p-4 text-sm text-slate-600">
                            {detail.updated_by || r.updated_by}
                          </td>
                          <td className="p-4 text-sm text-center">
                            {detail.issues_count !== null ? (
                              <span
                                className={`px-2 py-0.5 rounded-md ${detail.issues_count > 0 ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}
                              >
                                {detail.issues_count}
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="p-4 text-sm text-slate-500">
                            <div
                              className="truncate max-w-[150px]"
                              title={detail.remarks || ""}
                            >
                              {detail.remarks || "-"}
                            </div>
                          </td>
                          <td className="p-4 text-sm text-slate-600">
                            {detail.checked_by || "-"}
                          </td>
                          <td className="p-4 text-sm font-semibold">
                            <span
                              className={`px-2.5 py-1 rounded-lg text-xs ${
                                detail.check_status === "Checked"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : detail.check_status === "Returned"
                                    ? "bg-rose-100 text-rose-700"
                                    : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {detail.check_status || "Pending"}
                            </span>
                          </td>
                          <td className="p-4 text-sm text-slate-400">
                            {r.updated_at
                              ? new Date(r.updated_at).toLocaleDateString(
                                  "en-GB",
                                  {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  },
                                )
                              : "-"}
                          </td>
                          <td className="p-4 pr-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {idx === 0 &&
                                (currentUser.role === "super_admin" ||
                                  ((canEdit || canAudit) &&
                                    detail.check_status !== "Checked")) && (
                                  <>
                                    {canEdit && (
                                      <button
                                        onClick={() => startAddingReference(r)}
                                        className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg transition"
                                        title="Add new reference row"
                                      >
                                        <Plus className="w-4 h-4" />
                                      </button>
                                    )}
                                    {(canEdit || canAudit) && (
                                      <button
                                        onClick={() => handleEdit(r)}
                                        className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded-lg transition"
                                        title="Edit all references in this entry"
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </button>
                                    )}
                                    {currentUser.role === "super_admin" && (
                                      <button
                                        onClick={() =>
                                          r.id && handleDelete(r.id)
                                        }
                                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition"
                                        title="Delete entire entry"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    )}
                                  </>
                                )}
                              {idx > 0 && (
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">
                                    Part of entry
                                  </span>
                                  {currentUser.role === "super_admin" && (
                                    <button
                                      onClick={() => {
                                        if (!window.confirm("Remove this detail row from the entry?")) return;
                                        const currentDetails = (
                                          typeof r.gp_details === "string"
                                            ? JSON.parse(r.gp_details)
                                            : r.gp_details || []
                                        ) as GPDetail[];
                                        const updated = currentDetails.filter((_, i) => i !== idx);
                                        handleSave({ ...r, gp_details: updated }, r.id);
                                      }}
                                      className="p-1 text-rose-400 hover:bg-rose-50 rounded-lg transition"
                                      title="Remove this detail row"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
              {filteredRecords.length === 0 && !isAddingInline && (
                <tr>
                  <td colSpan={9} className="p-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <ClipboardList className="w-8 h-8 opacity-20" />
                      <p className="text-sm font-medium">No records found</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default FixedAssetGPVerification;