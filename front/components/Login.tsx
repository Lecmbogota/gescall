import { useState, useEffect, useRef } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  Phone,
  Eye,
  EyeOff,
  Lock,
  User,
  Languages,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { useAuthStore } from "../stores/authStore";
import authService from "../services/authService";
import { sanitizeSessionForLog } from "../utils/sanitizeAuthForLog";
import logoChock from "../logo chock.png";

interface LoginProps {
  onLogin: (username: string) => void;
}

type Language = "es" | "en";

const translations = {
  es: {
    username: "Usuario",
    usernamePlaceholder: "Ingresa tu usuario",
    password: "Contraseña",
    passwordPlaceholder: "Ingresa tu contraseña",
    loginButton: "Iniciar Sesión",
    loggingIn: "Iniciando sesión...",
    welcome: "¡Bienvenido!",
    errorFields: "Por favor completa todos los campos",
    errorCredentials: "Credenciales incorrectas",
  },
  en: {
    username: "Username",
    usernamePlaceholder: "Enter your username",
    password: "Password",
    passwordPlaceholder: "Enter your password",
    loginButton: "Sign In",
    loggingIn: "Signing in...",
    welcome: "Welcome!",
    errorFields: "Please fill in all fields",
    errorCredentials: "Invalid credentials",
  },
};

export function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [language, setLanguage] = useState<Language>("es");
  const [isSuccess, setIsSuccess] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const t = translations[language];

  // Mouse movement effect for parallax and spotlight
  useEffect(() => {
    setIsMounted(true);
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const { clientX, clientY } = e;
      const { innerWidth, innerHeight } = window;

      const x = clientX / innerWidth;
      const y = clientY / innerHeight;

      containerRef.current.style.setProperty('--mouse-x', x.toString());
      containerRef.current.style.setProperty('--mouse-y', y.toString());
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const toggleLanguage = () => {
    setLanguage((prev) => (prev === "es" ? "en" : "es"));
  };

  const { setSession, setCredentials, setError } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username || !password) {
      toast.error(t.errorFields);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('[Login] Attempting login for user:', username);

      // Call the auth service
      const session = await authService.login(username, password, false);

      console.log('[Login] Login successful, session:', sanitizeSessionForLog(session));

      // Store session in Zustand store
      setSession(session);

      // Store credentials for session refresh (optional)
      setCredentials(username, password);

      // Show success message with user info
      const fullName = session.user?.name || username;
      toast.success(`${t.welcome} ${fullName}!`);
      setIsSuccess(true);

      // Call parent callback
      setTimeout(() => {
        onLogin(username);
      }, 2500);

    } catch (error: any) {
      console.error('[Login] Login failed:', error);

      let errorMessage = t.errorCredentials;

      if (error.message) {
        if (error.message.includes('Invalid credentials')) {
          errorMessage = language === 'es' ? 'Usuario o contraseña incorrectos' : 'Invalid username or password';
        } else if (error.message.includes('not found')) {
          errorMessage = language === 'es' ? 'Usuario no encontrado' : 'User not found';
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          errorMessage = language === 'es' ? 'Error de conexión con el servidor' : 'Connection error';
        } else {
          errorMessage = error.message;
        }
      }

      setError(errorMessage);
      toast.error(errorMessage);
      setIsLoading(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`min-h-screen w-screen flex relative overflow-hidden bg-black transition-opacity duration-[2500ms] ease-out ${isMounted && !isSuccess ? 'opacity-100' : 'opacity-0'}`}
    >
      {/* Background Image - Full Screen */}
      <div className="absolute inset-0 z-0 w-full h-full">
        <ImageWithFallback
          src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80"
          alt="Snowy mountain background"
          className="w-full h-full object-cover transition-transform duration-100 ease-out"
          style={{ transform: 'scale(1.1) translate(calc(var(--mouse-x, 0.5) * -15px), calc(var(--mouse-y, 0.5) * -15px))' }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/80" />
      </div>

      {/* Spotlight Effect - Subtler */}
      <div
        className="pointer-events-none absolute inset-0 z-[2] transition-opacity duration-500 ease-in-out"
        style={{
          background: `radial-gradient(circle 800px at calc(var(--mouse-x, 0.5) * 100%) calc(var(--mouse-y, 0.5) * 100%), rgba(255,255,255,0.04), transparent 45%)`
        }}
      />

      {/* Animated particles background - Parallaxed & Subtler */}
      <div className="absolute inset-0 z-[1] opacity-60">
        <div
          className="absolute top-20 left-20 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl animate-pulse transition-transform duration-700 ease-out"
          style={{ transform: 'translate(calc(var(--mouse-x, 0.5) * 15px), calc(var(--mouse-y, 0.5) * 15px))' }}
        />
        <div
          className="absolute bottom-20 right-20 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse transition-transform duration-700 ease-out"
          style={{
            animationDelay: "1s",
            transform: 'translate(calc(var(--mouse-x, 0.5) * -15px), calc(var(--mouse-y, 0.5) * -15px))'
          }}
        />
        <div
          className="absolute top-1/2 left-1/3 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl animate-pulse transition-transform duration-700 ease-out"
          style={{
            animationDelay: "2s",
            transform: 'translate(calc(var(--mouse-x, 0.5) * 20px), calc(var(--mouse-y, 0.5) * 10px))'
          }}
        />
      </div>

      {/* Language Toggle - Top Right */}
      <div className={`absolute top-6 right-6 z-20 transition-all duration-700 delay-500 ${isMounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 shadow-lg hover:bg-white/20 transition-all duration-300 ease-out group"
        >
          <Languages className="w-4 h-4 text-white group-hover:scale-110 transition-transform duration-300 ease-out" />
          <span className="text-white uppercase tracking-wider">
            {language}
          </span>
        </button>
      </div>

      {/* Left Side - Login Form */}
      <div className={`w-full lg:w-1/2 flex items-center justify-center p-4 lg:p-12 relative z-10 perspective-1000 transition-transform duration-[2500ms] ${isSuccess ? 'scale-[2] opacity-0' : ''}`}>
        <Card
          className={`w-full max-w-md shadow-2xl border-white/20 bg-white backdrop-blur-xl relative transition-all duration-[2500ms] ease-out preserve-3d group ${isMounted ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-8'}`}
          style={{
            transform: isMounted && !isSuccess
              ? 'perspective(1000px) rotateX(calc((var(--mouse-y, 0.5) - 0.5) * 8deg)) rotateY(calc((var(--mouse-x, 0.5) - 0.5) * -8deg))'
              : 'perspective(1000px) rotateX(0deg) rotateY(0deg)',
          }}
        >
          {/* Interactive Glow Overlay */}
          <div
            className="absolute inset-0 pointer-events-none rounded-xl z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{
              background: `radial-gradient(circle 600px at calc(var(--mouse-x, 0.5) * 100%) calc(var(--mouse-y, 0.5) * 100%), rgba(255,255,255,0.4), transparent 40%)`,
              mixBlendMode: 'overlay',
            }}
          />

          <CardHeader className="space-y-3 text-center relative z-10">
            <div className="mx-auto w-56 h-24 flex items-center justify-center overflow-hidden rounded-xl">
              <ImageWithFallback
                src={logoChock}
                alt="Chock Telecom Logo"
                className="w-full h-full object-contain select-none pointer-events-none brightness-0"
              />
            </div>
            <CardTitle className="text-slate-900">
              {language === "es"
                ? "Panel de Administración"
                : "Admin Panel"}
            </CardTitle>
            <CardDescription>
              {language === "es"
                ? "Ingresa tus credenciales para continuar"
                : "Enter your credentials to continue"}
            </CardDescription>
          </CardHeader>

          <CardContent className="relative z-10">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">{t.username}</Label>
                <div className="relative group/input">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within/input:text-blue-500 transition-colors" />
                  <Input
                    id="username"
                    placeholder={t.usernamePlaceholder}
                    value={username}
                    onChange={(e) =>
                      setUsername(e.target.value)
                    }
                    className="pl-9 transition-all duration-200 focus:ring-2 focus:ring-blue-500/20"
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t.password}</Label>
                <div className="relative group/input">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within/input:text-blue-500 transition-colors" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={t.passwordPlaceholder}
                    value={password}
                    onChange={(e) =>
                      setPassword(e.target.value)
                    }
                    className="pl-9 pr-9 transition-all duration-200 focus:ring-2 focus:ring-blue-500/20"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(!showPassword)
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 outline-none"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/20 active:scale-[0.98]"
                disabled={isLoading}
              >
                <span className="relative z-10">{isLoading ? t.loggingIn : t.loginButton}</span>
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600 opacity-0 hover:opacity-100 transition-opacity duration-300" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Right Side - Empty space with animated background */}
      <div className="hidden lg:block lg:w-1/2 relative z-10"></div>
    </div>
  );
}