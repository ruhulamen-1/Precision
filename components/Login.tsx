import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Player } from "@lottiefiles/react-lottie-player";
import Spinner from "./Spinner";
import FeedbackMessage from "./FeedbackMessage";
import welcomeAnimation from "../src/welcome-animation.json";

interface LoginProps {
  onLogin: (email: string, password: string) => Promise<boolean>;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LETTERS = "Precision".split("");

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!EMAIL_REGEX.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    setIsLoggingIn(true);
    const success = await onLogin(email, password);
    if (!success) setError("Invalid email or password. Please try again.");
    setIsLoggingIn(false);
  };

  const handleForgotPassword = () => {
    if (!email) {
      setError("Please enter your email address first, then click 'Forgot Password?'.");
      return;
    }
    if (!EMAIL_REGEX.test(email)) {
      setError("Please enter a valid email address to reset the password.");
      return;
    }
    setError("");
    setFeedback({
      message: `If an account with the email ${email} exists, password reset instructions have been sent.`,
      type: "info",
    });
  };

  const hasError = !!error;

  const inputClasses = `
    mt-1 block w-full px-3 py-2.5
    bg-white/10 dark:bg-white/5
    border rounded-xl text-sm
    text-slate-100 placeholder-slate-400
    focus:outline-none focus:ring-2 focus:ring-orange-500/60
    transition-colors duration-150
    ${hasError
      ? "border-red-400/60"
      : "border-white/20 hover:border-white/30 focus:border-orange-500/60"
    }
  `;

  const passwordInputClasses = `
    block w-full px-3 py-2.5 pr-10
    bg-white/10 dark:bg-white/5
    border rounded-xl text-sm
    text-slate-100 placeholder-slate-400
    focus:outline-none focus:ring-2 focus:ring-orange-500/60
    transition-colors duration-150
    ${hasError
      ? "border-red-400/60"
      : "border-white/20 hover:border-white/30 focus:border-orange-500/60"
    }
  `;

  return (
    <>
      {/* ── Fullscreen wrapper ── */}
      <div className="relative min-h-screen overflow-hidden bg-slate-600 flex items-center justify-start">

        {/* ── Fullscreen Lottie background ── */}
        <div className="absolute inset-0 z-0 flex items-center justify-center">
          <Player
            src={welcomeAnimation as any}
            autoplay
            loop
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: 0.55,
            }}
          />
        </div>

        {/* ── Colour glow overlays ── */}
        <div
          className="absolute inset-0 z-[1] pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 60% 50%, rgba(234,88,12,0.12) 0%, transparent 70%), radial-gradient(ellipse 50% 50% at 20% 80%, rgba(251,191,36,0.07) 0%, transparent 60%)",
          }}
        />

        {/* ── Subtle vignette so card is always readable ── */}
        <div
          className="absolute inset-0 z-[2] pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 30%, rgba(2,6,23,0.55) 100%)",
          }}
        />

        {/* ── Left-aligned form card ── */}
        <div className="relative z-10 w-full max-w-md px-8 py-10 ml-0 lg:ml-16 xl:ml-24">

          {/* Logo */}
          <div className="text-center mb-8">
            <motion.h1
              className="font-display text-4xl font-extrabold text-orange-500 uppercase tracking-wider flex items-baseline justify-center gap-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <motion.span
                className="text-5xl inline-block"
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.3 }}
              >
                P
              </motion.span>
              {LETTERS.slice(1).map((letter, i) => (
                <motion.span
                  key={i}
                  className="inline-block"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + i * 0.06, duration: 0.3 }}
                >
                  {letter}
                </motion.span>
              ))}
            </motion.h1>

            <motion.p
              className="text-xs text-slate-400 tracking-widest uppercase -mt-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.0, duration: 0.6 }}
            >
              Eyes on Every Site
            </motion.p>
          </div>

          {/* Glass card */}
          <motion.div
            className="rounded-2xl border border-white/10 p-8 text-slate-100"
            style={{
              background: "rgba(51, 65, 85, 0.65)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
            }}
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.6, ease: "easeOut" }}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
            >
              <h2 className="text-2xl font-bold text-slate-100 text-center">
                Welcome Back
              </h2>
              <p className="text-slate-400 text-center mt-1 text-sm">
                Sign in to continue
              </p>
            </motion.div>

            <motion.form
              onSubmit={handleSubmit}
              className="mt-8 space-y-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.0 }}
            >
              <fieldset disabled={isLoggingIn} className="space-y-6">
                <div className="space-y-4">

                  {/* Email */}
                  <motion.div
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.1 }}
                  >
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-slate-300"
                    >
                      Email Address
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="username"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputClasses}
                      placeholder="you@example.com"
                      aria-invalid={hasError}
                      aria-describedby={hasError ? "login-error" : undefined}
                    />
                  </motion.div>

                  {/* Password */}
                  <motion.div
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.2 }}
                  >
                    <label
                      htmlFor="password"
                      className="block text-sm font-medium text-slate-300"
                    >
                      Password
                    </label>
                    <div className="relative mt-1">
                      <input
                        id="password"
                        name="password"
                        type={isPasswordVisible ? "text" : "password"}
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={passwordInputClasses}
                        placeholder="••••••••"
                        aria-invalid={hasError}
                        aria-describedby={hasError ? "login-error" : undefined}
                      />
                      <button
                        type="button"
                        onClick={() => setIsPasswordVisible((prev) => !prev)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-200 focus:outline-none transition-colors"
                        aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                      >
                        {isPasswordVisible ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zM10 12a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                            <path d="M10 17a9.953 9.953 0 01-4.522-.992l.938-1.172A6.002 6.002 0 0010 15c2.21 0 4.21-.898 5.68-2.356l1.248 1.56A10.005 10.005 0 0110 17z" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.022 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </motion.div>
                </div>

                {/* Error message */}
                <AnimatePresence>
                  {error && (
                    <motion.p
                      id="login-error"
                      role="alert"
                      className="text-sm text-red-300 text-center p-2.5 bg-red-500/10 border border-red-400/20 rounded-xl"
                      initial={{ opacity: 0, y: -8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.25 }}
                    >
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>

                {/* Submit button */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.3 }}
                >
                  <motion.button
                    type="submit"
                    className="w-full flex justify-center items-center px-4 py-3 border border-transparent text-base font-medium rounded-xl text-white bg-orange-600 hover:bg-orange-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 focus:ring-offset-slate-900 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors duration-150"
                    whileHover={{ scale: isLoggingIn ? 1 : 1.02, y: isLoggingIn ? 0 : -1 }}
                    whileTap={{ scale: isLoggingIn ? 1 : 0.98 }}
                  >
                    {isLoggingIn ? <Spinner className="w-5 h-5" /> : "Log In"}
                  </motion.button>
                </motion.div>
              </fieldset>
            </motion.form>

            {/* Forgot password */}
            <motion.div
              className="text-center mt-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.4 }}
            >
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-sm font-medium text-orange-400 hover:text-orange-300 disabled:text-slate-500 transition-colors"
                disabled={isLoggingIn}
              >
                Forgot Password?
              </button>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {feedback && (
        <FeedbackMessage
          message={feedback.message}
          type={feedback.type}
          onDismiss={() => setFeedback(null)}
        />
      )}
    </>
  );
};

export default Login;
