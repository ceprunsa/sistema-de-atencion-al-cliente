"use client";

import { Menu } from "lucide-react";
import Logo from "./Logo";
import { Link } from "react-router-dom";

interface MobileHeaderProps {
  onOpenSidebar: () => void;
  appName?: string;
}

const MobileHeader = ({
  onOpenSidebar,
  appName = "CEPRUNSA",
}: MobileHeaderProps) => {
  return (
    <header className="sticky top-0 z-20 bg-white shadow-sm md:hidden">
      <div className="flex items-center justify-between px-4 h-16">
        <button
          onClick={onOpenSidebar}
          className="p-2 rounded-md text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary transition-colors duration-200"
          aria-label="Abrir menú"
        >
          <Menu size={24} />
        </button>
        <Link to="/dashboard" className="flex items-center justify-center">
          <div className="flex items-center">
            <Logo className="h-10 w-auto" showText={false} />
            <span className="ml-2 font-semibold text-[#1A2855]">{appName}</span>
          </div>
        </Link>
        <div className="w-10"></div> {/* Spacer for balance */}
      </div>
    </header>
  );
};

export default MobileHeader;
