import React from "react";

interface UserAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  avatarUrl,
  size = "sm",
  className = "",
}) => {
  const sizeClasses = {
    sm: "h-6 w-6 text-[10px]",
    md: "h-8 w-8 text-[10px]",
    lg: "h-12 w-12 text-sm",
  };

  return (
    <div
      className={`relative inline-flex items-center justify-center overflow-hidden bg-indigo-100 text-indigo-700 rounded-full font-bold uppercase shrink-0 ${sizeClasses[size]} ${className}`}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          className="w-full h-full object-cover"
        />
      ) : (
        <span>{name ? name.charAt(0) : "?"}</span>
      )}
    </div>
  );
};
