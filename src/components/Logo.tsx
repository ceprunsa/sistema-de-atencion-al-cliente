import logoImage from "../assets/logo_ceprunsa.png";
import appConfig from "../config/appConfig";

interface LogoProps {
  className?: string;
  showText?: boolean;
}

const Logo = ({ className = "h-12 w-auto", showText = true }: LogoProps) => {
  return (
    <div className="flex flex-col items-center">
      <img
        src={logoImage || "/placeholder.svg"}
        alt="Logo"
        className={className}
      />
      {showText && (
        <span className="mt-2 text-lg font-semibold text-[#1A2855]">
          {appConfig.fullName}
        </span>
      )}
    </div>
  );
};

export default Logo;
