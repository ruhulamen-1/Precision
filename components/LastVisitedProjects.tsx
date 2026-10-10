import React, { useState, useMemo } from "react";
import { VisitedProject, User } from "../types";
import { ZONES } from "../constants";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// Sample data to simulate a database
const ALL_VISITS: VisitedProject[] = [
  { id: 1, projectName: "Lake Lofts", date: "2024-08-25", zone: "Banani" },
  { id: 2, projectName: "Gladiolus", date: "2024-08-25", zone: "Banani" },
  { id: 3, projectName: "Platinum", date: "2024-08-24", zone: "Dhanmondi" },
  {
    id: 4,
    projectName: "Jardin Palacia",
    date: "2024-08-24",
    zone: "Mohammadpur",
  },
  { id: 5, projectName: "Kakoli", date: "2024-08-23", zone: "Banani" },
  { id: 6, projectName: "Simeen Court", date: "2024-08-22", zone: "Lalmatia" },
  { id: 7, projectName: "Bella Vista", date: "2024-08-22", zone: "Uttara" },
  { id: 8, projectName: "Sterling", date: "2024-08-22", zone: "Badda" },
  { id: 9, projectName: "Rosewood", date: "2024-08-21", zone: "Uttara" },
  { id: 10, projectName: "Park Snowflake", date: "2024-08-20", zone: "Banani" },
];

interface LastVisitedProjectsProps {
  currentUser: User;
}

const formatDateForPDF = (date: Date) => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "short" });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
};

const LastVisitedProjects: React.FC<LastVisitedProjectsProps> = ({
  currentUser,
}) => {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");

  const filteredVisits = useMemo(() => {
    return ALL_VISITS.filter((visit) => {
      const startDateMatch = !startDate || visit.date >= startDate;
      const endDateMatch = !endDate || visit.date <= endDate;
      const zoneMatch = !zoneFilter || visit.zone === zoneFilter;
      return startDateMatch && endDateMatch && zoneMatch;
    });
  }, [startDate, endDate, zoneFilter]);

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;

    // == PDF HEADER (Top part) ==
    const headerStartY = 15;

    // Left: Software Branding (Logo) - Styled to match login page logo
    doc.setFont("helvetica", "bold");
    doc.setTextColor(234, 88, 12); // Orange
    doc.setDrawColor(234, 88, 12); // Orange

    const smallFontSize = 11;
    const largeFontSize = 14.7;
    const sloganFontSize = 4.3;

    // Render the large 'P'
    doc.setFontSize(largeFontSize);
    doc.setLineWidth(0.25);
    const largeP_X = margin;
    doc.text("P", largeP_X, headerStartY, { renderingMode: "fillThenStroke" });
    const largePWidth = doc.getTextWidth("P");

    // Render the rest of the name ('RECISION')
    doc.setFontSize(smallFontSize);
    doc.setLineWidth(0.15);
    const restOfName = "RECISION";
    doc.text(restOfName, largeP_X + largePWidth, headerStartY, {
      renderingMode: "fillThenStroke",
    });
    const restOfNameWidth = doc.getTextWidth(restOfName);
    const totalNameWidth = largePWidth + restOfNameWidth;

    // Slogan
    doc.setFont("helvetica", "normal");
    doc.setFontSize(sloganFontSize);
    doc.setTextColor(150); // Gray
    const sloganText = "Eyes on Every Site";
    const sloganWidth = doc.getTextWidth(sloganText);
    const sloganX = largeP_X + totalNameWidth / 2 - sloganWidth / 2;
    const sloganY = headerStartY + 2;
    doc.text(sloganText, sloganX, sloganY);

    // Center: Company Name & Address
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(40);
    doc.text("Credence Housing Limited", pageWidth / 2, headerStartY, {
      align: "center",
    });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(
      "House-15, Road-13/A, Dhanmondi R/A, Dhaka-1209",
      pageWidth / 2,
      headerStartY + 6,
      { align: "center" },
    );

    // == SEPARATOR LINE ==
    doc.setDrawColor(220); // Light gray
    doc.setLineWidth(0.2);
    doc.line(margin, 28, pageWidth - margin, 28); // Line placed after address

    // == TABLE ==
    const tableColumn = ["Project Name", "Date", "Zone"];
    const tableRows = filteredVisits.map((visit) => [
      visit.projectName,
      formatDateForPDF(new Date(`${visit.date}T00:00:00`)),
      visit.zone,
    ]);

    // @ts-ignore
    autoTable(doc as any, {
      head: [tableColumn],
      body: tableRows,
      startY: 32, // Start table right after the header line
      theme: "grid" as any,
      headStyles: { fillColor: [234, 88, 12] }, // Orange header
    });

    // == FOOTER ==
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.setTextColor(150);

      // Left: Prepared By
      const preparedByStr = `Prepared by\n${currentUser.name}\n${currentUser.designation}`;
      doc.text(preparedByStr, margin, pageHeight - 20);

      // Center: Dept. HOD
      doc.text("Dept. HOD", pageWidth / 2, pageHeight - 10, {
        align: "center",
      });

      // Right: Page Number
      const pageStr = `Page ${i} of ${pageCount}`;
      doc.text(pageStr, pageWidth - margin, pageHeight - 10, {
        align: "right",
      });
    }

    doc.save(
      `visited-projects-report-${new Date().toISOString().split("T")[0]}.pdf`,
    );
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-semibold text-slate-800 mb-4">
          Filter Visited Projects
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label
              htmlFor="start-date-filter"
              className="block text-sm font-medium text-slate-700"
            >
              Start Date
            </label>
            <input
              type="date"
              id="start-date-filter"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <div>
            <label
              htmlFor="end-date-filter"
              className="block text-sm font-medium text-slate-700"
            >
              End Date
            </label>
            <input
              type="date"
              id="end-date-filter"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <div>
            <label
              htmlFor="zone-filter"
              className="block text-sm font-medium text-slate-700"
            >
              Zone
            </label>
            <select
              id="zone-filter"
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            >
              <option value="">All Zones</option>
              {ZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-6 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-slate-800">
            Results ({filteredVisits.length})
          </h2>
          <button
            onClick={handleDownloadPDF}
            disabled={filteredVisits.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:bg-slate-400 disabled:cursor-not-allowed"
            aria-label="Download report as PDF"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
            Download PDF
          </button>
        </div>
        {filteredVisits.length > 0 ? (
          <ul className="divide-y divide-slate-200">
            {filteredVisits.map((visit) => (
              <li
                key={visit.id}
                className="p-4 flex justify-between items-center hover:bg-slate-50 transition-colors"
              >
                <div>
                  <p className="font-semibold text-slate-800">
                    {visit.projectName}
                  </p>
                  <p className="text-sm text-slate-500">
                    {new Date(`${visit.date}T00:00:00`).toLocaleDateString(
                      "en-US",
                      { year: "numeric", month: "long", day: "numeric" },
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-800">
                    {visit.zone}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-6 text-center text-slate-500">
            No visits found matching your criteria.
          </p>
        )}
      </div>
    </div>
  );
};

export default LastVisitedProjects;
