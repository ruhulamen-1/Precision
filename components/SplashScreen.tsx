import React, { useState, useEffect } from "react";
import { User, FeaturedProject } from "../types";

interface SplashScreenProps {
  user: User;
  featuredProjects: FeaturedProject[];
  onAnimationEnd: () => void;
  isExiting: boolean;
}

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
};

const SplashScreen: React.FC<SplashScreenProps> = ({
  user,
  featuredProjects,
  onAnimationEnd,
  isExiting,
}) => {
  const [phase, setPhase] = useState(1);
  const [currentIndex, setCurrentIndex] = useState(0);

  const greeting = getGreeting();
  const firstName = user.name.split(" ")[0];

  useEffect(() => {
    // Timer to cycle images
    if (featuredProjects.length > 1) {
      const imageTimer = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % featuredProjects.length);
      }, 2500); // Cycle faster than dashboard

      return () => clearInterval(imageTimer);
    }
  }, [featuredProjects.length]);

  useEffect(() => {
    // Timer to move to phase 2 (move logo up, show text)
    const timer1 = setTimeout(() => {
      setPhase(2);
    }, 2000); // Wait 2s after initial fade-in

    // Timer to end the splash screen
    const timer2 = setTimeout(() => {
      onAnimationEnd();
    }, 4500); // Total duration of splash screen before it starts to exit

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [onAnimationEnd]);

  const logoClasses = [
    "absolute z-30 transition-all duration-1000 ease-in-out",
    // In phase 1, it's centered. In phase 2, it moves up.
    phase === 1
      ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      : "top-[35%] left-1/2 -translate-x-1/2 -translate-y-1/2",
  ].join(" ");

  const splashContainerClasses = `fixed inset-0 z-40`;
  const foregroundClasses = `absolute inset-0 ${isExiting ? "splash-fade-out" : ""}`;

  return (
    <div className={splashContainerClasses}>
      {/* Background Image - Stays visible during the exit transition */}
      {featuredProjects.map((project, index) => (
        <img
          key={index}
          src={project.image}
          alt={project.title}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out ${index === currentIndex ? "opacity-100 animate-ken-burns" : "opacity-0"}`}
        />
      ))}

      {/* Foreground Container - This is what will fade out */}
      <div className={foregroundClasses}>
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/50 to-black/80 z-10"></div>

        {/* Animated Content */}
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center p-4">
          {/* Logo */}
          <div className={logoClasses}>
            <div className="animate-logo-fade-in flex flex-col items-center">
              <h1 className="font-display text-4xl font-extrabold text-orange-500 uppercase tracking-wider drop-shadow-lg">
                <span className="text-5xl">P</span>recision
              </h1>
              <p className="text-xs text-orange-100/90 tracking-widest uppercase -mt-1 drop-shadow-md">
                Eyes on Every Site
              </p>
            </div>
          </div>

          {/* Greeting & Slogan Text */}
          <div
            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-500 ${phase === 2 ? "opacity-100" : "opacity-0"}`}
          >
            <h2
              style={{ animationDelay: "0.2s" }}
              className="font-serif text-4xl font-bold text-white drop-shadow-lg animate-text-fade-in-up"
            >
              {greeting}, {firstName}
            </h2>
            <div
              style={{ animationDelay: "0.5s" }}
              className="w-32 h-px bg-orange-500 my-4 mx-auto origin-center animate-line-draw"
            ></div>
            <p
              style={{ animationDelay: "0.8s" }}
              className="font-sans text-lg text-white/90 drop-shadow-md animate-text-fade-in-up"
            >
              Your Eyes on Every Site, Ensuring Progress and Precision.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
