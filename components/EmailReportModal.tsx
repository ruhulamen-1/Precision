import React, { useState, useMemo } from "react";
import { SummaryDataRow } from "./AllDepartmentSummary";
import { User } from "../types";

interface EmailReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupedData: Map<string, SummaryDataRow[]>;
  currentUser: User;
  selectedMonth: string;
  generatePdfBlob: (
    dataMap: Map<string, SummaryDataRow[]>,
    isIndividual?: boolean,
  ) => Blob;
}

export const EmailReportModal: React.FC<EmailReportModalProps> = ({
  isOpen,
  onClose,
  groupedData,
  currentUser,
  selectedMonth,
  generatePdfBlob,
}) => {
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState(
    `Project Visit Summary Report - ${selectedMonth}`,
  );
  const [message, setMessage] = useState(
    "Please find the attached report for your review.",
  );
  const [selectedReportType, setSelectedReportType] = useState<
    "full" | "specific"
  >("full");
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const departments = useMemo(
    () => Array.from(groupedData.keys()),
    [groupedData],
  );

  if (!isOpen) return null;

  const toggleDept = (dept: string) => {
    setSelectedDepts((prev) =>
      prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept],
    );
  };

  const handleSendEmail = async () => {
    if (!recipient) {
      setStatus({ type: "error", message: "Please enter a recipient email." });
      return;
    }

    setIsSending(true);
    setStatus(null);

    try {
      let dataToExport = groupedData;
      let fileName = `monthly_summary_${selectedMonth}.pdf`;

      if (selectedReportType === "specific") {
        const filteredMap = new Map<string, SummaryDataRow[]>();
        selectedDepts.forEach((dept) => {
          const data = groupedData.get(dept);
          if (data) filteredMap.set(dept, data);
        });
        dataToExport = filteredMap;
        fileName = `department_summary_${selectedMonth}.pdf`;
      }

      const pdfBlob = generatePdfBlob(
        dataToExport,
        selectedReportType === "specific",
      );

      // Convert Blob to Base64
      const reader = new FileReader();
      reader.readAsDataURL(pdfBlob);
      reader.onloadend = async () => {
        const base64data = (reader.result as string).split(",")[1];

        const response = await fetch("/api/send-report-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: recipient,
            subject,
            body: message,
            attachmentName: fileName,
            attachmentBase64: base64data,
          }),
        });

        const result = await response.json();
        if (response.ok) {
          setStatus({ type: "success", message: "Email sent successfully!" });
          setTimeout(() => {
            onClose();
            setStatus(null);
          }, 2000);
        } else {
          const errorMsg = result.details
            ? `${result.error}: ${result.details}. ${result.hint || ""}`
            : result.error || "Failed to send email.";
          setStatus({ type: "error", message: errorMsg });
        }
        setIsSending(false);
      };
    } catch (error) {
      console.error("Email error:", error);
      setStatus({ type: "error", message: "An unexpected error occurred." });
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-orange-600"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
              <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
            </svg>
            Email Report
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {status && (
            <div
              className={`p-3 rounded-md text-sm mb-4 ${status.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}
            >
              {status.message}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Recipient Email
            </label>
            <input
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="manager@example.com"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm outline-none transition-all"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm outline-none transition-all"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Message (Optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm outline-none transition-all resize-none"
            />
          </div>

          <div className="pt-2">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-2">
              Report Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSelectedReportType("full")}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${selectedReportType === "full" ? "bg-orange-50 border-orange-500 text-orange-700 ring-1 ring-orange-500" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"}`}
              >
                Full Monthly Report
              </button>
              <button
                onClick={() => setSelectedReportType("specific")}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${selectedReportType === "specific" ? "bg-orange-50 border-orange-500 text-orange-700 ring-1 ring-orange-500" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"}`}
              >
                Specific Departments
              </button>
            </div>
          </div>

          {selectedReportType === "specific" && (
            <div className="pt-2">
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-2">
                Select Departments
              </label>
              <div className="flex flex-wrap gap-2">
                {departments.map((dept) => (
                  <button
                    key={dept}
                    onClick={() => toggleDept(dept)}
                    className={`px-3 py-1 rounded-full text-xs transition-all border ${selectedDepts.includes(dept) ? "bg-orange-600 text-white border-orange-600" : "bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300"}`}
                  >
                    {dept}
                  </button>
                ))}
              </div>
              {selectedDepts.length === 0 && (
                <p className="text-[10px] text-red-500 mt-2 italic">
                  * Please select at least one department.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="bg-slate-50 px-6 py-4 flex gap-3">
          <button
            disabled={
              isSending ||
              (selectedReportType === "specific" && selectedDepts.length === 0)
            }
            onClick={handleSendEmail}
            className="flex-1 bg-orange-600 text-white py-2 rounded-lg font-bold text-sm shadow-lg shadow-orange-200 hover:bg-orange-700 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-2"
          >
            {isSending ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Sending...
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
                Send Report via Email
              </>
            )}
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg font-medium text-sm hover:bg-slate-50 transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
