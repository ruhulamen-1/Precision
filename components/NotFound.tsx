import React from "react";
import { Player } from "@lottiefiles/react-lottie-player";
import catLoveAnimation from "../src/cat-love-animation.json";

interface NotFoundProps {
  onGoHome?: () => void;
}

const NotFound: React.FC<NotFoundProps> = ({ onGoHome }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center">
      <Player
        src={catLoveAnimation as any}
        autoplay
        loop
        style={{ width: 280, height: 280 }}
        background="transparent"
      />
      <h2 className="mt-2 text-2xl font-bold text-slate-800">
        404 - Page Not Found
      </h2>
      <p className="mt-2 text-slate-600 max-w-md">
        দুঃখিত, আপনি যে পেজটি খুঁজছেন তা খুঁজে পাওয়া যায়নি।
      </p>
      {onGoHome && (
        <button
          onClick={onGoHome}
          className="mt-6 px-5 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
        >
          Go to Dashboard
        </button>
      )}
    </div>
  );
};

export default NotFound;
