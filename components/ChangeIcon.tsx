import React from "react";

interface ChangeIconProps {
  value: string;
}

const ChangeIcon: React.FC<ChangeIconProps> = ({ value }) => {
  if (!value || typeof value !== "string") {
    return null;
  }

  const isIncrease = value.startsWith("▲");
  const isDecrease = value.startsWith("▼");

  let colorClass = "text-slate-600 font-semibold";
  if (isIncrease) {
    colorClass = "text-green-600 font-bold";
  } else if (isDecrease) {
    colorClass = "text-red-600 font-bold";
  }

  return <span className={colorClass}>{value}</span>;
};

export default ChangeIcon;
