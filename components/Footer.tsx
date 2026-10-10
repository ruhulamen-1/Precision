import React from "react";

const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-50 border-t border-slate-200 mt-auto no-print">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 text-center">
        <p className="text-sm text-slate-500 font-medium">
          &copy; {new Date().getFullYear()} Credence Housing Limited. All Rights
          Reserved.
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Surveillance & Reporting System by MIS Department
        </p>
      </div>
    </footer>
  );
};

export default Footer;
