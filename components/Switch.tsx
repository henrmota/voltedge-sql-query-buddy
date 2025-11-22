import { Moon, Sun } from "lucide-react";

interface SwitchProps {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

function Switch({enabled, setEnabled}: SwitchProps) {
  return (
    <button
      onClick={() => setEnabled(!enabled)}
      className={`w-16 h-8 flex cursor-pointer items-center rounded-full p-1 duration-300 transition-colors ${
        enabled ? "bg-dark-bg" : "bg-light-bg"
      }`}
    >
      
      <div
        className={`flex items-center justify-center w-6 h-6 rounded-full shadow-md transform duration-300 transition-colors ${
          enabled ? "translate-x-8 bg-dark-text-primary" : "translate-x-0 bg-light-text-primary"
        }`}
      >
        {enabled ? <Moon size={16} className="text-dark-bg" /> : <Sun size={16} className="text-light-bg" />}
      </div>
    </button>
  );
}

export default Switch;
