import React, { useState } from "react";
import { ShieldCheckIcon, LockIcon, MailIcon } from "lucide-react";
import '../styles/LoginPage.css';

interface LoginPageProps {
  onLogin: (email: string, password: string) => Promise<boolean>;
  isLoading?: boolean;
  error?: string | null;
}

export function LoginPage({ onLogin, isLoading = false, error: externalError }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    
    try {
      const success = await onLogin(email, password);
      if (!success) {
        setError("Invalid credentials. Please try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayError = externalError || error;
  const showLoading = isLoading || isSubmitting;

  return (
    <div className="login-container">
      {/* Animated Background */}
      <div className="bg-animation">
        <div className="bg-circle bg-circle-1"></div>
        <div className="bg-circle bg-circle-2"></div>
        <div className="bg-circle bg-circle-3"></div>
      </div>

      {/* Login Card */}
      <div className="login-card">
        <div className="header">
          <div className="logo-container">
            <img 
              src="/logo.svg" 
              alt="BioSecureLock Logo" 
              className="logo-image"
            />
          </div>
          <h1 className="title">BioSecureLock</h1>
          <p className="subtitle">
            An IoT-Based Biometric Laboratory Smart Locking System with Blockchain Technology
          </p>

          {/* Security Badges */}
          <div className="security-badges">
            <div className="badge">
              <ShieldCheckIcon className="badge-icon" />
              <span>Blockchain Secured</span>
            </div>
            <div className="badge">
              <LockIcon className="badge-icon" />
              <span>End-to-End Encrypted</span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="form">
          {/* Email Input */}
          <div className="input-group">
            <label className="input-label">Email Address</label>
            <div className="input-wrapper">
              <MailIcon className="input-icon" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@lab.edu"
                className="input-field"
                required
                disabled={showLoading}
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="input-group">
            <label className="input-label">Password</label>
            <div className="input-wrapper">
              <LockIcon className="input-icon" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="input-field"
                required
                disabled={showLoading}
              />
            </div>
          </div>

          {/* Error Message */}
          {displayError && (
            <div className="error-message">
              <ShieldCheckIcon style={{ width: '16px', height: '16px' }} />
              {displayError}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className={`btn-primary ${showLoading ? 'btn-disabled' : ''}`}
            disabled={showLoading}
          >
            {showLoading ? "Signing in..." : "Sign In"}
          </button>
        </form>
        
        {/* Footer */}
        <div className="footer">
          <p>© 2024 BioSecureLock. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}