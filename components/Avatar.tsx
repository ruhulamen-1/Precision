import React from "react";

interface AvatarProps {
  name: string;
}

const Avatar: React.FC<AvatarProps> = ({ name }) => {
  // Get initials from the name, e.g., "Ruhul Amen" -> "RA"
  const initials =
    name
      .match(/\b(\w)/g)
      ?.join("")
      .slice(0, 2)
      .toUpperCase() || "??";

  return (
    <div className="w-10 h-10 rounded-full bg-orange-100 border-2 border-white flex items-center justify-center shadow-inner">
      <span className="font-semibold text-sm text-orange-600">{initials}</span>
    </div>
  );
};

export default Avatar;
